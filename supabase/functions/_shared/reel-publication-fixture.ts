// In-memory transport fixture; the migration itself is tested with PostgreSQL.
export function reelLedgerFixture() {
  const rows = new Map<string, any>();
  let failReceipt = false;
  const from = () => {
    let op = "select", values: any, filters: [string, any][] = [];
    const run = () => {
      if (op === "insert") {
        if (rows.has(values.id)) return { data: null, error: { code: "23505" } };
        rows.set(values.id, { state: "preparing", ...values });
        return { data: values, error: null };
      }
      const row = [...rows.values()].find(r => filters.every(([k,v]) => r[k] === v));
      if (!row) return { data: null, error: { code: "missing" } };
      if (op === "delete") rows.delete(row.id);
      if (op === "update") {
        if (failReceipt && values.state === "published") return { data: null, error: { code: "offline" } };
        Object.assign(row, values);
      }
      return { data: { ...row }, error: null };
    };
    const q: any = {
      insert: (v: any) => { op = "insert"; values = v; return q; },
      update: (v: any) => { op = "update"; values = v; return q; },
      delete: () => { op = "delete"; return q; },
      eq: (k: string,v: any) => { filters.push([k,v]); return q; },
      select: () => q, single: async () => run(),
      then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve,reject),
    };
    return q;
  };
  return { from, rows, failReceipt: () => { failReceipt = true; } };
}
