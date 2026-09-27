import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BlocklistPage() {
  redirect("/settings#blocklist");
}
