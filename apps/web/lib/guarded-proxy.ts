/**
 * In-process forward proxy that pins headless Chromium's network egress to
 * public addresses.
 *
 * Request interception checks a URL in Node, but Chromium then resolves the
 * name again on its own, so a DNS-rebinding host can pass the check and then
 * connect to 127.0.0.1 or 169.254.169.254. Routing Chromium through this proxy
 * moves every resolution into Node: Chromium hands the proxy a hostname (it
 * does not resolve names itself when an HTTP proxy is set), the proxy resolves
 * it with the url-guard rules, refuses non-public answers, and connects to the
 * exact IP it validated. Covers plain HTTP (absolute-form requests) and
 * everything tunnelled with CONNECT (HTTPS, wss/ws, requests from workers).
 *
 * Bound to 127.0.0.1 on an ephemeral port. Launch Chromium with
 * `--proxy-server=<url>` and `--proxy-bypass-list=<-loopback>` so loopback
 * targets go through the proxy too (and get refused).
 */
import http from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import {
  UnsafeUrlError,
  checkUrlSyntax,
  resolvePublicAddresses,
  systemLookupAll,
  type LookupAll,
} from "./url-guard";

export interface GuardedProxy {
  /** e.g. "http://127.0.0.1:53124" */
  url: string;
  port: number;
  close(): Promise<void>;
}

export interface GuardedProxyOptions {
  lookup?: LookupAll;
  /** Upstream connect timeout. */
  connectTimeoutMs?: number;
  /** Idle timeout on client and upstream sockets. */
  idleTimeoutMs?: number;
  /**
   * Opens the TCP connection to an already-validated address. Tests swap this
   * to reach a local server without touching the network.
   */
  dial?: (address: string, port: number) => net.Socket;
}

export type ProxyTarget = { host: string; address: string; family: number; port: number };

/** Hop-by-hop and proxy-only headers that must not be forwarded upstream. */
const HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authorization",
  "proxy-authenticate",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * Validate a target and resolve it to one public address, or throw
 * UnsafeUrlError. `rawUrl` is an absolute http(s) URL; the port defaults
 * from the scheme.
 */
export async function resolveProxyTarget(rawUrl: string, lookup: LookupAll = systemLookupAll): Promise<ProxyTarget> {
  const syntax = checkUrlSyntax(rawUrl);
  if (!syntax.ok) throw new UnsafeUrlError(syntax.reason);
  const port = Number(syntax.url.port || (syntax.url.protocol === "https:" ? 443 : 80));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new UnsafeUrlError("bad port");
  if (syntax.ip) {
    return { host: syntax.host, address: syntax.ip, family: syntax.ip.includes(":") ? 6 : 4, port };
  }
  const [first] = await resolvePublicAddresses(syntax.host, lookup);
  return { host: syntax.host, address: first.address, family: first.family, port };
}

