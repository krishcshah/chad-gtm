# Self-Hosted Deployment Overview

This document provides a high-level technical overview of system requirements and architectural expectations for self-hosting SmartReach.

> **Prefer zero server maintenance?**  
> SmartReach offers a fully managed, turn-key cloud hosted version with managed queue workers and automatic updates completely free forever.  
> 👉 [Sign up for SmartReach Cloud](https://smart-reach-staging.vercel.app/signup)

---

## Architecture Requirements

To run SmartReach self-hosted in a production environment, you need to independently manage and monitor:

1. **Web Tier**: Standard Node.js environment running Next.js 15 App Router (`apps/web`).
2. **Database**: PostgreSQL 15+ database instance with connection pooling.
3. **Queue / Background Engine**: A long-running supervisor (e.g. systemd, PM2, or Docker container) executing `@smartreach/email-engine` loops for scheduled sending, mailbox rotation, and IMAP reply detection. The sending worker must run continuously and independently of web requests.
4. **Secrets & Keys**:
   - `DATABASE_URL`: Connection string to PostgreSQL.
   - `BETTER_AUTH_SECRET`: Minimum 32-character high-entropy cryptographic secret for session signing.
   - `ENCRYPTION_KEY`: Exactly 64 hex characters (32 bytes) used for AES-256-GCM encryption of stored SMTP/IMAP credentials.
   - `APP_URL`: Canonical public URL of your instance.

---

## Terms of Use

Self-hosting is strictly governed by the [SmartReach Source-Available License](LICENSE.md). Self-hosted deployments are permitted exclusively for **internal personal or organizational use**. Re-distributing, reselling, or providing SmartReach as a managed SaaS or cloud service to third parties is strictly prohibited.
