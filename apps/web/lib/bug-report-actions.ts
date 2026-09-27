"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireWorkspace } from "./session";
import {
  submitBugReportForUser,
  updateBugReportStatusForAdmin,
  type BugReportStatus,
} from "./bug-reports";

export async function submitBugReportAction(formData: FormData) {
  const { user, workspace } = await requireWorkspace();

  const heading = formData.get("heading") as string;
  const description = formData.get("description") as string;
  const url = (formData.get("url") as string) || null;

  const result = await submitBugReportForUser(
    user.id,
    user.email,
    user.name || null,
    workspace?.id || null,
    { heading, description, url }
  );

  if (result.ok) {
    revalidatePath("/bug-report");
    revalidatePath("/admin");
  }

  return result;
}

export async function updateBugReportStatusAction(
  reportId: string,
  status: BugReportStatus
) {
  const user = await requireUser();
  const result = await updateBugReportStatusForAdmin(user, reportId, status);

  if (result.ok) {
    revalidatePath("/admin");
    revalidatePath("/bug-report");
  }

  return result;
}
