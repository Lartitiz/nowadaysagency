export interface StudioWorkPorts<T = Blob> {
  readSource: () => Promise<T>;
  generate: (source: T) => Promise<Blob>;
  store: (result: Blob) => Promise<void>;
  complete: () => Promise<void>;
  fail: () => Promise<void>;
}
/** A lost final DB response must never cause another provider call or erase a stored result. */
export async function executeStudioJob<T>(
  ports: StudioWorkPorts<T>,
): Promise<"ready" | "failed" | "recoverable"> {
  let storageAttempted = false;
  try {
    const result = await ports.generate(await ports.readSource());
    storageAttempted = true;
    await ports.store(result);
    await ports.complete();
    return "ready";
  } catch {
    if (storageAttempted) return "recoverable";
    await ports.fail();
    return "failed";
  }
}
