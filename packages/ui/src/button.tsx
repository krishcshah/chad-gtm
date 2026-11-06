import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "./utils";

const buttonVariants = cva(
  [
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
    "transition-[background-color,border-color,color,box-shadow,opacity] duration-150",
    "outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        /** The one main action on a surface. */
        primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/88 active:bg-primary/80",
        /** Brand call to action: marketing pages and "launch" moments only. */
        brand: "bg-brand text-brand-foreground shadow-xs hover:bg-brand/90 active:bg-brand/85",
        /** Neutral bordered button, the default for secondary actions. */
        outline:
          "border border-border-strong bg-card text-foreground shadow-xs hover:bg-muted active:bg-accent",
        secondary: "bg-muted text-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:bg-destructive/85",
        "destructive-outline":
          "border border-border-strong bg-card text-destructive-text shadow-xs hover:border-destructive/40 hover:bg-destructive-soft",
        link: "h-auto px-0 text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground",
        /** @deprecated alias of primary */
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/88 active:bg-primary/80",
      },
      size: {
        xs: "h-7 rounded-md px-2.5 text-xs [&_svg]:size-3.5",
        sm: "h-8 px-3 text-[13px] [&_svg]:size-4",
        md: "h-9 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-11 rounded-lg px-5 text-[15px] [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-4",
        "icon-xs": "size-7 [&_svg]:size-3.5",
        /** @deprecated alias of md */
        default: "h-9 px-3.5 text-sm [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner, disables the button and keeps its width. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    if (asChild) {
      return (
        <Slot className={classes} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        className={classes}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
export { buttonVariants };
