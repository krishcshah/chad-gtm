import { requireUser } from "@/lib/session";
import { NewLeadListForm } from "./new-lead-list-form";

export const dynamic = "force-dynamic";

export default async function NewLeadListPage() {
  await requireUser();
  return <NewLeadListForm />;
}
