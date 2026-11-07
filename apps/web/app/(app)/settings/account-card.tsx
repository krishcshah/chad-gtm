"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  toast,
} from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { validateNewPassword } from "@/lib/password-rules";

export const NAME_MAX_LENGTH = 100;

/** Returns an error message, or null when the (already trimmed) name is acceptable. */
export function validateName(name: string): string | null {
  if (!name) return "Enter your name.";
  if (name.length > NAME_MAX_LENGTH) return `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  return null;
}

type AuthError = { code?: string; message?: string } | null | undefined;

/**
 * Settings › Account: shows who is signed in and lets them change their name
 * and password (Better Auth updateUser / changePassword). Changing the email
 * needs a verification flow, so it goes through support for now.
 */
export function AccountCard({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [currentName, setCurrentName] = useState(name.trim());
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(currentName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const displayName = currentName || email;
  const initial = (currentName || email || "U").slice(0, 1).toUpperCase();

  function startEditing() {
    setDraftName(currentName);
    setNameError(null);
    setEditing(true);
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const next = draftName.trim();
    const problem = validateName(next);
    if (problem) {
      setNameError(problem);
      return;
    }
    setSavingName(true);
    try {
      const res = await authClient.updateUser({ name: next });
      const error = (res as { error?: AuthError } | undefined)?.error;
      if (error) {
        setNameError(error.message || "Couldn't update your name. Try again.");
        return;
      }
      setCurrentName(next);
      setEditing(false);
      toast.success("Name updated");
      router.refresh();
    } catch {
      setNameError("Couldn't update your name. Try again.");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>The account you sign in with.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {editing ? (
          <form onSubmit={saveName} noValidate className="flex flex-col gap-3">
            <Field label="Name" error={nameError ?? undefined}>
              <Input
                id="account-name"
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                autoComplete="name"
                maxLength={NAME_MAX_LENGTH}
                autoFocus
              />
            </Field>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" loading={savingName}>
                Save name
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={savingName}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-4">
            <Avatar className="size-11">
              <AvatarFallback className="bg-muted text-base font-medium text-muted-foreground">{initial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{displayName}</p>
              {currentName ? <p className="truncate text-[13px] text-muted-foreground">{email}</p> : null}
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={startEditing}>
              Edit name
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted-foreground">
            To change your email,{" "}
            <Link href="/support?new=contact" className="text-foreground underline underline-offset-4">
              contact support
            </Link>
            .
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => setPasswordOpen(true)}>
            Change password
          </Button>
        </div>
      </CardContent>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </Card>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [noPassword, setNoPassword] = useState(false);
  const [pending, setPending] = useState(false);

  function setOpen(next: boolean) {
    if (!next) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setNoPassword(false);
    }
    onOpenChange(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNoPassword(false);
    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    const problem = validateNewPassword(newPassword, confirmPassword);
    if (problem) {
      setError(problem.endsWith(".") ? problem : `${problem}.`);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      const failure = (res as { error?: AuthError } | undefined)?.error;
      if (failure) {
        if (failure.code === "INVALID_PASSWORD") {
          setError("Your current password is incorrect.");
        } else if (failure.code === "CREDENTIAL_ACCOUNT_NOT_FOUND") {
          setNoPassword(true);
          setError(failure.message || "This account has no password.");
        } else {
          setError(failure.message || "Couldn't change your password. Try again.");
        }
        return;
      }
      toast.success("Password changed. You've been signed out on other devices.");
      setOpen(false);
    } catch {
      setError("Couldn't change your password. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>You&apos;ll stay signed in here and be signed out on other devices.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field label="Current password">
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </Field>
            {error ? (
              <p role="alert" className="text-[13px] text-destructive-text">
                {error}
                {noPassword ? (
                  <>
                    {" "}
                    <Link href="/forgot-password" className="underline underline-offset-4">
                      Set a password with a reset link
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
