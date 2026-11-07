"use client";

import { useEffect, useState } from "react";
import { cn } from "@smartreach/ui";

/** `group`: a heading shown above the first section of each group ("Account", "This workspace: …"). */
export type SettingsSection = { id: string; label: string; group?: string };

/** Sticky in-page navigation for the settings sections (desktop only). Highlights the section in view. */
export function SettingsNav({ sections }: { sections: SettingsSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      const match = sections.find((s) => s.id === hash);
      if (match) setActive(match.id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);

    // The active section is the last one whose top has scrolled past the upper fifth
    // of the viewport; at the bottom of the page it is the last section.
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
        if (atBottom) {
          setActive(sections[sections.length - 1]?.id ?? "");
          return;
        }
        const line = window.innerHeight * 0.2;
        let current = sections[0]?.id ?? "";
        for (const s of sections) {
          const el = document.getElementById(s.id);
          if (el && el.getBoundingClientRect().top <= line) current = s.id;
        }
        setActive(current);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // The browser may already have jumped to an anchor before this effect ran.
    if (window.scrollY > 0) onScroll();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("hashchange", fromHash);
    };
  }, [sections]);

  return (
    <nav aria-label="Settings sections" className="hidden lg:block">
      <ul className="sticky top-10 flex flex-col gap-0.5">
        {sections.map((s, i) => {
          const current = s.id === active;
          const heading = s.group && s.group !== sections[i - 1]?.group ? s.group : null;
          return (
            <li key={s.id}>
              {heading ? (
                <p
                  className={cn(
                    "truncate px-2.5 pb-1 text-xs font-medium text-subtle-foreground",
                    i > 0 ? "pt-4" : "pt-0",
                  )}
                  title={heading}
                >
                  {heading}
                </p>
              ) : null}
              <a
                href={`#${s.id}`}
                aria-current={current ? "location" : undefined}
                onClick={() => setActive(s.id)}
                className={cn(
                  "block rounded-md px-2.5 py-1.5 text-[13px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
                  current
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
