/**
 * SSRF guard for server-side fetches of user-supplied URLs.
 *
 * A URL is allowed only when it is http(s), carries no credentials, and its
 * host is (or resolves exclusively to) public unicast addresses. Every
 * redirect hop is re-checked, and the guarded fetch validates addresses inside
 * the socket's DNS lookup so a hostname cannot be re-pointed (DNS rebinding)
 * between the check and the connection.
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

// ---------------------------------------------------------------------------
// IP parsing and classification
// ---------------------------------------------------------------------------

/**
 * Parse an IPv4 literal the way inet_aton / the WHATWG URL parser do:
 * 1-4 dot-separated parts, each decimal, octal (leading 0) or hex (0x).
 * "2130706433", "0x7f.1", "0177.0.0.1" and "127.1" all give 127.0.0.1.
 * Returns the address as an unsigned 32-bit number, or null.
 */
export function parseIPv4Literal(input: string): number | null {
  if (!input) return null;
  const host = input.endsWith(".") ? input.slice(0, -1) : input;
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!part) return null;
    let n: number;
    if (/^0x[0-9a-f]*$/i.test(part)) n = part.length === 2 ? 0 : parseInt(part.slice(2), 16);
    else if (/^0[0-7]+$/.test(part)) n = parseInt(part.slice(1), 8);
    else if (/^(0|[1-9][0-9]*)$/.test(part)) n = parseInt(part, 10);
    else return null;
    if (!Number.isFinite(n)) return null;
    nums.push(n);
  }
  const last = nums.pop()!;
  if (nums.some((n) => n > 255)) return null;
  if (last >= 2 ** (8 * (4 - nums.length))) return null;
  let value = last;
  nums.forEach((n, i) => {
    value += n * 2 ** (8 * (3 - i));
  });
  return value >>> 0;
}

function ipv4ToString(value: number): string {
  return [24, 16, 8, 0].map((s) => (value >>> s) & 255).join(".");
}

function inV4(value: number, base: string, bits: number): boolean {
  const b = parseIPv4Literal(base)!;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return ((value & mask) >>> 0) === ((b & mask) >>> 0);
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network" / unspecified
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

export function isBlockedIPv4(value: number): boolean {
  return BLOCKED_V4.some(([base, bits]) => inV4(value, base, bits));
}

/** Parse an IPv6 address (optionally bracketed / with zone id) to 8 groups. */
export function parseIPv6(input: string): number[] | null {
  let s = input.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (!s.includes(":") || !/^[0-9a-f:.]+$/i.test(s)) return null;

  let tail: number[] = [];
  const lastColon = s.lastIndexOf(":");
  const lastPart = s.slice(lastColon + 1);
  if (lastPart.includes(".")) {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(lastPart)) return null;
    const octets = lastPart.split(".").map(Number);
    if (octets.some((o) => o > 255)) return null;
    tail = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
    // Drop the dotted tail; keep a "::" if it directly preceded it.
    s = s.slice(0, lastColon + 1);
    if (!s.endsWith("::")) s = s.slice(0, -1);
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parseGroups = (str: string) =>
    str === "" ? [] : str.split(":").map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN));
  const head = parseGroups(halves[0]);
  const rest = halves.length === 2 ? parseGroups(halves[1]) : [];
  if ([...head, ...rest].some((g) => Number.isNaN(g))) return null;

  const total = head.length + rest.length + tail.length;
  let groups: number[];
  if (halves.length === 2) {
    if (total > 7) return null;
    groups = [...head, ...new Array(8 - total).fill(0), ...rest, ...tail];
  } else {
    if (total !== 8) return null;
    groups = [...head, ...tail];
  }
  return groups.length === 8 ? groups : null;
}

function embeddedV4(groups: number[], hiIndex: number): number {
  return ((groups[hiIndex] << 16) | groups[hiIndex + 1]) >>> 0;
}

