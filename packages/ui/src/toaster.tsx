"use client";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

export { toast };

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as "dark" | "light") ?? "light"}
      position="bottom-right"
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border !border-border !bg-popover !text-popover-foreground !shadow-lg !text-[13px]",
          title: "!font-medium",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground !rounded-md",
          cancelButton: "!bg-muted !text-muted-foreground !rounded-md",
        },
      }}
    />
  );
}
