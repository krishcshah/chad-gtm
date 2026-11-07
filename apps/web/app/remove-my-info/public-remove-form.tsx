"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Field,
  Input,
  Textarea,
} from "@smartreach/ui";
import { submitDataRemovalAction } from "@/lib/data-removal-actions";

export function PublicRemoveMyInfoForm() {
  const [contactEmail, setContactEmail] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmationRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (submitted) confirmationRef.current?.focus();
  }, [submitted]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append("contactEmail", contactEmail);
    formData.append("description", description);

    startTransition(async () => {
      const res = await submitDataRemovalAction(formData);
      if (res.ok) {
        setSubmitted(true);
        setDescription("");
      } else {
        setError(res.error || "Failed to submit request.");
      }
    });
  };

  if (submitted) {
    return (
      <Card>
        <div role="status" className="flex flex-col items-center px-6 py-10 text-center">
          <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-success-soft text-success-text">
            <CheckCircle2 className="size-5" aria-hidden />
          </div>
          <h2 ref={confirmationRef} tabIndex={-1} className="text-[15px] font-semibold tracking-[-0.01em] outline-none">
            Request received
          </h2>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{contactEmail}</span> is now blocked from all AutoGTM
            outreach. We&apos;ll delete matching records within 72 hours.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-5"
            onClick={() => {
              setSubmitted(false);
              setContactEmail("");
            }}
          >
            Submit another request
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <h2 className="text-[15px] font-semibold leading-tight tracking-[-0.01em]">Erasure request</h2>
          <CardDescription>Both fields are required. You don&apos;t need an AutoGTM account.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="mt-0 text-foreground">{error}</AlertDescription>
            </Alert>
          )}

          <Field
            label="Email address"
            required
            hint="The exact personal or company address you want removed from all lists."
          >
            <Input
              type="email"
              name="contactEmail"
              required
              autoComplete="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>

          <Field label="What should we remove?" required>
            <Textarea
              name="description"
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="For example: my name, work email, phone number and company record."
            />
          </Field>
        </CardContent>
        <CardFooter>
          <Button type="submit" loading={isPending}>
            {isPending ? "Sending request…" : "Send request"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
