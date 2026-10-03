"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { getActiveWorkspace } from "./workspaces";
import {
  createSupportTicket,
  addMessageToTicket,
  updateTicketStatus,
} from "./support";
import type { TicketCategory, TicketStatus } from "./support-types";

export async function submitTicketAction(data: {
  category: TicketCategory;
  heading: string;
  description: string;
  url?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const user = await requireUser();
    const ws = await getActiveWorkspace(user.id);

    const res = await createSupportTicket(
      user.id,
      user.email,
      user.name || null,
      ws?.id || null,
      data
    );

    if (res.ok) {
      revalidatePath("/support");
      revalidatePath("/admin");
    }
    return res;
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to submit ticket." };
  }
}

export async function addTicketMessageAction(
  ticketId: string,
  message: string
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const user = await requireUser();
    const res = await addMessageToTicket(ticketId, user, message);

    if (res.ok) {
      revalidatePath(`/support/${ticketId}`);
      revalidatePath("/support");
      revalidatePath("/admin");
    }
    return res;
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to send message." };
  }
}

export async function updateTicketStatusAction(
  ticketId: string,
  status: TicketStatus
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const res = await updateTicketStatus(user, ticketId, status);

    if (res.ok) {
      revalidatePath(`/support/${ticketId}`);
      revalidatePath("/support");
      revalidatePath("/admin");
    }
    return res;
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update status." };
  }
}
