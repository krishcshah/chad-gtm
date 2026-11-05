"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  FileText,
  HelpCircle,
  Link2,
  Loader2,
  MessageSquareQuote,
  PenLine,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { Badge, Button, Input, Textarea, cn, toast } from "@smartreach/ui";
import { timeAgo } from "@smartreach/shared";
import {
  deleteKnowledgeAction,
  dismissAgentRequestAction,
  draftRequestReplyAction,
  resolveAgentRequestAction,
  saveKnowledgeAction,
  setBookingUrlAction,
  type AgentRequestView,
  type KnowledgeView,
} from "@/lib/autopilot-actions";

const KIND_META: Record<string, { label: string; icon: typeof FileText; tone: string }> = {
  resource: { label: "Resource", icon: FileText, tone: "text-sky-300 bg-sky-400/10 border-sky-400/20" },
  question: { label: "Question", icon: HelpCircle, tone: "text-violet-300 bg-violet-400/10 border-violet-400/20" },
  approval: { label: "Approve draft", icon: PenLine, tone: "text-amber-300 bg-amber-400/10 border-amber-400/20" },
  referral: { label: "Referral", icon: UserPlus, tone: "text-pink-300 bg-pink-400/10 border-pink-400/20" },
  booking_url: { label: "Booking link", icon: CalendarClock, tone: "text-brand-300 bg-brand-400/10 border-brand-400/20" },
  other: { label: "Review", icon: MessageSquareQuote, tone: "text-zinc-300 bg-zinc-400/10 border-zinc-400/20" },
};

