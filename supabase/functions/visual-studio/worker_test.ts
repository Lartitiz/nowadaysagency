import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { executeStudioJob, type StudioWorkPorts } from "./worker.ts";
import { ProviderOutcomeUncertainError } from "./media.ts";
import { intentSchema, shouldRecover } from "./contract.ts";
function ports(failAt?: string) {
  const calls: string[] = [];
  const step = async (name: string) => {
    calls.push(name);
    if (name === failAt) throw new Error("connection lost");
  };
  const work: StudioWorkPorts = {
    readSource: async () => {
      await step("source");
      return new Blob(["source"]);
    },
    generate: async () => {
      await step("provider");
      return new Blob(["output"]);
    },
    store: async () => {
      await step("store");
    },
    complete: () => step("charge"),
    fail: () => step("fail"),
    uncertain: () => step("uncertain"),
  };
  return { calls, work };
}
Deno.test(
  "generation reads original, stores then commits usage; never calls provider twice",
  async () => {
    const p = ports();
    assertEquals(await executeStudioJob(p.work), "ready");
    assertEquals(p.calls, ["source", "provider", "store", "charge"]);
  },
);
for (const failure of ["source", "provider"])
  Deno.test(`no usage for ${failure} failure`, async () => {
    const p = ports(failure);
    assertEquals(await executeStudioJob(p.work), "failed");
    assertEquals(p.calls.includes("charge"), false);
    assertEquals(p.calls.at(-1), "fail");
  });
for (const failure of ["store", "charge"])
  Deno.test(
    `uncertain ${failure} acknowledgement remains recoverable without regenerating`,
    async () => {
      const p = ports(failure);
      assertEquals(await executeStudioJob(p.work), "recoverable");
      assertEquals(p.calls.filter((c) => c === "provider").length, 1);
      assertEquals(p.calls.includes("fail"), false);
    },
  );
Deno.test("lost provider response is uncertain and never offered as a free retry", async () => {
  const p = ports();
  p.work.generate = async () => {
    p.calls.push("provider");
    throw new ProviderOutcomeUncertainError();
  };
  assertEquals(await executeStudioJob(p.work), "uncertain");
  assertEquals(p.calls, ["source", "provider", "uncertain"]);
});
Deno.test(
  "unsupported routing and incomplete generated instructions are rejected",
  () => {
    assertEquals(
      intentSchema.safeParse({
        operation: "video",
        summary: "x",
        background_prompt: "",
      }).success,
      false,
    );
    assertEquals(
      intentSchema.safeParse({
        operation: "background",
        summary: "x",
        background_prompt: "",
      }).success,
      false,
    );
    assertEquals(
      intentSchema.safeParse({
        operation: "clarify",
        summary: "Quel décor ?",
        background_prompt: "",
      }).success,
      true,
    );
  },
);
Deno.test("recover only stale jobs, not active generation", () => {
  const now = Date.now();
  assertEquals(shouldRecover(new Date(now - 1000).toISOString(), now), false);
  assertEquals(shouldRecover(new Date(now - 601000).toISOString(), now), false);
  assertEquals(shouldRecover(new Date(now - 1201000).toISOString(), now), true);
});
