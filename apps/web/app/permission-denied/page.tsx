import { PermissionDenied } from "@smartreach/ui";

export const metadata = { title: "Access denied" };

/** Static permission-denied surface for a11y / design review (no API). */
export default function PermissionDeniedPage() {
  return (
    <div className="app-shell flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md">
        <PermissionDenied />
      </div>
    </div>
  );
}
