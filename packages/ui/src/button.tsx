import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium tracking-tight transition-all duration-150 outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-white text-black font-semibold hover:bg-zinc-200 border border-white shadow-sm hover:shadow active:bg-zinc-300",
        destructive: "bg-rose-950/40 text-rose-200 border border-rose-900/60 hover:bg-rose-900/60 hover:text-white hover:border-rose-700/80 shadow-xs",
        outline: "border border-zinc-800 bg-zinc-950/70 text-zinc-200 hover:bg-zinc-900 hover:border-zinc-700 hover:text-white shadow-xs",
        secondary: "bg-zinc-900 text-zinc-100 border border-zinc-800 hover:bg-zinc-800/90 hover:border-zinc-700 shadow-xs",
        ghost: "text-zinc-400 hover:bg-zinc-900/80 hover:text-white",
        link: "text-white underline-offset-4 hover:underline font-normal",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-[11px]",
        lg: "h-10 px-5 text-sm font-semibold",
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-7 w-7 p-0 text-[10px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
export { buttonVariants };
