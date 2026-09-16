import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), navigate: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({invalidateQueries: vi.fn()}) }));
vi.mock("@/contexts/AuthContext", () => ({useAuth:()=>({user:{id:"u"}})}));
vi.mock("@/contexts/WorkspaceContext", () => ({useWorkspace:()=>({activeWorkspace:{id:"w"},loading:false})}));
vi.mock("@/contexts/DemoContext", () => ({useDemoContext:()=>({isDemoMode:false})}));
vi.mock("@/integrations/supabase/client", () => ({supabase:{from:()=>{const q:any={select:()=>q,eq:()=>q,in:()=>Promise.resolve({data:[{id:"saved-copy"}],error:null})};return q;}}}));
vi.mock("@/lib/photo-workflows", () => ({
  readWorkflowSource: mocks.read,
  listPhotoWorkflows: vi.fn().mockResolvedValue([]),
  parsePreparation:(data:any)=>data,
}));
vi.mock("@/lib/photo-composition", async original => ({...await original<any>(), loadPhotoImage:vi.fn().mockResolvedValue({naturalWidth:1080,naturalHeight:1350}),renderPhotoComposition:vi.fn().mockResolvedValue("data:image/png;base64,fixture")}));
import PhotoPreparationDialog from "@/components/photos/PhotoPreparationDialog";
import { makePhotoRecipe } from "@/lib/photo-composition";
const workflow:any={id:"wf",user_id:"u",workspace_id:"w",name:"Préparation à reprendre",kind:"preparation",data:{sources:[{photoId:"source"}],fields:{},outputs:[{id:"output",photoId:"saved-copy",postId:"post",sourceIndex:0,label:"Post",recipe:makePhotoRecipe(),enabled:true,approved:true,caption:"Ma légende",date:"",savedPhoto:false}]}};
afterEach(()=>{cleanup();mocks.read.mockReset();mocks.navigate.mockReset();});
it("opens an empty-source resume session, recovers the saved copy and sends its ID to creation", async()=>{
  mocks.read.mockResolvedValue({id:"source",photoId:"source",name:"Originale",dataUrl:"data:image/png;base64,source"});
  render(<PhotoPreparationDialog open sources={[]} resumeWorkflow={workflow} onOpenChange={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Chargement des sources");
  await screen.findByRole("img",{name:"Aperçu : Post"});
  fireEvent.click(screen.getByRole("button",{name:"Créer un contenu avec cette version"}));
  expect(mocks.navigate).toHaveBeenCalledWith("/creer",{state:{libraryPhotoIds:["saved-copy"]}});
});
it("retries an unavailable original without losing the chosen workflow",async()=>{
  mocks.read.mockRejectedValueOnce(new Error("Source indisponible")).mockResolvedValue({id:"source",photoId:"source",name:"Originale",dataUrl:"data:image/png;base64,source"});
  render(<PhotoPreparationDialog open sources={[]} resumeWorkflow={workflow} onOpenChange={vi.fn()} />);
  await screen.findByText("Source indisponible");
  fireEvent.click(screen.getByRole("button",{name:"Réessayer le chargement"}));
  await screen.findByRole("img",{name:"Aperçu : Post"});
  await waitFor(()=>expect(mocks.read).toHaveBeenCalledTimes(2));
});
