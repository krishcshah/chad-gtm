<div align="center">

# SmartReach ⚡

**Cold outreach with zero artificial limits. Built for high-growth founders and agencies.**

100% Free Forever · Unlimited Mailboxes · Unlimited Leads · 100% Source Available

[![License: Source Available](https://img.shields.io/badge/License-Source--Available-blue.svg)](LICENSE.md)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-emerald.svg)]()
[![Made in Germany](https://img.shields.io/badge/Made%20in-Germany-amber.svg)]()

[**Start Sending Free**](https://smart-reach-staging.vercel.app/signup) · [**Explore Architecture**](#architecture) · [**License Terms**](LICENSE.md)

</div>

---

## Why SmartReach is 100% Free Forever

Mainstream outbound tools (Instantly, Smartlead, Lemlist) charge **$90 to $150+ every single month**. As soon as you scale your pipeline, you hit artificial paywalls:
- Strict contact limits (25,000 max before expensive upgrades)
- Pay-per-mailbox pricing
- Aggressive feature gating

**Our business model is selling mailboxes and deliverability infrastructure, not renting out software features.**  
Because of that, the entire SmartReach platform is **100% free forever** with zero artificial restrictions:
- Unlimited sender accounts & inboxes
- Unlimited leads & contact storage
- Unlimited multi-step sequences
- Multi-client isolated workspaces
- Unified two-way UniBox
- Zero monthly software fees

---

## Core Capabilities

- **Multi-Client Workspaces**: Complete blank-slate data isolation per client. Dedicated leads, mailboxes, campaigns, and UniBox threads that never cross paths.
- **Unlimited Mailbox Rotation**: Connect unlimited Google Workspace, Microsoft 365, Zoho, or custom SMTP/IMAP inboxes. Distributes sends evenly to protect domain reputation.
- **Intelligent Human Pacing**: Randomized intervals, customizable sending windows, and strict business-hour scheduling.
- **Automated Multi-Step Sequences**: Launch sophisticated follow-up campaigns with dynamic variables (`{{first_name}}`, `{{company}}`, custom fallbacks).
- **Instant Stop-on-Reply & UniBox**: Automated IMAP inbox sync halts follow-ups the millisecond a prospect replies and lands the full conversation in a unified multi-inbox thread.
- **AES-256-GCM Credential Encryption**: Sender credentials are encrypted at rest with hardware-grade cryptographic keys.
- **Source-Available Transparency**: 100% auditable codebase with zero proprietary lock-in.

---

## Tech Stack & Architecture

SmartReach is engineered as a clean, performant TypeScript monorepo:

- **Frontend / Fullstack**: Next.js 15 (App Router), React 19, Tailwind CSS 4, Radix UI primitives.
- **Data & ORM**: PostgreSQL (Neon serverless or local Postgres), Drizzle ORM.
- **Authentication**: Better Auth (session management, rate-limiting, secure cookies).
- **Sending Engine**: Dedicated background worker with rotation scheduler, SMTP processor, and IMAP reply-detection sync.
- **Validation**: Shared Zod schemas ensuring strict end-to-end data integrity.

```
apps/
  web                    Next.js fullstack application & UI
packages/
  ui                     Design system & UI primitives
  database               Drizzle schema, crypto encryption, merge-tag engine
  email-engine           Scheduler, rotation, SMTP processor, IMAP sync
  shared                 Constants, formatting, timezone utilities
  validation             Shared Zod validation schemas
```

---

## Self-Hosting Overview

SmartReach is **100% source-available**. If you have technical experience and want to host your own private instance for internal use, you can run the code on your own infrastructure:

### Prerequisites
- Node.js ≥ 20.x
- PostgreSQL database
- SMTP / IMAP provider accounts (Google Workspace, M365, Amazon SES, etc.)
- A process runner or supervisor for background workers (e.g., PM2, Docker, or systemd)

### General Steps
1. Clone the repository and install dependencies (`npm install`).
2. Supply required environment variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `APP_URL`).
3. Apply database schema migrations (`npm run db:migrate`).
4. Build and run the web application (`npm run build && npm run start`).
5. Run the background email-engine process in a dedicated supervisor (`npm run engine`).

> **Prefer zero server setup?**  
> You can use our hosted platform directly at zero cost:  
> 👉 [**Launch SmartReach Cloud — 100% Free Forever**](https://smart-reach-staging.vercel.app/signup)

---

## License

SmartReach is licensed under the **SmartReach Source-Available License (Non-Commercial & Internal Use Only)**.

- **You are permitted to**: Inspect, audit, customize, and self-host the software solely for personal or internal business operations.
- **You are strictly prohibited from**: Offering SmartReach as a managed cloud service, paid SaaS, white-label product, or commercial derivative service to third parties.

See the full [LICENSE.md](LICENSE.md) for legal terms.

<div align="center">
  <sub>SmartReach · Engineered with German Precision. Everything you need. Nothing you don't.</sub>
</div>
