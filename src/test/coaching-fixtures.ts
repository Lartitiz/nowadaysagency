// In-memory PostgREST fixture. No production data or network calls.
export function coachingDatabase(initial: Record<string, any[]> = {}) {
  const rows = structuredClone(initial);
  const calls: Array<{ table: string; action: string; payload?: any; filters: Array<[string, unknown]> }> = [];
  let failure: { table: string; action: string } | null = null;
  const from = (table: string) => {
    let action = "read";
    let payload: any;
    let count: "many" | "one" | "maybe" = "many";
    const filters: Array<[string, unknown]> = [];
    const execute = async () => {
      calls.push({ table, action, payload: structuredClone(payload), filters: [...filters] });
      if (failure?.table === table && failure.action === action) return { data: null, error: new Error("fixture failure") };
      const matches = (rows[table] || []).filter(r => filters.every(([k, v]) => (r[k] ?? null) === v));
      let result = matches;
      if (action === "insert") {
        result = [{ id: crypto.randomUUID(), ...structuredClone(payload) }];
        (rows[table] ||= []).push(...result);
      }
      if (action === "update") for (const row of matches) Object.assign(row, structuredClone(payload));
      if (count !== "many" && (result.length > 1 || (count === "one" && !result.length))) return { data: null, error: new Error("invalid row count") };
      return { data: count === "many" ? structuredClone(result) : structuredClone(result[0] || null), error: null };
    };
    const query: any = {
      select: () => query,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return query; },
      is: (k: string, v: unknown) => { filters.push([k, v]); return query; },
      match: (values: Record<string, unknown>) => { filters.push(...Object.entries(values)); return query; },
      order: () => query, limit: () => query,
      update: (p: any) => { action = "update"; payload = p; return query; },
      insert: (p: any) => { action = "insert"; payload = p; return query; },
      single: () => { count = "one"; return execute(); },
      maybeSingle: () => { count = "maybe"; return execute(); },
      then: (resolve: any, reject: any) => execute().then(resolve, reject),
    };
    return query;
  };
  return { rows, calls, from, fail: (table: string, action: string) => { failure = { table, action }; }, recover: () => { failure = null; } };
}
