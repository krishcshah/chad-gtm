"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Textarea,
} from "@smartreach/ui";
import { submitDataRemovalAction } from "@/lib/data-removal-actions";

type Errors = { contactEmail?: string; description?: string };

/** GDPR Art. 17 erasure request for personal data AutoGTM holds about someone. */
export function RemoveMyInfoCard({ userEmail }: { userEmail?: string | null }) {
  const [contactEmail, setContactEmail] = useState(userEmail || "");
  const [description, setDescription] = useState("");
  const [submittedFor, setSubmittedFor] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    const email = contactEmail.trim();
    if (!email || !email.includes("@") || email.length < 5) found.contactEmail = "Enter a valid email address.";
    if (description.trim().length < 3) found.description = "Tell us what you want removed.";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    const formData = new FormData();
    formData.append("contactEmail", contactEmail);
    formData.append("description", description);

    startTransition(async () => {
      const res = await submitDataRemovalAction(formData);
      if (res.ok) {
        setSubmittedFor(email);
        setDescription("");
        toast.success("Removal request sent");
      } else {
        const message = res.error || "The request could not be sent. Try again.";
        setFormError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request data removal</CardTitle>
        <CardDescription>
          Ask us to delete personal data about you from AutoGTM, including the shared lead directory (your right to
          erasure under GDPR Article 17). This does not delete your account.
        </CardDescription>
      </CardHeader>

      {submittedFor ? (
        <CardContent>
          <Alert
            variant="success"
            action={
              <Button variant="outline" size="sm" onClick={() => setSubmittedFor(null)}>
                Send another
              </Button>
            }
          >
            <AlertTitle>Request received</AlertTitle>
            <AlertDescription>
              <span className="text-foreground">{submittedFor}</span> is now blocked from all AutoGTM outreach. We&apos;ll
              delete matching records within 72 hours.
            </AlertDescription>
          </Alert>
        </CardContent>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="flex flex-col gap-5">
            {formError ? <Alert variant="destructive">{formError}</Alert> : null}
            <Field
              label="Email address"
              required
              error={errors.contactEmail}
              hint="We remove every lead and outreach record that matches this address."
            >
              <Input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                disabled={isPending}
              />
            </Field>
            <Field label="What should we remove?" required error={errors.description}>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="My work email, phone number and the company record for Acme Inc."
                disabled={isPending}
              />
            </Field>
          </CardContent>
          <CardFooter>
            <Button type="submit" loading={isPending}>
              Send request
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
