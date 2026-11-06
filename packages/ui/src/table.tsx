import * as React from "react";
import { cn } from "./utils";

/**
 * Data table. Wrap it in a Card (or <TableContainer>) for the border; the
 * table itself scrolls horizontally on small screens.
 */
export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom border-collapse text-[13px]", className)} {...props} />
    </div>
  );
}
/** Bordered, rounded table frame. */
export function TableContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-xs", className)} {...props} />;
}
export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-muted/50 [&_tr]:border-b [&_tr]:border-border", className)} {...props} />;
}
export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors hover:bg-muted/40 data-[state=selected]:bg-brand-soft/60",
        className,
      )}
      {...props}
    />
  );
}
export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-9 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground first:pl-5 last:pr-5",
        className,
      )}
      {...props}
    />
  );
}
export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle first:pl-5 last:pr-5", className)} {...props} />;
}
