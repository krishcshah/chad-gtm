"use client";

import { useState } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  GitBranch,
  Inbox,
  Layers,
  Mail,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge, Button, cn } from "@smartreach/ui";

type TabKey = "sequence" | "senders" | "unibox" | "analytics";

export function InteractiveShowcase() {
  const [activeTab, setActiveTab] = useState<TabKey>("sequence");
  const [activeVariant, setActiveVariant] = useState<"A" | "B">("A");
  const [spintaxOption, setSpintaxOption] = useState<"Hi" | "Hey" | "Hello">("Hey");

  return (
    <div className="relative mx-auto mt-12 w-full max-w-6xl rounded-2xl border border-white/10 bg-card/60 p-2 shadow-2xl backdrop-blur-xl sm:p-4 md:p-6">
      {/* Decorative gradient glow behind the mockup */}
      <div className="pointer-events-none absolute -inset-1 -z-10 rounded-2xl bg-gradient-to-r from-primary/30 via-info/20 to-primary/30 opacity-70 blur-2xl" />

      {/* Showcase Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0">
          {[
            { key: "sequence", label: "Visual Sequences", icon: GitBranch },
            { key: "senders", label: "Sender Rotation", icon: Mail },
            { key: "unibox", label: "UniBox (Threaded)", icon: Inbox },
            { key: "analytics", label: "Live Deliverability", icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as TabKey)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium transition-all",
                  selected
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Interactive Live Mockup</span>
        </div>
      </div>

      {/* Tab 1: Sequence Builder Mockup */}
      {activeTab === "sequence" && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-4">
            <div>
              <h3 className="font-semibold text-base text-foreground">SaaS Founders Outreach Sequence</h3>
              <p className="text-xs text-muted-foreground">3 automated steps with human-paced delay and A/B split testing</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-border/80 bg-background px-2.5 py-1 text-xs text-muted-foreground font-mono">
                Pacing: ~90–240s randomized
              </span>
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                100% Primary Inbox
              </Badge>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-center">
            {/* Step 1 Node */}
            <div className="rounded-xl border border-primary/40 bg-card p-4 shadow-sm transition-all hover:border-primary">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Step 1 · Initial</span>
                <span className="text-[10px] text-muted-foreground">Sends immediately</span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Subject Line</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveVariant("A")}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold",
                        activeVariant === "A" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveVariant("B")}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold",
                        activeVariant === "B" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      B (50%)
                    </button>
                  </div>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs font-mono text-muted-foreground">
                  {activeVariant === "A" ? (
                    <span>Quick question regarding <span className="text-primary font-bold">{"{{company}}"}</span></span>
                  ) : (
                    <span>Ideas for scaling outreach at <span className="text-primary font-bold">{"{{company}}"}</span></span>
                  )}
                </div>
                <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground line-clamp-3">
                  <span className="text-primary font-bold">{spintaxOption}</span> {"{{first_name}}"}, noticed your recent launch on Product Hunt and wanted to share how we solve deliverability…
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-muted-foreground">Spintax:</span>
                  {(["Hey", "Hi", "Hello"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setSpintaxOption(opt)}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] transition-colors",
                        spintaxOption === opt ? "bg-primary/20 text-primary font-bold" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Delay Indicator 1 */}
            <div className="hidden md:flex flex-col items-center justify-center gap-1">
              <span className="h-6 w-px bg-border" />
              <div className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-mono text-muted-foreground shadow-2xs">
                Wait 3 days
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>

            {/* Step 2 Node */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-border/80">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Step 2 · Follow-up 1</span>
                <span className="text-[10px] text-muted-foreground">Wait 3 days</span>
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Same Thread Reply</p>
                <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs font-mono text-muted-foreground truncate">
                  Re: Quick question regarding {"{{company}}"}
                </div>
                <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground line-clamp-3">
                  Circling back on this {"{{first_name}}"} — wanted to make sure you didn&apos;t miss my note earlier this week…
                </div>
                <div className="rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="size-3" /> Auto-stops if prospect replies
                </div>
              </div>
            </div>

            {/* Delay Indicator 2 */}
            <div className="hidden md:flex flex-col items-center justify-center gap-1">
              <span className="h-6 w-px bg-border" />
              <div className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-mono text-muted-foreground shadow-2xs">
                Wait 4 days
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>

            {/* Step 3 Node */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-border/80">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Step 3 · Breakup</span>
                <span className="text-[10px] text-muted-foreground">Wait 4 days</span>
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Final Bump</p>
                <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs font-mono text-muted-foreground truncate">
                  Should I close this out?
                </div>
                <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground line-clamp-3">
                  Assuming you&apos;re heads down right now! If timing isn&apos;t right, I will leave you alone. Best of luck with {"{{company}}"}!
                </div>
                <div className="rounded bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary flex items-center gap-1">
                  <Sparkles className="size-3" /> Includes 1-click opt-out token
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Sender Rotation Showcase */}
      {activeTab === "senders" && (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-4">
            <div>
              <h3 className="font-semibold text-base text-foreground">Intelligent Sender Account Rotation</h3>
              <p className="text-xs text-muted-foreground">
                Spread volume evenly across unlimited mailboxes. Never exceed provider limits or trip spam filters.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10">
                12 Inboxes Connected
              </Badge>
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                Round-Robin Algorithm
              </Badge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { email: "alex@getsmartreach.co", name: "Alex Rivers", provider: "Google Workspace", used: 34, limit: 50, health: "100% Optimal" },
              { email: "sarah@growthreach.io", name: "Sarah Chen", provider: "Microsoft 365", used: 28, limit: 45, health: "99% Optimal" },
              { email: "marcus@trysmartreach.com", name: "Marcus Brody", provider: "Google Workspace", used: 41, limit: 50, health: "100% Optimal" },
              { email: "elena@smartreachout.net", name: "Elena Rostova", provider: "Custom SMTP", used: 19, limit: 40, health: "98% Optimal" },
              { email: "jordan@reachscale.co", name: "Jordan Blake", provider: "Microsoft 365", used: 31, limit: 50, health: "100% Optimal" },
              { email: "devon@outboundreach.org", name: "Devon Vance", provider: "Google Workspace", used: 22, limit: 45, health: "100% Optimal" },
            ].map((sender, idx) => (
              <div key={sender.email} className="rounded-xl border border-border/70 bg-card p-4 transition-all hover:border-primary/50 shadow-sm space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate text-foreground">{sender.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{sender.email}</p>
                  </div>
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-bold">
                    ✓
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{sender.provider}</span>
                  <span className="font-mono text-[11px] text-emerald-400">{sender.health}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Daily quota used</span>
                    <span className="font-mono font-medium text-foreground">{sender.used} / {sender.limit}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(sender.used / sender.limit) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: UniBox Live Inbox Showcase */}
      {activeTab === "unibox" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr] rounded-xl border border-border/60 bg-card overflow-hidden">
          {/* Thread List */}
          <div className="border-r border-border/60 bg-muted/10 p-3 space-y-2">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Prospects</span>
              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">3 New</span>
            </div>
            {[
              { name: "Michael Vance", company: "AeroTech", tag: "Interested", time: "10m ago", snippet: "Yes! Can you send over a deck or calendar link?", active: true },
              { name: "Clara Oswald", company: "Tardis Labs", tag: "Meeting booked", time: "1h ago", snippet: "Booked a slot for Thursday 2 PM EST.", active: false },
              { name: "David Kim", company: "FinStack", tag: "Out of office", time: "3h ago", snippet: "I am out of the office until next Monday.", active: false },
            ].map((lead) => (
              <div
                key={lead.name}
                className={cn(
                  "cursor-pointer rounded-lg p-3 text-left transition-colors border",
                  lead.active
                    ? "border-primary/40 bg-accent text-accent-foreground"
                    : "border-border/40 hover:bg-muted/40",
                )}
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-xs text-foreground">{lead.name}</span>
                  <span className="text-[10px] text-muted-foreground">{lead.time}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{lead.company}</span>
                <p className="mt-1 line-clamp-1 text-xs text-foreground/80">{lead.snippet}</p>
                <div className="mt-2">
                  <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500 border border-emerald-500/20">
                    {lead.tag}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Conversation & Composer */}
          <div className="p-4 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <div>
                  <h4 className="font-semibold text-sm text-foreground">Michael Vance &lt;michael@aerotech.example&gt;</h4>
                  <p className="text-xs text-muted-foreground">In response to: Q1 Enterprise Infrastructure Growth</p>
                </div>
                <Badge variant="outline" className="text-xs text-emerald-500 border-emerald-500/30">
                  Tag: Interested
                </Badge>
              </div>

              {/* Inbound Prospect Message */}
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 space-y-1 max-w-lg">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Michael Vance</span>
                  <span>10:42 AM (10m ago)</span>
                </div>
                <p className="text-xs text-foreground/90">
                  Hey Alex, thanks for reaching out. We are actually exploring a transition to dedicated infrastructure this quarter. Do you have 15 minutes this Thursday afternoon? Send over a calendar link!
                </p>
              </div>

              {/* Email Composer Simulation */}
              <div className="rounded-xl border border-border/80 bg-background shadow-xs overflow-hidden">
                <div className="space-y-1 border-b border-border/50 bg-muted/30 px-3.5 py-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span><strong className="text-foreground">From:</strong> Alex Rivers &lt;alex@getsmartreach.co&gt;</span>
                    <span className="text-[10px] text-muted-foreground">⌘+Enter to send</span>
                  </div>
                  <div>
                    <span><strong className="text-foreground">To:</strong> Michael Vance &lt;michael@aerotech.example&gt;</span>
                  </div>
                  <div>
                    <span><strong className="text-foreground">Subject:</strong> Re: Q1 Enterprise Infrastructure Growth</span>
                  </div>
                </div>
                <div className="p-3 text-xs text-foreground font-sans">
                  Hi Michael,<br /><br />
                  Fantastic to hear. You can grab any slot that suits your schedule here: cal.com/alex/15min.<br /><br />
                  Looking forward to catching up!
                </div>
                <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-3.5 py-2">
                  <Button size="sm" className="h-8 gap-1.5 text-xs">
                    <Send className="size-3.5" /> Send Email
                  </Button>
                  <span className="text-[11px] text-muted-foreground">Quoted thread & In-Reply-To preserved</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Live Analytics Showcase */}
      {activeTab === "analytics" && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Emails Delivered", val: "18,420", sub: "99.4% Inbox Rate", color: "text-foreground" },
              { label: "Open Rate", val: "68.2%", sub: "12,562 unique opens", color: "text-blue-400" },
              { label: "Click Rate", val: "24.8%", sub: "4,568 link clicks", color: "text-purple-400" },
              { label: "Unique Replies", val: "14.2%", sub: "2,615 prospects responded", color: "text-emerald-400" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border/70 bg-card p-4 space-y-1">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <p className={cn("text-2xl font-bold tracking-tight", stat.color)}>{stat.val}</p>
                <p className="text-[11px] text-muted-foreground">{stat.sub}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm text-foreground">Campaign Trajectory (Last 30 Days)</h4>
                <p className="text-xs text-muted-foreground">Smooth Bézier spline curves with interactive crosshair precision</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-500" /> Sent</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-purple-500" /> Opens</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" /> Replies</span>
              </div>
            </div>

            {/* Visual SVG chart preview */}
            <div className="h-44 w-full relative flex items-end justify-between px-2 pt-6">
              <svg className="absolute inset-0 size-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 500 120">
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,100 C80,85 120,40 200,50 C280,60 340,20 420,30 C460,35 480,15 500,20 L500,120 L0,120 Z"
                  fill="url(#chartGrad)"
                />
                <path
                  d="M0,100 C80,85 120,40 200,50 C280,60 340,20 420,30 C460,35 480,15 500,20"
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2.5"
                />
                <path
                  d="M0,110 C80,100 120,70 200,75 C280,80 340,45 420,50 C460,55 480,40 500,45"
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="2"
                />
                <path
                  d="M0,115 C80,112 120,95 200,98 C280,92 340,80 420,82 C460,78 480,68 500,70"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                />
                <circle cx="420" cy="30" r="4.5" fill="#6366f1" stroke="#ffffff" strokeWidth="1.5" />
                <circle cx="420" cy="50" r="4.5" fill="#a855f7" stroke="#ffffff" strokeWidth="1.5" />
                <circle cx="420" cy="82" r="4.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
