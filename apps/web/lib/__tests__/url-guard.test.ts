import http from "node:http";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPublicUrl,
  checkUrlSyntax,
  createGuardedLookup,
  isBlockedIp,
  isPublicUrl,
  parseIPv4Literal,
  parseIPv6,
  safeFetchText,
  type LookupAll,
} from "../url-guard";

const PUBLIC_V4 = "93.184.216.34";
const lookupTable =
  (table: Record<string, string[]>): LookupAll =>
  async (host) => {
    const ips = table[host];
    if (!ips) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };

describe("parseIPv4Literal", () => {
  it("parses inet_aton forms", () => {
    const loop = 0x7f000001;
    expect(parseIPv4Literal("127.0.0.1")).toBe(loop);
    expect(parseIPv4Literal("2130706433")).toBe(loop);
    expect(parseIPv4Literal("0x7f000001")).toBe(loop);
    expect(parseIPv4Literal("0x7f.1")).toBe(loop);
    expect(parseIPv4Literal("0177.0.0.1")).toBe(loop);
    expect(parseIPv4Literal("127.1")).toBe(loop);
    expect(parseIPv4Literal("example.com")).toBeNull();
    expect(parseIPv4Literal("256.1.1.1")).toBeNull();
    expect(parseIPv4Literal("1.2.3.4.5")).toBeNull();
  });
});

describe("parseIPv6", () => {
  it("parses compressed, full and dotted forms", () => {
    expect(parseIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("[fe80::1%eth0]")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("::ffff:169.254.169.254")).toEqual([0, 0, 0, 0, 0, 0xffff, 0xa9fe, 0xa9fe]);
    expect(parseIPv6("1:2:3:4:5:6:7:8")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parseIPv6("1:2:3:4:5:6:1.2.3.4")).toEqual([1, 2, 3, 4, 5, 6, 0x102, 0x304]);
    expect(parseIPv6("1::2::3")).toBeNull();
    expect(parseIPv6("12345::")).toBeNull();
  });
});

describe("isBlockedIp", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "224.0.0.1",
    "239.255.255.250",
    "255.255.255.255",
    "198.18.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:a9fe:a9fe",
    "::ffff:10.0.0.1",
    "64:ff9b::a9fe:a9fe",
    "2002:7f00:0001::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "not-an-ip",
    "",
  ])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "100.128.0.1", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows public %s",
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    }
  );
});

describe("checkUrlSyntax", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com/",
    "javascript:alert(1)",
    "gopher://example.com/",
    "https://user:pass@example.com/",
    "https://user@example.com/",
    "http://localhost:3005/",
    "http://app.localhost/",
    "http://metadata.google.internal/",
    "http://printer.local/",
    "http://intranet/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://0177.0.0.1/",
    "http://127.1/",
    "http://0/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:a9fe:a9fe]/",
    "http://[::ffff:169.254.169.254]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://100.64.0.1/",
    "not a url",
  ])("rejects %s", (url) => {
    expect(checkUrlSyntax(url).ok).toBe(false);
  });

  it("accepts public hostnames and IPs", () => {
    expect(checkUrlSyntax("https://stripe.com/pricing").ok).toBe(true);
    expect(checkUrlSyntax(`http://${PUBLIC_V4}/`).ok).toBe(true);
  });
});

