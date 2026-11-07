/**
 * Fake Drizzle client backed by small in-memory tables, for reply routing and
 * person-level lead outcome tests. Each select is answered from the table
 * passed to .from() and the rendered WHERE (SQL text + params), so a test can
 * tell "jobs to this address" from "jobs to this domain". Every write is
 * recorded with its table, set/values and rendered WHERE.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

const dialect = new PgDialect();

export interface FakeJob {
  id: string;
  campaignId: string;
  senderId: string;
  leadId: string;
  toEmail: string;
  status: string;
  messageId?: string | null;
  sentAt: string;
}
export interface FakeLead {
  id: string;
  userId: string;
  email: string;
  workspaceId?: string | null;
  status: string;
  deletedAt?: string | null;
}
export interface FakeCampaign {
  id: string;
  userId: string;
  workspaceId?: string | null;
  stopOnReply: boolean;
}
export interface FakeCampaignLead {
  id: string;
  campaignId: string;
  leadId: string;
  status: string;
}

export interface World {
  jobs?: FakeJob[];
  leads?: FakeLead[];
  campaigns?: FakeCampaign[];
  campaignLeads?: FakeCampaignLead[];
  /** Addresses of our own mailboxes. */
  mailboxes?: string[];
}

export interface RecordedWrite {
  op: "update" | "insert" | "delete";
  table: unknown;
  set?: any;
  values?: any;
  where?: { sql: string; params: unknown[] };
}

function render(q: unknown): { sql: string; params: unknown[] } {
  if (!q) return { sql: "", params: [] };
  const out = dialect.sqlToQuery(q as any);
  return { sql: out.sql.replace(/\s+/g, " "), params: out.params };
}

export function routingDb(world: World) {
  const writes: RecordedWrite[] = [];
  const jobs = world.jobs ?? [];
  const leads = world.leads ?? [];
  const campaigns = world.campaigns ?? [];
  const campaignLeads = world.campaignLeads ?? [];
  const campaignOf = (id: string) => campaigns.find((c) => c.id === id);

  const newestPerOwner = (rows: FakeJob[], withLead: boolean) => {
    const sorted = [...rows].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    const out = new Map<string, any>();
    for (const j of sorted) {
      const c = campaignOf(j.campaignId);
      if (!c || out.has(c.userId)) continue;
      out.set(c.userId, {
        userId: c.userId,
        campaignId: j.campaignId,
        workspaceId: c.workspaceId ?? null,
        jobId: j.id,
        sentAt: j.sentAt,
        ...(withLead ? { leadId: j.leadId } : {}),
      });
    }
    return [...out.values()];
  };

  const answer = (table: unknown, fields: string[], where: { sql: string; params: unknown[] }): any[] => {
    const p = where.params;
    if (table === schema.emailJobs) {
      if (where.sql.includes('"message_id" in')) {
        return jobs
          .filter((j) => p.includes(j.senderId) && j.messageId && p.includes(j.messageId))
          .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
      }
      if (where.sql.includes(" like ")) {
        const pattern = String(p.find((x) => typeof x === "string" && x.startsWith("%@")) ?? "");
        const domain = pattern.slice(2).replace(/\\(.)/g, "$1");
        const since = String(p[p.length - 1]);
        return newestPerOwner(
          jobs.filter(
            (j) =>
              p.includes(j.senderId) &&
              ["sent", "bounced"].includes(j.status) &&
              j.toEmail.toLowerCase().endsWith(`@${domain}`) &&
              j.sentAt >= since,
          ),
          false,
        );
      }
      if (where.sql.includes('lower("email_jobs"."to_email") =')) {
        return newestPerOwner(
          jobs.filter((j) => p.includes(j.senderId) && j.status === "sent" && p.includes(j.toEmail.toLowerCase())),
          true,
        );
      }
      return [];
    }
    if (table === schema.leads) {
      if (where.sql.includes('lower("leads"."email")')) {
        return leads
          .filter((l) => p.includes(l.userId) && p.includes(l.email.toLowerCase()) && !l.deletedAt)
          .map((l) => (fields.length === 1 && fields[0] === "id" ? { id: l.id } : l));
      }
      return leads.filter((l) => p.includes(l.id));
    }
    if (table === schema.campaignLeads && fields.includes("stopOnReply")) {
      return campaignLeads
        .filter((cl) => p.includes(cl.leadId))
        .map((cl) => ({
          campaignLeadId: cl.id,
          campaignId: cl.campaignId,
          status: cl.status,
          stopOnReply: campaignOf(cl.campaignId)?.stopOnReply ?? true,
        }));
    }
    if (table === schema.senderAccounts) {
      return (world.mailboxes ?? []).filter((m) => p.includes(m.toLowerCase())).map((m) => ({ id: m }));
    }
    return [];
  };

  const chain = (resolve: () => any, onCall?: (prop: string, args: any[]) => void): any => {
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then" || prop === "catch") {
            const p = Promise.resolve().then(resolve);
            return (p as any)[prop].bind(p);
          }
          return (...args: any[]) => {
            onCall?.(String(prop), args);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const selectWith = (fields?: Record<string, unknown>) => {
    let table: unknown;
    let where: unknown;
    return chain(
      () => answer(table, fields ? Object.keys(fields) : [], render(where)),
      (prop, args) => {
        if (prop === "from") table = args[0];
        if (prop === "where") where = args[0];
      },
    );
  };

  const db: any = {
    select: (fields?: Record<string, unknown>) => selectWith(fields),
    selectDistinctOn: (_on: unknown, fields?: Record<string, unknown>) => selectWith(fields),
  };
  for (const op of ["update", "insert", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: RecordedWrite = { op, table };
      writes.push(entry);
      return chain(
        () => [{ id: "row" }],
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
          if (prop === "where") entry.where = render(args[0]);
        },
      );
    };
  }
  return { db, writes };
}
