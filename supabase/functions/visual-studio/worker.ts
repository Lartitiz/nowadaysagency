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
  let stage = "read_source";
  try {
    const source = await ports.readSource();
    stage = "generate";
    const result = await ports.generate(source);
    stage = "store";
    storageAttempted = true;
    await ports.store(result);
    stage = "complete";
    await ports.complete();
    return "ready";
  } catch (error) {
    console.error("[studio:image-job-failed]", JSON.stringify({ stage,
      uncertain: error instanceof ProviderOutcomeUncertainError,
      missing_inputs: error instanceof Error && ["studio_integration_sources", "studio_image_sources"].includes(error.message),
    }));
    if (storageAttempted) return "recoverable";
    if (error instanceof ProviderOutcomeUncertainError) {
      await ports.uncertain();
      return "uncertain";
    }
    await ports.fail();
    return "failed";
  }
}
