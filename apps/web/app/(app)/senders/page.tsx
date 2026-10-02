import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function SendersPage() {
  const user = await requireUser();
  if (isAdmin(user)) {
    redirect("/admin");
  }
  redirect("/dashboard");
}
