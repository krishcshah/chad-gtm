# AutoGTM design system

AutoGTM is a calm, precise work tool for founders running outbound. The
interface should feel like Linear, Attio or Stripe: quiet surfaces, one clear
action per area, real data in the foreground, no decoration that does not
carry information.

The reference screens are `app/(app)/dashboard/` (signed-in app) and the
shell in `components/app-sidebar.tsx`. Match them.

## Principles

1. **Content first.** Numbers, names and states are the interface. Chrome
   (borders, fills, icons) recedes.
2. **One primary action per view.** Everything else is `outline` or `ghost`.
3. **Say it plainly.** Sentence case everywhere. Short, concrete labels:
   "Emails sent", not "Outbound Dispatch Telemetry". No jargon the user did
   not type themselves.
4. **Both themes.** Light is the default; dark must look equally finished.
   Only semantic tokens make that free.
5. **Honest UI.** No fake metrics, fake "live" indicators, decorative
   telemetry, invented percentages or placeholder numbers. If there is no
   data, show an empty state that says what will appear and how to get it.

## Never do this (the old UI did)

- `uppercase tracking-widest` micro-labels, mono-font uppercase labels,
  `text-[9px]`/`text-[10px]`/`text-[11px]` body text. Minimum text is
  `text-xs` (12px) and only for metadata; body is `text-sm`/`text-[13px]`.
- Gradients, glows, glassmorphism, `backdrop-blur` cards, `card-shine`,
  coloured shadows, animated borders, emoji in UI.
- Raw palette classes (`zinc-800`, `emerald-400`, `text-white`, `bg-black`,
  `#hex`). The `design-tokens` test fails the build on them. The rare
  justified exception (e.g. a third-party brand logo) gets a
  `// design-tokens-allow` comment on that line.
- Badges as decoration ("AI", "Root", "System-Matched"). A badge states a
  status or a count.
- Several competing call-to-action buttons in one header.
- Walls of cards inside cards. One level of card; inside it use dividers.

## Tokens

All colours are CSS variables in `app/globals.css`, exposed as Tailwind
colours. Use these and only these:

| Purpose | Classes |
|---|---|
| Page canvas | `bg-background` |
| Surfaces (cards, popovers, inputs) | `bg-card`, `bg-popover` |
| Subtle fill, hover, table header | `bg-muted`, hover `bg-muted` / `bg-accent` |
| Text | `text-foreground` (primary), `text-muted-foreground` (secondary), `text-subtle-foreground` (tertiary/meta) |
| Borders | `border-border` (default hairline), `border-border-strong` (controls, dashed empties) |
| Primary action | `bg-primary text-primary-foreground` (ink in light, near-white in dark) |
| Brand accent | `bg-brand`, `text-brand`, `bg-brand-soft`, `text-brand-text`. Use sparingly: active nav icon, the logo, key highlights, marketing CTAs |
| Status | `success`, `warning`, `destructive`, `info`, each with `-soft` (background) and `-text` (readable text on the soft background), e.g. `bg-success-soft text-success-text` |
| Charts | `chart-1` … `chart-5` (`var(--chart-1)` in SVG) |
| Overlay | `bg-overlay` |

Opacity modifiers on tokens are fine (`bg-muted/50`, `border-brand/20`).

Typography: Geist Sans for UI (`font-sans`), Geist Mono only for code,
IDs, email addresses in technical contexts and tabular data that benefits
from it (`font-mono`), Instrument Serif (`font-display`) only on marketing
headlines. Numbers in stats and tables use `tabular`.

Scale: page title `text-2xl font-semibold tracking-[-0.025em]` (PageHeader
does it), card title `text-[15px] font-semibold`, body `text-sm`, dense
UI/table text `text-[13px]`, metadata `text-xs text-subtle-foreground`.

Radius: controls `rounded-md`, cards `rounded-xl`, dialogs `rounded-2xl`,
pills/badges `rounded-full`.

Spacing: pages use `gap-8` between sections (Page does it), `gap-6` between
cards in a grid, `p-5` inside cards, `gap-4`/`gap-5` between form fields.

## Layout

Every signed-in page renders inside `<Page>` from
`@/components/layout/page`:

```tsx
<Page>                       // max-w-6xl, gutters, vertical rhythm
<Page width="narrow">        // forms, settings (max-w-3xl)
<Page width="wide">          // dense tables (max-w-[1440px])
<Page full>                  // split views that fill the viewport (inbox, big tables)
```

