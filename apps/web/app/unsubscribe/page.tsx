import { processUnsubscribe } from "@/lib/actions";
import { APP_NAME } from "@smartreach/shared";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token?.trim() ?? "";
  let result: { ok: boolean; message?: string; error?: string; email?: string } = {
    ok: false,
    error: "Missing unsubscribe token",
  };
  if (token) {
    const r = await processUnsubscribe(token);
    if (r.ok) {
      result = { ok: true, message: r.message, email: r.data?.email };
    } else {
      result = { ok: false, error: r.error };
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
      <h2 className="text-lg font-medium">Unsubscribe</h2>
      {result.ok ? (
        <p className="text-sm text-muted-foreground">
          {result.message}
          {result.email ? (
            <>
              {" "}
              (<span className="font-mono">{result.email}</span>)
            </>
          ) : null}
          . You will not receive further campaign emails from this workspace.
        </p>
      ) : (
        <p className="text-sm text-destructive">{result.error}</p>
      )}
      <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to {APP_NAME}
      </Link>
    </main>
  );
}
