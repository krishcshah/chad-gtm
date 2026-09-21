"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Input, Label } from "@smartreach/ui";
import { createLeadList } from "@/lib/actions";

export function NewLeadListForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await createLeadList({ name });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("List created");
      router.push(`/leads/${res.data?.id}`);
    });
  };

  return (
    <div className="mx-auto max-w-md p-6 lg:p-10">
      <h1 className="text-2xl font-semibold tracking-tight">New Lead List</h1>
      <p className="mb-8 mt-1 text-sm text-muted-foreground">
        Group related contacts. You&apos;ll import contacts into it next.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="list-name">List name</Label>
          <Input
            id="list-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Q1 SaaS founders"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Creating…" : "Create list"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Tip: you can also{" "}
        <a href="/leads/import" className="text-primary underline underline-offset-2">
          import a CSV
        </a>{" "}
        directly — it creates a list for you.
      </p>
    </div>
  );
}
