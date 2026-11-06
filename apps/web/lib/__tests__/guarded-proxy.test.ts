import http from "node:http";
import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chromiumProxyArgs, resolveProxyTarget, startGuardedProxy, type GuardedProxy } from "../guarded-proxy";
import type { LookupAll } from "../url-guard";

/*
 * The proxy is exercised over loopback only. A fake DNS maps test names to
 * public or internal IPs, and a fake `dial` sends "public" connections to a
 * local server, so nothing touches the real network.
 */

const PUBLIC_IP = "93.184.216.34";

const fakeDns: Record<string, string[]> = {
  "public.example": [PUBLIC_IP],
  "rebind.example": ["127.0.0.1"],
  "metadata.example": ["169.254.169.254"],
  "mixed.example": [PUBLIC_IP, "10.0.0.5"],
  "v6local.example": ["::1"],
};
const lookup: LookupAll = async (host) => {
  const ips = fakeDns[host];
  if (!ips) throw new Error("ENOTFOUND");
  return ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
};

let upstream: http.Server;
let upstreamPort = 0;
let proxy: GuardedProxy;
let dialed: Array<{ address: string; port: number }>;

beforeEach(async () => {
  dialed = [];
  upstream = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`upstream saw ${req.method} ${req.url} host=${req.headers.host} proxyauth=${req.headers["proxy-authorization"] ?? "none"}`);
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", () => r()));
  upstreamPort = (upstream.address() as net.AddressInfo).port;
  proxy = await startGuardedProxy({
    lookup,
    connectTimeoutMs: 2_000,
    dial: (address, port) => {
      dialed.push({ address, port });
      // Only validated public addresses ever reach dial; route them locally.
      return net.connect({ host: "127.0.0.1", port: upstreamPort });
    },
  });
});

afterEach(async () => {
  await proxy.close();
  await new Promise<void>((r) => upstream.close(() => r()));
});

/** Send a CONNECT and return the proxy's status line (and the socket if accepted). */
function sendConnect(authority: string): Promise<{ status: string; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: proxy.port }, () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    });
    let buf = "";
    const onData = (d: Buffer) => {
      buf += d.toString("latin1");
      const end = buf.indexOf("\r\n\r\n");
      if (end !== -1) {
        socket.off("data", onData);
        resolve({ status: buf.split("\r\n")[0], socket });
      }
    };
    socket.on("data", onData);
    socket.on("error", reject);
  });
}

/** Plain HTTP request through the proxy (absolute-form URL). */
function proxiedGet(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: proxy.port, method: "GET", path: url, headers: { Host: new URL(url).host, ...headers } },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("guarded egress proxy: CONNECT", () => {
  it.each([
    ["127.0.0.1:443"],
    ["localhost:443"],
    ["169.254.169.254:80"],
    ["[::1]:443"],
    ["10.0.0.1:5432"],
    ["rebind.example:443"], // name that resolves to loopback at connect time
    ["metadata.example:80"],
    ["mixed.example:443"], // any non-public answer fails the whole name
    ["v6local.example:443"],
    ["unknown.example:443"],
    ["intranet:443"], // single-label names
  ])("refuses %s", async (authority) => {
    const { status, socket } = await sendConnect(authority);
    socket.destroy();
    expect(status).toMatch(/^HTTP\/1\.1 403/);
    expect(dialed).toEqual([]);
  });

  it("refuses CONNECT without an explicit port", async () => {
    const { status, socket } = await sendConnect("public.example");
    socket.destroy();
    expect(status).toMatch(/^HTTP\/1\.1 400/);
  });

  it("tunnels to a public host, connecting to the IP it validated", async () => {
    const { status, socket } = await sendConnect("public.example:443");
    expect(status).toBe("HTTP/1.1 200 Connection Established");
    expect(dialed).toEqual([{ address: PUBLIC_IP, port: 443 }]);
    // Bytes flow through the tunnel to the (local stand-in) upstream.
    const reply = await new Promise<string>((resolve) => {
      let out = "";
      socket.on("data", (d) => {
        out += d.toString();
        if (out.includes("upstream saw")) resolve(out);
      });
      socket.write("GET /tunnelled HTTP/1.1\r\nHost: public.example\r\nConnection: close\r\n\r\n");
    });
    socket.destroy();
    expect(reply).toContain("upstream saw GET /tunnelled host=public.example");
  });
});