/** "host:port" from a CONNECT request line, as an absolute URL for the checks. */
function connectAuthorityToUrl(authority: string): string | null {
  if (!authority || /[\s/?#@]/.test(authority)) return null;
  // Must carry an explicit port: "example.com:443" or "[2606:4700::1]:443".
  if (!/:\d{1,5}$/.test(authority)) return null;
  return `https://${authority}/`;
}

const defaultDial = (address: string, port: number) => net.connect({ host: address, port });

export async function startGuardedProxy(options: GuardedProxyOptions = {}): Promise<GuardedProxy> {
  const lookup = options.lookup ?? systemLookupAll;
  const connectTimeoutMs = options.connectTimeoutMs ?? 15_000;
  const idleTimeoutMs = options.idleTimeoutMs ?? 60_000;
  const dial = options.dial ?? defaultDial;
  const open = new Set<Duplex>();

  const track = (s: Duplex) => {
    open.add(s);
    s.on("close", () => open.delete(s));
    s.on("error", () => s.destroy());
  };

  const dialChecked = (target: ProxyTarget): Promise<net.Socket> =>
    new Promise((resolve, reject) => {
      const sock = dial(target.address, target.port);
      track(sock);
      const timer = setTimeout(() => {
        sock.destroy();
        reject(new Error("connect timeout"));
      }, connectTimeoutMs);
      sock.once("connect", () => {
        clearTimeout(timer);
        sock.setTimeout(idleTimeoutMs, () => sock.destroy());
        resolve(sock);
      });
      sock.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

  const server = http.createServer();
  server.on("connection", (s) => {
    track(s);
    s.setTimeout(idleTimeoutMs, () => s.destroy());
  });

  // Plain HTTP through the proxy: "GET http://host/path HTTP/1.1".
  server.on("request", async (req, res) => {
    const deny = (status: number, reason: string) => {
      if (!res.headersSent) res.writeHead(status, { "Content-Type": "text/plain", Connection: "close" });
      res.end(`Blocked by crawler egress guard: ${reason}\n`);
    };
    const raw = req.url || "";
    if (!/^http:\/\//i.test(raw)) return deny(400, "absolute http URL required");
    let target: ProxyTarget;
    try {
      target = await resolveProxyTarget(raw, lookup);
    } catch (err) {
      return deny(403, err instanceof Error ? err.message : "blocked");
    }
    let upstreamSocket: net.Socket;
    try {
      upstreamSocket = await dialChecked(target);
    } catch {
      return deny(502, "upstream unreachable");
    }
    const url = new URL(raw);
    const headers: http.OutgoingHttpHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_HEADERS.has(k.toLowerCase()) && v !== undefined) headers[k] = v;
    }
    headers.host = url.host;
    headers.connection = "close";
    const upstream = http.request({
      method: req.method,
      path: `${url.pathname}${url.search}`,
      headers,
      // Connect only to the address validated above (no second lookup).
      createConnection: () => upstreamSocket,
    });
    upstream.on("response", (up) => {
      const out: http.OutgoingHttpHeaders = {};
      for (const [k, v] of Object.entries(up.headers)) {
        if (!HOP_HEADERS.has(k.toLowerCase()) && v !== undefined) out[k] = v;
      }
      res.writeHead(up.statusCode ?? 502, out);
      up.pipe(res);
    });
    upstream.on("error", () => deny(502, "upstream error"));
    req.pipe(upstream);
  });

  // Tunnels: HTTPS, wss/ws, anything else Chromium sends with CONNECT.
  server.on("connect", async (req, clientSocket: Duplex, head: Buffer) => {
    const refuse = (status: string) => {
      clientSocket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    const asUrl = connectAuthorityToUrl(req.url || "");
    if (!asUrl) return refuse("400 Bad Request");
    let target: ProxyTarget;
    try {
      target = await resolveProxyTarget(asUrl, lookup);
    } catch {
      return refuse("403 Forbidden");
    }
    let upstream: net.Socket;
    try {
      upstream = await dialChecked(target);
    } catch {
      return refuse("502 Bad Gateway");
    }
    if (clientSocket.destroyed) {
      upstream.destroy();
      return;
    }
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
    upstream.on("close", () => clientSocket.destroy());
    clientSocket.on("close", () => upstream.destroy());
  });

  // Upgrades sent as plain proxied HTTP (not CONNECT) are not supported.
  server.on("upgrade", (_req, socket: Duplex) => {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const port = (server.address() as net.AddressInfo).port;

  let closed: Promise<void> | null = null;
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close() {
      if (!closed) {
        closed = new Promise<void>((resolve) => {
          server.close(() => resolve());
          for (const s of open) s.destroy();
        });
      }
      return closed;
    },
  };
}

/**
 * Chromium flags that send all traffic, loopback included, through the proxy
 * and keep WebRTC from sending UDP around it.
 */
export function chromiumProxyArgs(proxyUrl: string): string[] {
  return [
    `--proxy-server=${proxyUrl}`,
    // Chromium bypasses the proxy for loopback by default; "<-loopback>" turns
    // that off so localhost/127.0.0.1 also reach the proxy (and get refused).
    "--proxy-bypass-list=<-loopback>",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--webrtc-ip-handling-policy=disable_non_proxied_udp",
  ];
}
