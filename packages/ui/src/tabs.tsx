"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "./utils";

export const Tabs = TabsPrimitive.Root;

type TabsVariant = "underline" | "pill";
const TabsVariantContext = React.createContext<TabsVariant>("underline");

/**
 * `underline` (default) for page-level sections; `pill` for compact switches
 * inside cards and toolbars.
 */
export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = "underline", ...props }, ref) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        variant === "underline"
          ? "flex items-center gap-5 overflow-x-auto border-b border-border"
          : "inline-flex h-9 items-center gap-0.5 rounded-lg bg-muted p-0.5 ring-1 ring-inset ring-border",
        className,
      )}
      {...props}
    />
  </TabsVariantContext.Provider>
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-medium outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
        variant === "underline"
          ? "-mb-px h-10 border-b-2 border-transparent text-muted-foreground hover:text-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground"
          : "h-8 rounded-md px-3 text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-5 outline-none", className)} {...props} />
));
TabsContent.displayName = "TabsContent";
