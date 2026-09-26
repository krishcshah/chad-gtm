/**
 * Resolve Better Auth trustedOrigins from APP_URL / BETTER_AUTH_URL /
 * BETTER_AUTH_TRUSTED_ORIGINS, expanding localhost ↔ 127.0.0.1 (with port).
 * Production stays strict: only configured URLs (plus their loopback twin).
 */
export function expandLoopbackOrigins(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed) return [];
  try {
    const u = new URL(trimmed);
    const origins = new Set<string>([u.origin]);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      const port = u.port ? `:${u.port}` : "";
      origins.add(`${u.protocol}//localhost${port}`);
      origins.add(`${u.protocol}//127.0.0.1${port}`);
    }
    return [...origins];
  } catch {
    return [];
  }
}

export function resolveTrustedOrigins(opts: {
  appUrl: string;
  betterAuthUrl: string;
  extraCsv?: string;
  /** When true, always include common local loopback origins for DX. */
  includeDevLoopback?: boolean;
}): string[] {
  const set = new Set<string>();
  for (const raw of [opts.appUrl, opts.betterAuthUrl]) {
    for (const o of expandLoopbackOrigins(raw)) set.add(o);
  }
  if (opts.extraCsv) {
    for (const part of opts.extraCsv.split(",")) {
      for (const o of expandLoopbackOrigins(part)) set.add(o);
    }
  }
  if (opts.includeDevLoopback) {
    for (const port of ["", ":3000", ":3001", ":3002", ":3003", ":3004", ":3005", ":3006"]) {
      set.add(`http://localhost${port}`);
      set.add(`http://127.0.0.1${port}`);
    }
  }
  return [...set];
}