describe("assertPublicUrl", () => {
  const lookup = lookupTable({
    "good.example": [PUBLIC_V4, "2606:4700:4700::1111"],
    "rebind.example": [PUBLIC_V4, "127.0.0.1"],
    "meta.example": ["169.254.169.254"],
    "mapped.example": ["::ffff:7f00:1"],
    "ula.example": ["fd00::1"],
  });

  it("allows hosts whose every record is public", async () => {
    await expect(assertPublicUrl("https://good.example/x", { lookup })).resolves.toMatchObject({
      addresses: expect.any(Array),
    });
  });

  it("rejects when any A/AAAA record is non-public", async () => {
    for (const host of ["rebind.example", "meta.example", "mapped.example", "ula.example"]) {
      expect(await isPublicUrl(`https://${host}/`, { lookup })).toBe(false);
    }
  });

  it("rejects unresolvable hosts", async () => {
    expect(await isPublicUrl("https://nxdomain.example/", { lookup })).toBe(false);
  });

  it("does not resolve IP literals", async () => {
    const spy = vi.fn(lookup);
    await assertPublicUrl(`http://${PUBLIC_V4}/`, { lookup: spy });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("createGuardedLookup", () => {
  const lookup = lookupTable({ "good.example": [PUBLIC_V4], "evil.example": ["10.0.0.1"] });
  const guarded = createGuardedLookup(lookup) as any;

  it("returns public addresses in both callback shapes", async () => {
    const single = await new Promise<any[]>((r) => guarded("good.example", {}, (...a: any[]) => r(a)));
    expect(single).toEqual([null, PUBLIC_V4, 4]);
    const all = await new Promise<any[]>((r) => guarded("good.example", { all: true }, (...a: any[]) => r(a)));
    expect(all).toEqual([null, [{ address: PUBLIC_V4, family: 4 }]]);
  });

  it("fails the connection for private answers (DNS rebinding at connect time)", async () => {
    const [err] = await new Promise<any[]>((r) => guarded("evil.example", {}, (...a: any[]) => r(a)));
    expect(err).toBeInstanceOf(Error);
  });
});

describe("safeFetchText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fakeResponse(status: number, headers: Record<string, string>, body = "") {
    const stream = new PassThrough();
    Object.assign(stream, { statusCode: status, headers });
    stream.end(body);
    return stream;
  }

  it("never connects to a private initial URL", async () => {
    const spy = vi.spyOn(http, "request");
    expect(await safeFetchText("http://127.0.0.1:3005/")).toBeNull();
    expect(await safeFetchText("http://169.254.169.254/latest/meta-data/")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("re-checks every redirect hop and stops at a private target", async () => {
    const lookup = lookupTable({ "public.example": [PUBLIC_V4], "sneaky.example": ["169.254.169.254"] });
    const requested: string[] = [];
    const responses = [
      fakeResponse(302, { location: "http://public.example/step2" }),
      fakeResponse(301, { location: "http://sneaky.example/latest/meta-data/" }),
    ];
    vi.spyOn(http, "request").mockImplementation(((url: URL, _opts: unknown, cb: (res: any) => void) => {
      requested.push(url.toString());
      const res = responses.shift()!;
      const req = new PassThrough() as any;
      req.end = () => setImmediate(() => cb(res));
      return req;
    }) as any);

    expect(await safeFetchText("http://public.example/", { lookup })).toBeNull();
    expect(requested).toEqual(["http://public.example/", "http://public.example/step2"]);
  });

  it("follows public redirects and returns the body", async () => {
    const lookup = lookupTable({ "public.example": [PUBLIC_V4] });
    const responses = [
      fakeResponse(302, { location: "/final" }),
      fakeResponse(200, { "content-type": "text/html" }, "<h1>ok</h1>"),
    ];
    const requested: string[] = [];
    vi.spyOn(http, "request").mockImplementation(((url: URL, opts: any, cb: (res: any) => void) => {
      requested.push(url.toString());
      expect(typeof opts.lookup).toBe("function");
      const res = responses.shift()!;
      const req = new PassThrough() as any;
      req.end = () => setImmediate(() => cb(res));
      return req;
    }) as any);

    const res = await safeFetchText("http://public.example/", { lookup });
    expect(res).toMatchObject({ url: "http://public.example/final", status: 200, body: "<h1>ok</h1>" });
    expect(requested).toEqual(["http://public.example/", "http://public.example/final"]);
  });

  it("gives up after too many redirects", async () => {
    const lookup = lookupTable({ "public.example": [PUBLIC_V4] });
    vi.spyOn(http, "request").mockImplementation(((_url: URL, _opts: unknown, cb: (res: any) => void) => {
      const req = new PassThrough() as any;
      req.end = () => setImmediate(() => cb(fakeResponse(302, { location: "/loop" })));
      return req;
    }) as any);
    expect(await safeFetchText("http://public.example/", { lookup, maxRedirects: 3 })).toBeNull();
  });
});
