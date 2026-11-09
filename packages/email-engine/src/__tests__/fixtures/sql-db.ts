/**
 * A fake EngineDb that builds every query with real Drizzle (drizzle.mock)
 * and hands the generated SQL to a handler instead of a database. Tests can
 * route results by SQL text and assert on the exact SQL (filters, order,
 * limits) and on the values written.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { schema } from "@smartreach/database";

export interface SqlCall {
  op: "select" | "update" | "insert" | "delete";
  sql: string;
  params: unknown[];
  set?: Record<string, unknown>;
  values?: any;
}

export function sqlDb(handler: (c: SqlCall) => any[] | undefined | void) {
  const real: any = drizzle.mock({ schema });
  const calls: SqlCall[] = [];
  const wrap = (qb: any, call: Partial<SqlCall>): any => {
    const proxy: any = new Proxy(qb, {
      get(target, prop) {
        if (prop === "then" || prop === "catch") {
          const q = target.toSQL();
          const c = { ...call, sql: q.sql, params: q.params } as SqlCall;
          calls.push(c);
          const p = Promise.resolve().then(() => handler(c) ?? []);
          return (prop === "then" ? p.then : p.catch).bind(p);
        }
        const v = target[prop];
        if (typeof v !== "function") return v;
        return (...args: any[]) => {
          if (prop === "set") call.set = args[0];
          if (prop === "values") call.values = args[0];
          const r = v.apply(target, args);
          if (r === target) return proxy;
          return r && typeof r.toSQL === "function" ? wrap(r, call) : r;
        };
      },
    });
    return proxy;
  };
  const db: any = {
    select: (...a: any[]) => wrap(real.select(...a), { op: "select" }),
    update: (t: any) => wrap(real.update(t), { op: "update" }),
    insert: (t: any) => wrap(real.insert(t), { op: "insert" }),
    delete: (t: any) => wrap(real.delete(t), { op: "delete" }),
  };
  return { db, calls };
}

/** The table a statement reads or writes. */
export function tableOf(c: SqlCall): string {
  const m = /(?:from|update|insert into|delete from) "([a-z_]+)"/i.exec(c.sql);
  return m?.[1] ?? "";
}
