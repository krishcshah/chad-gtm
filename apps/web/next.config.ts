import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolate `next build` from a concurrent `next dev` .next (PageNotFoundError race).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Keep better-auth + its adapter bundled (single module graph → no `eq is not a function`),
  // but leave the DB driver trio EXTERNAL so webpack never tries to bundle raw `drizzle-orm`
  // (its ESM layout breaks the browser/client-module graph when server actions are imported).
  serverExternalPackages: [
    "nodemailer",
    "imapflow",
    "@neondatabase/serverless",
    "drizzle-orm",
    "@smartreach/database",
    "@smartreach/email-engine",
  ],
  transpilePackages: [
    "@smartreach/ui",
    "@smartreach/shared",
    "@smartreach/validation",
    "better-auth",
    "@better-auth/drizzle-adapter",
  ],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