export function isBlockedIPv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5] = groups;
  const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  // ::/96 covers :: (unspecified), ::1 (loopback) and deprecated IPv4-compatible.
  if (firstFiveZero && g5 === 0) return true;
  // ::ffff:0:0/96 IPv4-mapped -> classify the embedded IPv4.
  if (firstFiveZero && g5 === 0xffff) return isBlockedIPv4(embeddedV4(groups, 6));
  // ::ffff:0:0:0/96 IPv4-translated (SIIT).
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) return true;
  // 64:ff9b::/96 NAT64 well-known prefix -> embedded IPv4.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isBlockedIPv4(embeddedV4(groups, 6));
  }
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 1) return true; // 64:ff9b:1::/48 local NAT64
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // 100::/64 discard
  if (g0 === 0x2001 && g1 === 0) return true; // 2001::/32 Teredo
  if (g0 === 0x2001 && g1 === 0xdb8) return true; // 2001:db8::/32 documentation
  if (g0 === 0x2002) return isBlockedIPv4(embeddedV4(groups, 1)); // 6to4 -> embedded IPv4
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/**
 * True when `ip` is not a public unicast address. Unparseable input counts as
 * blocked so callers fail closed.
 */
export function isBlockedIp(ip: string): boolean {
  const raw = (ip || "").trim().replace(/^\[|\]$/g, "");
  if (!raw) return true;
  if (raw.includes(":")) {
    const groups = parseIPv6(raw);
    return groups ? isBlockedIPv6(groups) : true;
  }
  const v4 = parseIPv4Literal(raw);
  return v4 === null ? true : isBlockedIPv4(v4);
}

// ---------------------------------------------------------------------------
// URL checks
// ---------------------------------------------------------------------------

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa", ".arpa"];

export type UrlSyntaxCheck =
  | { ok: true; url: URL; host: string; ip: string | null }
  | { ok: false; reason: string };

/** Synchronous checks that need no DNS: scheme, credentials, host shape, IP literals. */
export function checkUrlSyntax(raw: string | URL): UrlSyntaxCheck {
  let url: URL;
  try {
    url = typeof raw === "string" ? new URL(raw) : new URL(raw.toString());
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "scheme not allowed" };
  if (url.username || url.password) return { ok: false, reason: "credentials in URL" };

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return { ok: false, reason: "missing host" };

  if (host.includes(":")) {
    return isBlockedIp(host) ? { ok: false, reason: "non-public address" } : { ok: true, url, host, ip: host };
  }
  const v4 = parseIPv4Literal(host);
  if (v4 !== null) {
    const ip = ipv4ToString(v4);
    return isBlockedIPv4(v4) ? { ok: false, reason: "non-public address" } : { ok: true, url, host, ip };
  }
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "internal hostname" };
  }
  // Single-label names resolve through local search domains.
  if (!host.includes(".")) return { ok: false, reason: "internal hostname" };
  return { ok: true, url, host, ip: null };
}

export type LookupAddress = { address: string; family: number };
export type LookupAll = (hostname: string) => Promise<LookupAddress[]>;

export const systemLookupAll: LookupAll = (hostname) =>
  dns.promises.lookup(hostname, { all: true, verbatim: true });

/** Resolve all A/AAAA records and require every one to be public. */
export async function resolvePublicAddresses(host: string, lookup: LookupAll = systemLookupAll): Promise<LookupAddress[]> {
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new UnsafeUrlError("host does not resolve");
  }
  if (!addresses.length) throw new UnsafeUrlError("host does not resolve");
  if (addresses.some((a) => isBlockedIp(a.address))) {
    throw new UnsafeUrlError("host resolves to a non-public address");
  }
  return addresses;
}

