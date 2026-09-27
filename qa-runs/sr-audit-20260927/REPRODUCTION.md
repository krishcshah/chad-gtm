# SmartReach Defect Reproduction Guide & Setup Instructions

**Target Application:** `https://130-61-146-177.sslip.io/`  
**Run ID:** `sr-audit-20260927`  
**Commit:** `d28e3c8d9a15300647c54bf9a14ca11fbd1966b5`  

---

## Prerequisites
1. Node.js >= 20.x, Python 3.10+
2. SSH access to Oracle Cloud VM (`ubuntu@130.61.146.177`) via `~/.oci/smartreach_id_rsa`.
3. Provisioned test mailboxes: Run `node scripts/qa-provision-mailboxes.cjs` to provision 17 controlled Ethereal mailboxes.

---

## Reproducing Bug SR-001 (P1 High): Duplicate Key Unique Constraint in Scheduler

### Preconditions
- A campaign with status `'running'` exists.
- At least one `campaign_leads` row has `status = 'queued'`.
- An `email_jobs` record already exists with the same `(campaign_lead_id, step_position)` (e.g. from an earlier interrupted run or demo seed).

### Reproduction Command
```bash
# Query PostgreSQL on the production VM to inspect the crash
python scripts/remote_exec.py "pm2 logs smartreach-worker --lines 40 --nostream"
```

### Observed Error
```text
error: duplicate key value violates unique constraint "email_jobs_campaign_lead_step_unique"
Detail: Key (campaign_lead_id, step_position)=(cl_cmp_demo_5_lead_lst_demo_4_976, 1) already exists.
at async scheduleCampaign (/home/ubuntu/smart-reach/packages/email-engine/src/scheduler.ts:310:5)
```
**Impact:** Campaign is added to `skipped=[...: error]` and halts execution. The lead remains permanently stuck in `status = 'scheduled'`.

---

## Reproducing Bug SR-002 (P1 High): Malformed Encrypted Secret in IMAP Sync

### Preconditions
- A sender account exists in PostgreSQL with a dummy password string not formatted as `iv:authTag:ciphertext` (e.g. seeded demo accounts).

### Reproduction Command
```bash
# Trigger an engine tick via API
curl -k -X POST https://130-61-146-177.sslip.io/api/engine/tick
```

### Observed Output
```json
{
  "sync": {
    "checked": 30,
    "repliesFound": 0,
    "errors": [
      "alex.v@ratecompany.com: Malformed encrypted secret",
      "marcus.k@ratecompany.de: Malformed encrypted secret"
    ]
  }
}
```
**Impact:** Unhandled decryption exception prevents degraded mailboxes from being quarantined, causing continuous error logging on every sync cycle.

---

## Reproducing Bug SR-003 (P2 Medium): Operator UniBox Reply Omit Workspace ID

### Preconditions
- User has logged into SmartReach and opened a conversation in UniBox.
- Send an operator reply from the composer.

### Verification Command
```bash
python scripts/db_query.py "SELECT id, user_id, workspace_id, direction, from_email FROM unibox_messages WHERE direction = 'operator' ORDER BY created_at DESC LIMIT 5;"
```

### Observed Result
`workspace_id` is `NULL`.

---

## Reproducing Bug SR-004 (P2 Medium): Wizard Delay Validation Silent Failure

### Preconditions
- Navigate to `/campaigns/new`.
- Advance to Step 5 (Schedule & Settings).
- Change "Minimum Delay" to `2` seconds and "Maximum Delay" to `4` seconds.
- Advance to Step 6 and click "Start Campaign".

### Observed Behavior
The page does not advance to the campaign detail view. No inline error message highlights the invalid field on Step 5.
