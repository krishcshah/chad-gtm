import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { NavigationProgress } from "@/components/navigation-progress";
import { ImportJobProvider } from "@/components/import-job-provider";
import { GermanFlag } from "@/components/german-flag";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, getFallbackWorkspace, listUserWorkspaces, type WorkspaceItem } from "@/lib/workspaces";

import { SidebarProvider } from "@/components/layout/sidebar-context";
import { AppShell, AppMainContent } from "@/components/layout/app-shell";

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
    <SidebarProvider>
      <ImportJobProvider>
        <AppShell>
          <NavigationProgress />
          <AppSidebar
            user={user}
            workspaces={workspaces}
            activeWorkspace={workspace}
          />
          <AppMainContent>{children}</AppMainContent>
          <CommandPalette />
        </AppShell>
      </ImportJobProvider>
    </SidebarProvider>
  );
}
