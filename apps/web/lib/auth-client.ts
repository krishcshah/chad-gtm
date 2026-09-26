"use client";
import { createAuthClient } from "better-auth/react";

function getValidBaseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  const candidate = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  if (candidate) {
    try {
      const clean = candidate.trim().replace(/^["']|["']$/g, "");
      new URL(clean);
      return clean;
    } catch {
      // Fallback if URL was masked or invalid
    }
  }
  return "http://localhost:3000";
}

export const authClient = createAuthClient({
  baseURL: getValidBaseUrl(),
});

export const { signIn, signUp, signOut, useSession } = authClient;
