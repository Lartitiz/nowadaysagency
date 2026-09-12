import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveFlowState, loadFlowState, setFlowUserId, loadPhotosLocal, clearFlowState, setFlowWorkspaceId } from "@/hooks/use-flow-persistence";
vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); setFlowUserId("owner"); setFlowWorkspaceId(null); });
describe("durable creation context", () => {
  it("isolates drafts and resets across workspaces", () => {
    setFlowWorkspaceId("brand-a"); saveFlowState({step:"result",ideaText:"A"});
    setFlowWorkspaceId("brand-b"); expect(loadFlowState()).toBeNull();
    saveFlowState({step:"result",ideaText:"B"}); clearFlowState();
    setFlowWorkspaceId("brand-a"); expect(loadFlowState()?.ideaText).toBe("A");
  });
  it("keeps source context, calendar identity and video beyond the old expiry", () => {
    saveFlowState({step:"result", newsjackingContext:"Source factuelle", calendarPostId:"calendar", calendarPostDate:"2026-09-12", reelMp4Url:"https://example.test/video.mp4", result:{raw:{content:"Brouillon"}}});
    saveFlowState({creationId:"same-attempt"});
    const key = "creer_flow_state_backup:owner";
    const backup = JSON.parse(localStorage.getItem(key)!);
    backup.ts = Date.now() - 86400000;
    localStorage.setItem(key,JSON.stringify(backup)); sessionStorage.clear();
    expect(loadFlowState()).toMatchObject({newsjackingContext:"Source factuelle",creationId:"same-attempt",calendarPostId:"calendar",reelMp4Url:"https://example.test/video.mp4"});
  });
  it("rejects a session belonging to a different user", () => {
    saveFlowState({step:"result",result:{raw:{content:"Privé"}}});
    setFlowUserId("another");
    expect(loadFlowState()).toBeNull();
  });
  it("keeps a missing photo slot instead of silently shortening a carousel", async () => {
    sessionStorage.setItem("creer_flow_photos",JSON.stringify({ts:Date.now()-86400000,photos:[{id:"missing",local:true}]}));
    expect(await loadPhotosLocal()).toMatchObject([{id:"missing",missingLocalPhoto:true,base64:""}]);
  });
  it("a new content reset clears all source and publication identity", () => {
    saveFlowState({step:"result",creationId:"old",newsjackingContext:"Old source",publishedCalendarId:"published"});
    clearFlowState();
    expect(loadFlowState()).toBeNull();
  });
});
