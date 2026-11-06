"use client";

import { Input } from "@smartreach/ui";
import { WizardField, fieldAria } from "./wizard-field";

export function StepName({
  name,
  error,
  onChange,
  onSubmit,
}: {
  name: string;
  error?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="max-w-xl">
      <WizardField
        id="c-name"
        label="Campaign name"
        hint="For example the audience and the month, so it is easy to find later."
        error={error}
      >
        <Input
          {...fieldAria("c-name", error, true)}
          autoFocus
          value={name}
          maxLength={140}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Q1 SaaS founders, US"
        />
      </WizardField>
    </div>
  );
}
