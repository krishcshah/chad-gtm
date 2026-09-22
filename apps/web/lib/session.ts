import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { isDbConfigured } from "./env";
import { getActiveWorkspace, getFallbackWorkspace, type WorkspaceItem } from "./workspaces";

/** Request-scoped session lookup (deduped per render via React cache). */
export const getSession = cache(async () => {
  // No DB → no session store. Treat as logged-out instead of throwing during
  // build-time prerender or an unconfigured deployment.
  if (!isDbConfigured) return null;
  const session = await auth.api.getSession({ headers: await headers() });
  return session;
});

/** Guard for (app) pages — redirects to /login when unauthenticated. */
export async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return session.user;
}

/** Guard for (app) pages — returns authenticated user and their active workspace. Never redirects logged-in users. */
export async function requireWorkspace(): Promise<{
  user: NonNullable<Awaited<ReturnType<typeof getSession>>>["user"];
  workspace: WorkspaceItem;
}> {
  const user = await requireUser();
  try {
    const workspace = await getActiveWorkspace(user.id);
    return { user, workspace };
  } catch (err) {
    console.error("[requireWorkspace] fallback:", err);
    return { user, workspace: getFallbackWorkspace(user.id) };
  }
}
