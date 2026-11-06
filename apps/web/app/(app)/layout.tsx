import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { NavigationProgress } from "@/components/navigation-progress";
import { ImportJobProvider } from "@/components/import-job-provider";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, getFallbackWorkspace, listUserWorkspaces, type WorkspaceItem } from "@/lib/workspaces";

import { SidebarProvider } from "@/components/layout/sidebar-context";
import { AppShell, AppMainContent } from "@/components/layout/app-shell";
import { PageTracker } from "@/components/page-tracker";
import { countOpenAgentRequests } from "@/lib/autopilot-actions";
import { approvalRequired, isApprovedToSend } from "@/lib/approval";
import { ApprovalBanner } from "./approval-banner";
import { isAdmin } from "@/lib/admin";

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

  const openRequests = await countOpenAgentRequests();

  let showApprovalBanner = false;
  let emailOnApprove = false;
  if (approvalRequired()) {
    try {
      showApprovalBanner = !(await isApprovedToSend(user.id));
      if (showApprovalBanner) {
        const { isSystemMailerConfigured } = await import("@smartreach/email-engine/system-mailer");
        emailOnApprove = isSystemMailerConfigured();
      }
    } catch (err) {
      console.error("[AppLayout] Failed to check approval:", err);
    }
  }

  return (
    <SidebarProvider>
      <ImportJobProvider>
        <AppShell>
          <NavigationProgress />
          <PageTracker />
          <AppSidebar
            user={user}
            workspaces={workspaces}
            activeWorkspace={workspace}
            openRequests={openRequests}
          />
          <AppMainContent>
            {showApprovalBanner && <ApprovalBanner emailOnApprove={emailOnApprove} />}
            {children}
          </AppMainContent>
          <CommandPalette isAdmin={isAdmin(user)} />
        </AppShell>
      </ImportJobProvider>
    </SidebarProvider>
  );
}
