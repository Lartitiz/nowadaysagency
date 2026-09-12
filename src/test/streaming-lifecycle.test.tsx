import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(() => ({ session:vi.fn(),refresh:vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase:{auth:{getSession:mocks.session,refreshSession:mocks.refresh}} }));
import { useStreamingInvoke } from "@/hooks/use-streaming-invoke";
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({data:{session:{access_token:"fixture"}}}); });
afterEach(() => vi.unstubAllGlobals());
it("reset during session lookup prevents a late request from starting", async () => {
  let finish!:(value:any)=>void; mocks.session.mockReturnValue(new Promise(resolve => { finish=resolve; }));
  const fetchMock=vi.fn(); vi.stubGlobal("fetch",fetchMock);
  const {result}=renderHook(useStreamingInvoke); let pending!:Promise<string>;
  act(() => { pending=result.current.invoke("fixture",{}); });
  act(() => result.current.reset());
  await act(async () => { finish({data:{session:{access_token:"fixture"}}}); expect(await pending).toBe(""); });
  expect(fetchMock).not.toHaveBeenCalled(); expect(result.current.error).toBeNull();
});
it("403 is an access error, never an automatic second request", async () => {
  const fetchMock=vi.fn().mockResolvedValue(new Response('{}',{status:403})); vi.stubGlobal("fetch",fetchMock);
  const {result}=renderHook(useStreamingInvoke);
  await act(async () => { await expect(result.current.invoke("fixture",{})).rejects.toThrow("accès"); });
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(mocks.refresh).not.toHaveBeenCalled();
});
it("rejects a JSON HTTP failure even without an error property", async () => {
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response('{"message":"Échec serveur"}',{status:500,headers:{"Content-Type":"application/json"}})));
  const {result}=renderHook(useStreamingInvoke);
  await act(async () => { await expect(result.current.invoke("fixture",{})).rejects.toThrow("Échec serveur"); });
  expect(result.current.done).toBe(false); expect(result.current.content).toBe("");
});
