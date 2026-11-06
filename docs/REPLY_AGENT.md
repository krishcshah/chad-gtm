# Reply agent

Code: `packages/email-engine/src/reply-agent.ts` · tests: `src/__tests__/reply-agent.test.ts` · UI: `/requests`, Mission Control, UniBox.

## Lifecycle

1. `syncTick` records an inbound reply. If its campaign belongs to a `chad_gtm_runs` row with `reply_agent_mode != 'off'`, the reply gets `agent_status = 'pending'`. Replies are attributed to the **lead owner** (the client), not the mailbox owner (the pool admin).
2. `replyAgentTick` (every engine tick) claims pending replies with a conditional update (`pending → processing`), so concurrent workers never double-reply.
3. Triage: `llmTriage` when a model key is available, otherwise `heuristicTriage`. Output: intent, summary, requested resource, open question, optional draft.
4. `decideAction` (pure) returns `reply`, `escalate`, or `skip`.
5. Side effects: threaded SMTP reply from the same mailbox (`In-Reply-To`/`References`, quoted original), a `unibox_messages` row with `from_role = 'agent'`, reply tag, activity log; or an `agent_requests` row plus an email to the client.

## Policy (`decideAction`)

| Intent | Action |
|---|---|
| out_of_office | skip (sequence keeps running) |
| unsubscribe / not_interested | skip (sync already suppressed the address) |
| interested / meeting_request | reply with the booking link; escalate `booking_url` if none is set |
| resource_request | share a matching knowledge-base resource; otherwise escalate `resource` |
| question / objection | answer from an FAQ/fact (or a grounded LLM draft); otherwise escalate `question` |
| not_now | polite close with the booking link for later |
| referral | escalate (client confirms the new contact) |
| other / low confidence | escalate |

Guardrails applied after every decision:

- **Grounding:** a reply may only contain URLs that are the booking link or knowledge-base URLs; anything else becomes an `approval` request with the draft attached.
- **Thread budget:** after 4 agent replies to the same lead, the thread goes to a human.
- **Approve mode:** every reply becomes an `approval` request.
- **Suppression:** resolving a request re-checks suppressions before sending.

## Human in the loop

`/requests` lists open requests with the lead's message. The client writes an answer and/or a link; `draftRequestReplyAction` turns it into a reply (LLM polish is allowed to reword but not to add facts or links). `resolveAgentRequestAction` sends it in-thread and saves it to `agent_knowledge` (resources by what was asked for, FAQs by the question itself) so the next lead is answered automatically.

Replying manually from the UniBox also closes any open request for that reply and stops the agent from answering it.

## Verified end to end (2026-11-05, real mailboxes)

Pool senders on one domain, prospects role-played from another, client notifications to a third mailbox:

- "send me a link to book" → booking link sent in-thread.
- "remove me" → suppressed, no reply.
- "send a case study deck" (not in KB) → escalated + client emailed → client answered in Needs you → reply sent, deck saved → next lead asking for a deck got it automatically.
- Follow-up question on the agent's own email (on-prem Oracle) → escalated → answered as FAQ → next lead asking the same got the answer automatically.

Not yet covered live: LLM triage (no model key in the test environment), calendar confirmation (`meeting_booked` is still set manually; there is no calendar integration).
