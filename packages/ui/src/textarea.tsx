import * as React from "react";
import { controlClasses } from "./input";
import { cn } from "./utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(controlClasses, "min-h-[88px] px-3 py-2 leading-relaxed", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
