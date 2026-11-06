"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Card, CardContent, CardFooter, Field, Input } from "@smartreach/ui";
import { createLeadList } from "@/lib/actions";

export function NewLeadListForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!name.trim()) {
      setError("Give the list a name");
      return;
    }
    setError(null);
    start(async () => {
      const res = await createLeadList({ name });
      if (!res.ok) {
        const fieldMessage = res.fieldErrors?.name?.[0];
        if (fieldMessage) setError(fieldMessage);
        else toast.error(res.error);
        return;
      }
      toast.success("List created");
      router.push(`/leads/${res.data?.id}`);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form onSubmit={submit} noValidate>
          <CardContent>
            <Field
              label="List name"
              required
              error={error ?? undefined}
              hint="You pick lists by this name when you set up a campaign."
            >
              <Input
                autoFocus
                value={name}
                maxLength={120}
                disabled={pending}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. SaaS founders, Q1"
              />
            </Field>
          </CardContent>
          <CardFooter>
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Create list
            </Button>
          </CardFooter>
        </form>
      </Card>
      <p className="text-[13px] text-muted-foreground">
        Already have a CSV?{" "}
        <Link
          href="/leads/import"
          className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
        >
          Import it
        </Link>{" "}
        and the list is created for you.
      </p>
    </div>
  );
}
