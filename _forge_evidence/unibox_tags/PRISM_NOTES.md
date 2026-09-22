# Tip A — Unibox reply tags (0008)

## Schema
- `replies.tag` nullable text enum: `out_of_office | not_interested | interested | meeting_booked | won | lost`
- Migration: `apps/web/drizzle/0006_replies_tag.sql` (+ index `replies_tag_idx`)

## API
- `setUniboxReplyTag({ replyId, tag: Tag | null })` — server action; ownership-scoped; does **not** mutate lead status
- `getUniboxThread` inbound messages include `tag: Tag | null`
- `listReplies(userId, { limit?, tag? })` — optional cheap tag filter (legacy `listReplies(userId, limit)` still works)

## Shared
- `UNIBOX_REPLY_TAGS` / `UniboxReplyTag` in `@smartreach/shared`
- `setUniboxReplyTagSchema` in `@smartreach/validation`