describe("guarded egress proxy: plain HTTP", () => {
  it.each([
    ["http://127.0.0.1:3005/"],
    ["http://localhost/"],
    ["http://169.254.169.254/latest/meta-data/"],
    ["http://2130706433/"],
    ["http://rebind.example/"],
    ["http://metadata.example/latest/meta-data/"],
  ])("refuses %s", async (url) => {
    const r = await proxiedGet(url);
    expect(r.status).toBe(403);
    expect(dialed).toEqual([]);
  });

  it("refuses origin-form requests aimed at the proxy itself", async () => {
    const r = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: proxy.port, path: "/" }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    expect(r).toBe(400);
  });

  it("forwards to a public host and strips proxy headers", async () => {
    const r = await proxiedGet("http://public.example/page?q=1", { "Proxy-Authorization": "Basic secret" });
    expect(r.status).toBe(200);
    expect(r.body).toBe("upstream saw GET /page?q=1 host=public.example proxyauth=none");
    expect(dialed).toEqual([{ address: PUBLIC_IP, port: 80 }]);
  });
});

describe("resolveProxyTarget", () => {
  it("pins the resolved public address and default ports", async () => {
    await expect(resolveProxyTarget("https://public.example/", lookup)).resolves.toMatchObject({
      address: PUBLIC_IP,
      port: 443,
    });
    await expect(resolveProxyTarget("http://public.example:8080/", lookup)).resolves.toMatchObject({ port: 8080 });
    await expect(resolveProxyTarget("http://rebind.example/", lookup)).rejects.toThrow();
    await expect(resolveProxyTarget("ftp://public.example/", lookup)).rejects.toThrow();
  });
});

describe("chromiumProxyArgs", () => {
  it("routes everything, loopback included, through the proxy", () => {
    const args = chromiumProxyArgs("http://127.0.0.1:1234");
    expect(args).toContain("--proxy-server=http://127.0.0.1:1234");
    expect(args).toContain("--proxy-bypass-list=<-loopback>");
  });
});

describe("HeadlessRenderer uses the proxy and tears it down with the browser", () => {
  it("launches Chromium through the proxy and closes both", async () => {
    vi.resetModules();
    const crawler = await import("../gtm-crawler");
    const proxyClose = vi.fn(async () => undefined);
    const browserClose = vi.fn(async () => undefined);
    let launchArgs: string[] = [];
    crawler.headlessDeps.resolveExecutable = () => "/fake/chromium";
    crawler.headlessDeps.startProxy = async () => ({ url: "http://127.0.0.1:4321", port: 4321, close: proxyClose });
    crawler.headlessDeps.loadPuppeteer = async () => ({
      launch: async (opts: { args: string[] }) => {
        launchArgs = opts.args;
        return {
          close: browserClose,
          newPage: async () => {
            throw new Error("no pages in this test");
          },
        };
      },
    });
    const renderer = new crawler.HeadlessRenderer();
    expect(await renderer.render("https://public.example/")).toBeNull();
    expect(launchArgs).toContain("--proxy-server=http://127.0.0.1:4321");
    expect(launchArgs).toContain("--proxy-bypass-list=<-loopback>");
    await renderer.close();
    expect(browserClose).toHaveBeenCalledTimes(1);
    expect(proxyClose).toHaveBeenCalledTimes(1);
  });

  it("closes the proxy when Chromium fails to launch", async () => {
    vi.resetModules();
    const crawler = await import("../gtm-crawler");
    const proxyClose = vi.fn(async () => undefined);
    crawler.headlessDeps.resolveExecutable = () => "/fake/chromium";
    crawler.headlessDeps.startProxy = async () => ({ url: "http://127.0.0.1:4321", port: 4321, close: proxyClose });
    crawler.headlessDeps.loadPuppeteer = async () => ({
      launch: async () => {
        throw new Error("boom");
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const renderer = new crawler.HeadlessRenderer();
    expect(await renderer.render("https://public.example/")).toBeNull();
    expect(proxyClose).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
