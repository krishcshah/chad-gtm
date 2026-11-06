import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { AutoGtmLogo } from "@/components/chad-gtm-logo";

const legalLinks = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/impressum", label: "Impressum" },
  { href: "/remove-my-info", label: "Remove my info" },
];

/**
 * Frame for public AutoGTM pages (legal notices, data removal, 404):
 * logo header with a way home, a readable column, legal links in the footer.
 * Not for /unsubscribe, which must stay unbranded.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <AutoGtmLogo href="/" size="sm" />
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Home
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-6 text-xs text-subtle-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>AutoGTM · Frankfurt am Main, Germany</p>
          <nav aria-label="Legal">
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {legalLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Title block for a public page. `meta` is a quiet line such as "Stand: …". */
export function PublicPageHeader({
  title,
  description,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="border-b border-border pb-6">
      <h1 className="text-balance text-2xl font-semibold tracking-[-0.025em] text-foreground sm:text-3xl">{title}</h1>
      {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      {meta ? <p className="mt-3 text-xs text-subtle-foreground">{meta}</p> : null}
    </header>
  );
}

/** Long-form legal text in the shared `.prose-doc` style. */
export function LegalDocument({
  title,
  description,
  updated,
  lang,
  children,
}: {
  title: string;
  description?: ReactNode;
  updated?: string;
  /** Language of the document text when it differs from the app's (e.g. "de"). */
  lang?: string;
  children: ReactNode;
}) {
  return (
    <PublicShell>
      <article lang={lang}>
        <PublicPageHeader title={title} description={description} meta={updated} />
        <div className="prose-doc pt-2">{children}</div>
      </article>
    </PublicShell>
  );
}
