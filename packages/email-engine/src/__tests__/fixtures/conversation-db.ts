/**
 * Fake Drizzle client for "Lead conversations" tests. Selects resolve by the
 * table passed to .from() and the selected field names (so the reply row, the
 * claim re-check and the pending list can differ); every write is recorded
 * with its table and set/values. Handlers read live state, so a test can
 * change the world mid-tick (e.g. from inside triage).
 */
type SelectHandler = (q: { fields: string[]; n: number }) => any[];

export interface Write {
  op: "update" | "insert" | "delete";
  table: unknown;
  set?: any;
  values?: any;
}

export function conversationDb(
  routes: Map<unknown, SelectHandler>,
  hooks: {
    onInsert?: (table: unknown, values: any) => void;
    throwOn?: (table: unknown) => boolean;
    /** Rows an update returns (default one row): [] simulates a conditional UPDATE that matched nothing. */
    updateResult?: (table: unknown, set: any) => any[];
  } = {},
) {
  const writes: Write[] = [];
  const counts = new Map<unknown, number>();
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
  const db: any = {
    select: (fields?: Record<string, unknown>) => {
      let table: unknown;
      return chain(
        () => {
          if (hooks.throwOn?.(table)) throw new Error("db read failed");
          const n = counts.get(table) ?? 0;
          counts.set(table, n + 1);
          const h = routes.get(table);
          return h ? h({ fields: fields ? Object.keys(fields) : [], n }) : [];
        },
        (prop, args) => {
          if (prop === "from") table = args[0];
        },
      );
    },
  };
  for (const op of ["update", "insert", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: Write = { op, table };
      writes.push(entry);
      return chain(
        () => (op === "update" && hooks.updateResult ? hooks.updateResult(table, entry.set) : [{ id: "row" }]),
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") {
            entry.values = args[0];
            hooks.onInsert?.(table, args[0]);
          }
        },
      );
    };
  }
  return { db, writes };
}

export function has(fields: string[], ...names: string[]): boolean {
  return names.every((n) => fields.includes(n));
}
