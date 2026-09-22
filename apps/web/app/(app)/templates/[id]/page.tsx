import { redirect } from "next/navigation";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/templates?edit=${encodeURIComponent(id)}`);
}