export function RequestsClient({
  open,
  history,
  knowledge,
}: {
  open: AgentRequestView[];
  history: AgentRequestView[];
  knowledge: KnowledgeView[];
}) {
  return (
    <div className="page-stack animate-float-up">
      <header className="flex flex-col gap-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand-400/90">Human in the loop</div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-[28px]">Needs you</h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Your agent answers replies and books meetings on its own. When a lead asks for something it doesn&apos;t
          have yet — a case study, references, a pricing detail — it pauses that thread and asks you here. Anything you
          share is saved, so it won&apos;t ask twice.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">
              Open <span className="ml-1 text-zinc-500 tabular-nums">{open.length}</span>
            </h2>
          </div>

          {open.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-16 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-400/10 text-brand-300 ring-1 ring-brand-400/20">
                <CheckCircle2 className="size-6" />
              </div>
              <p className="text-sm font-medium text-zinc-100">You&apos;re all caught up</p>
              <p className="mt-1 max-w-sm text-[13px] text-zinc-500">
                The agent is handling every conversation. You&apos;ll get an email the moment it needs something.
              </p>
            </div>
          ) : (
            open.map((r) => <RequestCard key={r.id} request={r} />)
          )}

          {history.length > 0 && (
            <details className="group rounded-2xl border border-zinc-800/80 bg-zinc-950/40">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] font-medium text-zinc-400 hover:text-zinc-200">
                <span>Recently resolved ({history.length})</span>
                <span className="text-xs text-zinc-600 group-open:hidden">Show</span>
                <span className="hidden text-xs text-zinc-600 group-open:inline">Hide</span>
              </summary>
              <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800/70">
                {history.map((h) => (
                  <li key={h.id} className="flex items-start gap-3 px-4 py-3 text-[13px]">
                    {h.status === "resolved" ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-brand-400" />
                    ) : (
                      <X className="mt-0.5 size-4 shrink-0 text-zinc-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-zinc-200">{h.title}</div>
                      <div className="truncate text-xs text-zinc-500" suppressHydrationWarning>
                        {h.leadName || h.leadEmail} · {h.status} {timeAgo(h.resolvedAt || h.createdAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <KnowledgePanel items={knowledge} />
      </div>
    </div>
  );
}

function RequestCard({ request }: { request: AgentRequestView }) {
  const router = useRouter();
  const meta = KIND_META[request.kind] ?? KIND_META.other!;
  const Icon = meta.icon;
  const [answer, setAnswer] = useState("");
  const [link, setLink] = useState("");
  const [save, setSave] = useState(true);
  const [draft, setDraft] = useState(request.kind === "approval" ? request.draftReply : "");
  const [pending, start] = useTransition();
  const leadLabel = request.leadName || request.leadEmail;

  const makeDraft = () =>
    start(async () => {
      const res = await draftRequestReplyAction({ requestId: request.id, answer, resourceUrl: link });
      if (!res.ok) return void toast.error(res.error);
      setDraft(res.data?.draft || "");
    });

  const send = () =>
    start(async () => {
      const res = await resolveAgentRequestAction({
        requestId: request.id,
        body: draft,
        answer,
        resourceUrl: link,
        saveToKnowledge: save,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || "Sent");
      router.refresh();
    });

  const saveBooking = () =>
    start(async () => {
      if (!request.runId) return void toast.error("This request isn't linked to an Autopilot run.");
      const res = await setBookingUrlAction(request.runId, link);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || "Saved");
      router.refresh();
    });

  const dismiss = () =>
    start(async () => {
      const res = await dismissAgentRequestAction(request.id);
      if (!res.ok) return void toast.error(res.error);
      toast(res.message || "Dismissed");
      router.refresh();
    });

  return (
    <article className="hairline-top overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/70 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)]">
      <div className="flex flex-wrap items-start gap-3 border-b border-zinc-800/70 px-5 py-4">
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl border", meta.tone)}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-zinc-50">{request.title}</h3>
            <span className={cn("rounded-md border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider", meta.tone)}>
              {meta.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500" suppressHydrationWarning>
            {leadLabel}
            {request.leadCompany ? ` · ${request.leadCompany}` : ""} · {request.leadEmail} · {timeAgo(request.createdAt)}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={dismiss} disabled={pending} title="Close without replying">
          <X /> Dismiss
        </Button>
      </div>

      <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            {leadLabel.split(" ")[0]} wrote
          </div>
          <blockquote className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-4 py-3 text-[13px] leading-relaxed text-zinc-300">
            {request.replyBody || request.question || "(no message body)"}
          </blockquote>
          {request.question && request.replyBody && (
            <p className="mt-2 text-xs text-zinc-500">
              <Sparkles className="mr-1 inline size-3 text-brand-400" />
              Agent&apos;s read: {request.question}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {request.kind === "booking_url" ? (
            <>
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Your booking link</label>
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://cal.com/you/intro"
                aria-label="Booking link"
              />
              <Button variant="brand" onClick={saveBooking} disabled={pending || !link.trim()}>
                {pending ? <Loader2 className="animate-spin" /> : <CalendarClock />} Save link & let the agent reply
              </Button>
            </>
          ) : request.kind === "approval" ? (
            <>
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Agent&apos;s draft</label>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} className="text-[13px] leading-relaxed" />
              <Button variant="brand" onClick={send} disabled={pending || draft.trim().length < 5}>
                {pending ? <Loader2 className="animate-spin" /> : <Send />} Approve & send
              </Button>
            </>
          ) : !draft ? (
            <>
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Give the agent what it needs</label>
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={4}
                placeholder={
                  request.kind === "resource"
                    ? "e.g. Here's our case study with Acme — they cut reporting time from 5 days to 1."
                    : "Write the answer in your own words. The agent turns it into a reply."
                }
                className="text-[13px]"
              />
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="Link to a deck, case study, or doc (optional)"
                  className="pl-8"
                  aria-label="Resource link"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={save}
                  onChange={(e) => setSave(e.target.checked)}
                  className="size-3.5 accent-[#12b98d]"
                />
                Save to knowledge base so the agent can reuse it
              </label>
              <Button onClick={makeDraft} disabled={pending || (!answer.trim() && !link.trim())}>
                {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft the reply
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Reply to {leadLabel.split(" ")[0]}
                </label>
                <button type="button" onClick={() => setDraft("")} className="text-xs text-zinc-500 hover:text-zinc-300">
                  Back
                </button>
              </div>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} className="text-[13px] leading-relaxed" />
              <Button variant="brand" onClick={send} disabled={pending || draft.trim().length < 5}>
                {pending ? <Loader2 className="animate-spin" /> : <Send />} Send reply
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function KnowledgePanel({ items }: { items: KnowledgeView[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"resource" | "faq">("resource");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [keywords, setKeywords] = useState("");
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const res = await saveKnowledgeAction({ kind, title, url, content, keywords });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || "Added");
      setTitle("");
      setUrl("");
      setContent("");
      setKeywords("");
      setAdding(false);
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      const res = await deleteKnowledgeAction(id);
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });

  return (
    <aside className="flex h-fit flex-col gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 xl:sticky xl:top-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-brand-300" />
          <h2 className="text-sm font-semibold text-zinc-100">Knowledge base</h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
          {adding ? <X /> : <Plus />} {adding ? "Cancel" : "Add"}
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        The only links and facts the agent may use. It shares these automatically when a lead asks.
      </p>

      {adding && (
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-950 p-1">
            {(["resource", "faq"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-md py-1 text-xs font-medium transition-colors",
                  kind === k ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {k === "resource" ? "Resource link" : "Answer / FAQ"}
              </button>
            ))}
          </div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "resource" ? "Case study deck" : "Pricing"} aria-label="Title" />
          {kind === "resource" && (
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="URL" />
          )}
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder={kind === "resource" ? "Optional one-line description" : "The answer the agent should give"}
            className="text-[13px]"
          />
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Keywords, comma separated (deck, references…)"
            aria-label="Keywords"
          />
          <Button size="sm" variant="brand" onClick={add} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Save
          </Button>
        </div>
      )}

      {items.length === 0 && !adding ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-center text-xs text-zinc-500">
          Nothing yet. Add your case-study deck, references, or pricing answer — or just answer the agent&apos;s first
          question and it&apos;ll be saved here.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((k) => (
            <li key={k.id} className="group flex items-start gap-3 rounded-xl border border-transparent px-2 py-2 hover:border-zinc-800 hover:bg-zinc-900/40">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800">
                {k.kind === "resource" ? <FileText className="size-3.5" /> : <HelpCircle className="size-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-zinc-200">{k.title}</div>
                {k.url ? (
                  <a href={k.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-sky-400 hover:underline">
                    {k.url}
                  </a>
                ) : (
                  <div className="line-clamp-2 text-xs text-zinc-500">{k.content}</div>
                )}
                <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600">
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    used {k.usageCount}×
                  </Badge>
                  {k.keywords.slice(0, 3).join(" · ")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(k.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100 text-zinc-600 hover:text-rose-400"
                aria-label={`Remove ${k.title}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
