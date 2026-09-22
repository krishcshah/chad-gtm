import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { NavigationProgress } from "@/components/navigation-progress";
import { ImportJobProvider } from "@/components/import-job-provider";
import { getSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return (
    <ImportJobProvider>
      <div className="app-shell flex min-h-dvh">
        <NavigationProgress />
        <AppSidebar user={session.user} />
        <main className="flex-1 min-w-0 pt-14 lg:pt-0 lg:pl-64">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 [&:has(>.unibox-root)]:max-w-none [&:has(>.unibox-root)]:p-0">
            {children}
          </div>
        </main>
        <CommandPalette />
      </div>
    </ImportJobProvider>
  );
}
