"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CornerDownLeft, Plus, Search, Upload, UserPlus, type LucideIcon } from "lucide-react";
import { Kbd, cn } from "@smartreach/ui";
import { adminNav, primaryNav, secondaryNav } from "./layout/nav";

type Command = { id: string; label: string; href: string; icon: LucideIcon; group: string; keys?: string };

const OPEN_EVENT = "autogtm:open-command-menu";

/** Opens the ⌘K menu from anywhere (sidebar search button, mobile bar). */
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const createCommands: Command[] = [
  { id: "new-autopilot", label: "Start an autopilot run", href: "/chad-gtm", icon: Plus, group: "Create" },
  { id: "new-campaign", label: "New campaign", href: "/campaigns/new", icon: Plus, group: "Create" },
  { id: "new-lead-list", label: "New lead list", href: "/leads/new", icon: UserPlus, group: "Create" },
  { id: "import-leads", label: "Import leads from CSV", href: "/leads/import", icon: Upload, group: "Create" },
];

function buildCommands(includeAdmin: boolean): Command[] {
  const pages: Command[] = [
    ...primaryNav.flatMap((g) => g.items),
    ...secondaryNav,
    ...(includeAdmin ? [adminNav] : []),
  ].map((i) => ({
    id: i.href,
    label: i.label,
    href: i.href,
    icon: i.icon,
    group: "Go to",
    keys: i.shortcut ? `G ${i.shortcut.toUpperCase()}` : undefined,
  }));
  return [...pages, ...createCommands];
}

/**
 * ⌘K / Ctrl+K command menu plus Linear-style "g then key" navigation
 * (g d overview, g c campaigns, …) and "c" for a new campaign.
 */
export function CommandPalette({ isAdmin = false }: { isAdmin?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const pending = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const commands = useMemo(() => buildCommands(isAdmin), [isAdmin]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (pending.current === "g") {
        pending.current = null;
        const target = commands.find((c) => c.keys === `G ${key.toUpperCase()}`);
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (key === "g") {
        pending.current = "g";
        window.setTimeout(() => (pending.current = null), 900);
      } else if (key === "c" && !document.querySelector("[role=dialog]")) {
        e.preventDefault();
        router.push("/campaigns/new");
      }
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [router, commands]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => setIndex(0), [query, open]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    router.push(c.href);
  };

  const groups = results.reduce<Record<string, Command[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});
  let i = -1;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-overlay fixed inset-0 z-50 bg-overlay" />
        <DialogPrimitive.Content
          className="ui-dialog fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-xl outline-none"
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((n) => Math.min(n + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((n) => Math.max(n - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(results[index]);
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">Command menu</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-subtle-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages and actions…"
              className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle-foreground"
              role="combobox"
              aria-expanded
              aria-controls="command-list"
              aria-activedescendant={results[index] ? `cmd-${results[index].id}` : undefined}
            />
            <Kbd>Esc</Kbd>
          </div>
          <div ref={listRef} id="command-list" role="listbox" className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
            {results.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matches for “{query}”.</p>
            ) : (
              Object.entries(groups).map(([group, items]) => (
                <div key={group} className="mb-1 last:mb-0">
                  <div className="px-2 pb-1 pt-2 text-xs font-medium text-subtle-foreground">{group}</div>
                  {items.map((c) => {
                    i += 1;
                    const n = i;
                    const Icon = c.icon;
                    return (
                      <button
                        key={c.id}
                        id={`cmd-${c.id}`}
                        type="button"
                        role="option"
                        aria-selected={n === index}
                        data-index={n}
                        onMouseMove={() => setIndex(n)}
                        onClick={() => run(c)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm",
                          n === index ? "bg-muted text-foreground" : "text-muted-foreground",
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="flex-1 truncate">{c.label}</span>
                        {c.keys ? (
                          <span className="flex gap-1">
                            {c.keys.split(" ").map((k) => (
                              <Kbd key={k}>{k}</Kbd>
                            ))}
                          </span>
                        ) : n === index ? (
                          <CornerDownLeft className="size-3.5 text-subtle-foreground" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