/** Throws UnsafeUrlError unless the URL is http(s), credential-free and public. */
export async function assertPublicUrl(
  raw: string | URL,
  options: { lookup?: LookupAll } = {}
): Promise<{ url: URL; addresses: LookupAddress[] }> {
  const syntax = checkUrlSyntax(raw);
  if (!syntax.ok) throw new UnsafeUrlError(syntax.reason);
  if (syntax.ip) {
    return { url: syntax.url, addresses: [{ address: syntax.ip, family: syntax.ip.includes(":") ? 6 : 4 }] };
  }
  const addresses = await resolvePublicAddresses(syntax.host, options.lookup);
  return { url: syntax.url, addresses };
}

export async function isPublicUrl(raw: string | URL, options: { lookup?: LookupAll } = {}): Promise<boolean> {
  try {
    await assertPublicUrl(raw, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * A node `lookup` for http(s).request / net.connect that only ever hands back
 * public addresses, validated at connect time (defeats DNS rebinding).
 */
export function createGuardedLookup(lookup: LookupAll = systemLookupAll): net.LookupFunction {
  return ((hostname: string, options: any, callback: any) => {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "object" && options ? options : {};
    resolvePublicAddresses(hostname, lookup)
      .then((addresses) => {
        const family = typeof opts.family === "number" && opts.family ? opts.family : 0;
        const usable = family ? addresses.filter((a) => a.family === family) : addresses;
        if (!usable.length) throw new UnsafeUrlError("no usable address");
        if (opts.all) cb(null, usable);
        else cb(null, usable[0].address, usable[0].family);
      })
      .catch((err) => cb(err));
  }) as net.LookupFunction;
}

// ---------------------------------------------------------------------------
// Guarded fetch
// ---------------------------------------------------------------------------

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  lookup?: LookupAll;
}

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type RawResponse = { status: number; headers: http.IncomingHttpHeaders; stream: Readable };

function requestOnce(
  url: URL,
  headers: Record<string, string>,
  lookup: net.LookupFunction,
  signal: AbortSignal
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        headers: { ...headers, "Accept-Encoding": "gzip, deflate, br" },
        lookup,
        signal,
        // TLS verification stays on (Node default rejectUnauthorized: true).
      },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, stream: res })
    );
    req.on("error", reject);
    req.end();
  });
}

async function readBody(res: RawResponse, maxBytes: number): Promise<string> {
  const encoding = String(res.headers["content-encoding"] || "").toLowerCase().trim();
  let stream: Readable = res.stream;
  if (encoding === "gzip" || encoding === "x-gzip") stream = res.stream.pipe(zlib.createGunzip());
  else if (encoding === "deflate") stream = res.stream.pipe(zlib.createInflate());
  else if (encoding === "br") stream = res.stream.pipe(zlib.createBrotliDecompress());

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > maxBytes) {
      chunks.push(buf.subarray(0, buf.length - (size - maxBytes)));
      res.stream.destroy();
      break;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * GET a user-supplied URL with SSRF protection: the initial URL and every
 * redirect hop are checked, and connections only go to validated public IPs.
 * Returns null for unsafe URLs, network errors, timeouts and non-2xx answers.
 */
export async function safeFetchText(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult | null> {
  const {
    headers = {},
    timeoutMs = 12_000,
    maxRedirects = 5,
    maxBytes = 3 * 1024 * 1024,
    lookup = systemLookupAll,
  } = options;
  const guardedLookup = createGuardedLookup(lookup);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let current = rawUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const { url } = await assertPublicUrl(current, { lookup });
      const res = await requestOnce(url, headers, guardedLookup, controller.signal);

      if (REDIRECT_STATUSES.has(res.status)) {
        res.stream.resume();
        const location = res.headers.location;
        if (!location) return null;
        current = new URL(location, url).toString();
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        res.stream.resume();
        return null;
      }
      const body = await readBody(res, maxBytes);
      return {
        url: url.toString(),
        status: res.status,
        contentType: String(res.headers["content-type"] || ""),
        body,
      };
    }
    return null; // too many redirects
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
