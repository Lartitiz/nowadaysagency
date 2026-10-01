import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), stream: vi.fn(), reset: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));
vi.mock("@/lib/invoke-with-heartbeat", () => ({ invokeWithHeartbeat: mocks.invoke }));
vi.mock("@/hooks/use-streaming-invoke", () => ({ useStreamingInvoke: () => ({ invoke:mocks.stream,reset:mocks.reset }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user:{id:"owner"} }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace" }));
vi.mock("@/lib/posthog", () => ({ posthog:{capture:vi.fn()} }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: () => false }));
vi.mock("@/lib/image-vision", () => ({ downscalePhotosForVision: async (photos: any[]) => photos.map(p => ({ ...p, base64: "scaled-pixels" })) }));
import { useContentGenerator } from "@/hooks/use-content-generator";
beforeEach(() => vi.clearAllMocks());
it("ignores a generation completed after resetting the editor", async () => {
  let finish!: (value:any)=>void;
  mocks.invoke.mockReturnValue(new Promise(resolve => { finish=resolve; }));
  const {result}=renderHook(useContentGenerator);
  let pending!: Promise<any>;
  act(() => { pending=result.current.generate({format:"post",subject:"Ancien contenu"}); });
  act(() => result.current.reset());
  await act(async () => { finish({data:{content:JSON.stringify({content:"Late"})},error:null}); expect(await pending).toBeNull(); });
  expect(result.current.result).toBeNull(); expect(result.current.error).toBeNull(); expect(result.current.generating).toBe(false);
});
it("does not let an older request replace the new result", async () => {
  let finish!: (value:any)=>void;
  mocks.invoke.mockReturnValueOnce(new Promise(resolve => { finish=resolve; })).mockResolvedValueOnce({data:{content:JSON.stringify({content:"New"})},error:null});
  const {result}=renderHook(useContentGenerator); let old!:Promise<any>;
  act(() => { old=result.current.generate({format:"post",subject:"Old"}); });
  await act(async () => { await result.current.generate({format:"post",subject:"New"}); });
  await act(async () => { finish({data:{content:JSON.stringify({content:"Old"})},error:null}); await old; });
  expect(result.current.result?.raw.content).toBe("New");
});
it("ignores a late streamed result after reset", async () => {
  let finish!: (value:string)=>void;
  mocks.stream.mockReturnValue(new Promise(resolve => { finish=resolve; }));
  const {result}=renderHook(useContentGenerator); let pending!:Promise<any>;
  act(() => { pending=result.current.generateStream({format:"post",subject:"Old"}); });
  act(() => result.current.reset());
  await act(async () => { finish('{"content":"Late"}'); expect(await pending).toBeNull(); });
  expect(result.current.result).toBeNull(); expect(result.current.error).toBeNull();
});

for (const mode of ["automatic", "user_validated", "pure_photo", "text_first"] as const) it(`transmits pixels for final matching only when needed: ${mode}`, async () => {
  mocks.invoke.mockResolvedValue({data:{content:JSON.stringify({slides:[],carousel_type:"photo"})},error:null});
  const { result } = renderHook(useContentGenerator);
  await act(async () => { await result.current.generate({format:"carousel",subject:"Récit",carouselType:"photo",scenarioOrigin:mode === "user_validated" ? "user_validated" : "automatic",carouselSubMode:mode === "pure_photo" ? "pure_photo" : "photo",textFirst:mode === "text_first",confirmedStructure:[{slide_number:1,role:"hook",title_suggestion:"Plan",strategic_note:"Image",photo_index:1,slide_type:"photo_full"}],photos:[{base64:"pixels",context:"Produit réel"}]}); });
  const payload = mocks.invoke.mock.calls.find(([name]) => name === "carousel-ai")?.[1]?.body;
  expect(payload).toBeTruthy();
  expect(payload.photos?.[0]?.base64).toBe(mode === "automatic" ? "scaled-pixels" : undefined);
});
