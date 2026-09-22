# Unibox bodyHtml / IMAP decode fix

## Root causes (staging)
- `replies` had only `body_text`; ingest dumped QP/latin1 mishmash into it
- QP used `String.fromCharCode(parseInt(h,16))` → mojibake (`â€”` / `Â`)
- Unibox selected `bodyText` and rendered via `<EmailBody html={r.bodyText} />`
- Staging unsubscribe URLs / postal footers leaked into stored body

## Fix
- Schema + migration `0004_replies_body_html.sql`: `body_html text not null default ''`
- `sync-replies.ts`: UTF-8 QP decode, separate text/html parts, strip unsub/postal leakage
- Unibox page returns `bodyHtml`+`bodyText`; client prefers `bodyHtml || bodyText`
- Tests: QP utf8, html/text split, strip unsub URL

## Patch
- Commit message: `fix(unibox): store html/text bodies separately and fix IMAP decode`
- format-patch **0006** (0005 reserved for F15a blocklist)
