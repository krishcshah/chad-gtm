"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, cn } from "@smartreach/ui";

/**
 * Password field with a show/hide toggle. Props (including the id and aria
 * attributes Field injects) go to the input itself, so labels stay wired up.
 * Never pre-fill it with a stored password: stored secrets don't reach the browser.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          {...props}
          type={visible ? "text" : "password"}
          autoComplete={props.autoComplete ?? "new-password"}
          spellCheck={false}
          className={cn("pr-10", className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-subtle-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    );
  },
);
