# F11c Unibox thread — Prism contract

## UniboxThreadMessage
```ts
{
  id: string;                       // e.g. campaign:<jobId> | inbound:<replyId> | operator:<rowId>
  direction: "campaign" | "inbound" | "operator";
  fromRole: "automation" | "lead" | "operator";
  fromName: string;
  fromEmail: string;
  subject: string | null;
  bodyHtml: string;
  bodyText: string;
  sentAt: string;                   // ISO-8601
}
```

## APIs
- `getUniboxThread({ replyId } | { leadId, campaignId? })` → `{ ok, data: { messages } }` ascending by `sentAt`
- `sendUniboxReply({ replyId, body })` → SMTP send + persist `unibox_messages` operator row + `{ ok, data: { message } }` for optimistic append

## UI
- campaign + inbound → LEFT
- operator → RIGHT

## Storage
- campaign outbound: `email_jobs` (status=sent)
- inbound: `replies`
- operator: new table `unibox_messages` (migration `0005_unibox_messages.sql`)
