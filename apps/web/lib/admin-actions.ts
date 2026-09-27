"use server";

import { requireUser } from "./session";
import { getUserDetailedActivity } from "./admin-analytics";

export async function fetchUserDetailAction(targetUserId: string) {
  const user = await requireUser();
  return await getUserDetailedActivity(user, targetUserId);
}
