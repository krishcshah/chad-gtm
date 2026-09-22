import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { NavigationProgress } from "@/components/navigation-progress";
import { ImportJobProvider } from "@/components/import-job-provider";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, getFallbackWorkspace, listUserWorkspaces, type WorkspaceItem } from "@/lib/workspaces";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user;
  let workspace: WorkspaceItem;
  try {
    workspace = await getActiveWorkspace(user.id);
  } catch (err) {
    console.error("[AppLayout] Failed to get active workspace:", err);
    workspace = getFallbackWorkspace(user.id);
  }

  let workspaces: WorkspaceItem[] = [workspace];
  try {
    workspaces = await listUserWorkspaces(user.id);
    if (!workspaces.length) workspaces = [workspace];
  } catch (err) {
    console.error("[AppLayout] Failed to list workspaces:", err);
  }

  return (
    <ImportJobProvider>
      <div className="app-shell flex min-h-dvh">
        <NavigationProgress />
        <AppSidebar
          user={user}
          workspaces={workspaces}
          activeWorkspace={workspace}
        />
        <main className="flex-1 min-w-0 pt-14 lg:pt-0 lg:pl-64 flex flex-col group">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 [&:has(>.unibox-root)]:max-w-none [&:has(>.unibox-root)]:p-0 flex-1 flex flex-col">
            <div className="flex-1">
              {children}
            </div>
            <footer className="mt-auto pt-8 pb-2 text-center text-[10px] text-muted-foreground/40 flex items-center justify-center gap-1.5 select-none group-has-[.unibox-root]:hidden">
              <span>🇩🇪</span>
              <span>Made in Germany · EU Hosted</span>
            </footer>
          </div>
        </main>
        <CommandPalette />
      </div>
    </ImportJobProvider>
  );
}