and starts with `<PageHeader title description actions eyebrow meta />`
from `@smartreach/ui`. `eyebrow` is for a back link/breadcrumb
(`<Link href="/campaigns">← Campaigns</Link>` style, using `ArrowLeft`), never a
decorative label.

Grids: dashboards use `grid gap-6 lg:grid-cols-3` with a 2/1 split.
Everything must work at 375px wide: stack columns, let tables scroll
horizontally, wrap header actions.

## Components (`@smartreach/ui`)

- `Button` variants: `primary` (default), `outline`, `secondary`, `ghost`,
  `destructive`, `destructive-outline`, `link`, `brand` (marketing and the one
  "launch" moment only). Sizes `xs`, `sm`, `md`, `lg`, `icon`, `icon-sm`,
  `icon-xs`. `loading` shows a spinner and disables. Icons go inside as
  children; they are sized automatically.
- `Card`, `CardHeader` (has an `actions` prop), `CardTitle`,
  `CardDescription`, `CardContent`, `CardFooter`.
- `Stat` metric tile; for a joined strip:
  `<Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card"><Stat bare … /></Card>`.
- `Badge` variants `neutral`, `brand`, `success`, `warning`, `destructive`,
  `info`, `outline`, `solid`; `dot` for status. `statusVariant(status)` maps
  domain statuses. Status text is sentence case (`capitalize` the raw value).
- `Table`, `TableContainer`, `TableHeader`, `TableRow`, `TableHead`,
  `TableCell`. Put tables in a `Card`/`TableContainer`. Row click targets are
  links on the primary cell.
- Forms: `Field` (label, hint, error, required/optional, action) wrapping
  `Input`, `Textarea`, `Select`/`NativeSelect`, `Switch`, `Checkbox`.
  Labels above controls. Hints say what the value is used for.
- `Tabs` (`TabsList variant="underline"` for page sections, `"pill"` inside
  cards), `SegmentedControl` for filters and ranges.
- `Dialog` for short focused tasks and confirmations (`ConfirmDialog` for
  destructive confirmations). `Sheet` (+ `SheetHeader`, `SheetBody`,
  `SheetFooter`) for record details and long forms.
- `DropdownMenu` for row actions (`MoreHorizontal` icon button,
  `variant="ghost" size="icon-sm"`); `destructive` items last after a separator.
- `Alert` for inline notices (with `action`), `toast` for results of actions.
- `EmptyState` (use `compact` inside cards), `StatePanel`/`ErrorState`,
  `Skeleton`, `TableSkeleton`, `PageSkeleton`.
- `Tooltip` for icon-only buttons, `Kbd`, `StatusDot`, `SectionHeader`,
  `DataList` (key/value rows), `Progress`, `Avatar`.

Icons: lucide-react, `size-4` in UI, `strokeWidth` default. Icons support
text; they are not decoration on every heading.

## Patterns

- **List page**: PageHeader (title, one-line description, primary action) →
  optional filter row (search `Input` with `Search` icon, `SegmentedControl`
  or `Select` filters) → table/card list → empty state.
- **Detail page**: PageHeader with back eyebrow, status `meta` badges and
  actions (primary + `DropdownMenu` for the rest) → `Stat` strip → `Tabs`.
- **Settings**: `Page width="narrow"`; each section is a `Card` with
  `CardHeader` + `CardContent` form + `CardFooter` with the save button.
  Danger zone last, `destructive-outline` buttons.
- **Wizard**: step indicator (numbered, current step bold, completed steps
  checked), one question per step, Back (`outline`) / Continue (`primary`)
  pinned at the bottom of the card.
- **Loading**: skeletons shaped like the content; buttons use `loading`.
- **Errors**: inline `Field` errors for validation, `toast.error` for failed
  actions, `ErrorState` for failed page loads.
- **Destructive actions** always confirm with `ConfirmDialog` and name the
  thing being deleted.

## Copy

- Sentence case for everything, including buttons and titles.
- Verbs on buttons: "Save changes", "Connect mailbox", "Start campaign".
- Explain consequences, not mechanics: "Nothing is sent until you approve
  the sequence."
- Numbers: `toLocaleString()`, percentages without decimals unless < 10.
- Dates: `timeAgo()` for recent events, `formatDate()` otherwise
  (`@smartreach/shared`).

## Accessibility

Real `<button>`/`<a>` elements, labels on every control (`Field` does it),
`aria-label` on icon-only buttons, visible focus (tokens provide the ring),
4.5:1 text contrast (use `-text` tokens on soft backgrounds), never colour
alone for status (pair a dot with a word).
