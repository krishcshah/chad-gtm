"use server";

import { revalidatePath } from "next/cache";
import { getSession, requireUser } from "./session";
import {
  submitDataRemovalRequest,
  updateDataRemovalStatusForAdmin,
  type DataRemovalStatus,
} from "./data-removal";

export async function submitDataRemovalAction(formData: FormData) {
  const session = await getSession();
  const user = session?.user;

  const contactEmail = formData.get("contactEmail") as string;
  const description = formData.get("description") as string;

  const result = await submitDataRemovalRequest({
    contactEmail,
    description,
    userId: user?.id || null,
  });

  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/admin");
    revalidatePath("/remove-my-info");
  }

  return result;
}

export async function updateDataRemovalStatusAction(
  requestId: string,
  status: DataRemovalStatus
) {
  const user = await requireUser();
  const result = await updateDataRemovalStatusForAdmin(user, requestId, status);

  if (result.ok) {
    revalidatePath("/admin");
  }

  return result;
}
