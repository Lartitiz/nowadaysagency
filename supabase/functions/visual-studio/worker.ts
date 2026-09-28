import { ProviderOutcomeUncertainError } from "./media.ts";
export interface StudioWorkPorts<T = Blob> {
  readSource: () => Promise<T>;
  generate: (source: T) => Promise<Blob>;
  store: (result: Blob) => Promise<void>;
  complete: () => Promise<void>;
  fail: () => Promise<void>;
  uncertain: () => Promise<void>;
}
/** A lost final DB response must never cause another provider call or erase a stored result. */
export async function executeStudioJob<T>(
  ports: StudioWorkPorts<T>,
): Promise<"ready" | "failed" | "recoverable" | "uncertain"> {
  let storageAttempted = false;
  try {
    const result = await ports.generate(await ports.readSource());
    storageAttempted = true;
    await ports.store(result);
    await ports.complete();
    return "ready";
  } catch (error) {
    if (storageAttempted) return "recoverable";
    if (error instanceof ProviderOutcomeUncertainError) {
      await ports.uncertain();
      return "uncertain";
    }
    await ports.fail();
    return "failed";
  }
}
