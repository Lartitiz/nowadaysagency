/** Retry only transient read failures, never permission/schema errors or writes. */
export async function readIdeaList<T>(
  read: () => PromiseLike<{ data: T[] | null; error: unknown; status?: number }>,
  isCurrent: () => boolean,
): Promise<{ data: T[] | null; error: unknown }> {
  for (let attempt = 0; ; attempt++) {
    let result: { data: T[] | null; error: unknown; status?: number };
    try { result = await read(); }
    catch (error) { result = { data: null, error }; }
    const error = result.error as { message?: string; code?: string } | null;
    const permanent = (result.status !== undefined && [400, 401, 403, 404].includes(result.status)) || error?.code === '42501';
    const transient = !!error && !permanent && (
      (result.status !== undefined && [500, 502, 503, 504].includes(result.status)) ||
      ['57014', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'].includes(error.code || '') ||
      /failed to fetch|network|offline|timeout|timed out|lock.*(abort|acquir)|abort.*lock/i.test(error.message || '')
    );
    if (!transient || attempt >= 1 || !isCurrent()) return result;
    await new Promise(resolve => setTimeout(resolve, 800));
    if (!isCurrent()) return result;
  }
}
