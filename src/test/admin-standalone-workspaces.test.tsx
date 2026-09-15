import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AdminCoachingPage from "@/pages/AdminCoachingPage";
const state=vi.hoisted(()=>({ added:false }));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({user:{id:"admin"},isAdmin:true})}));
vi.mock("@/contexts/WorkspaceContext",()=>({useWorkspace:()=>({workspaces:[]})}));
vi.mock("@/components/AppHeader",()=>({default:()=>null}));
vi.mock("@/components/admin/CoachingSessionManager",()=>({default:()=>null}));
vi.mock("@/components/admin/KickoffPreparation",()=>({default:()=>null}));
vi.mock("@/components/admin/AdminUsersTab",()=>({default:()=>null}));
vi.mock("@/components/admin/AdminStatsTab",()=>({default:()=>null}));
vi.mock("@/components/admin/AdminFeedbackTab",()=>({default:()=>null}));
vi.mock("@/components/admin/AdminEmailTab",()=>({default:()=>null}));
vi.mock("@/components/admin/CoachingProgramList",()=>({default:({loading,standaloneWorkspaces,onReload}:any)=><div>{loading?"Chargement":standaloneWorkspaces.map((w:any)=><span key={w.id}>{w.name}</span>)}<button onClick={()=>{state.added=true;onReload();}}>Simuler création réussie</button></div>}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string)=>{
 let selection="";const q:any={select:(s:string)=>{selection=s;return q;},order:()=>q,eq:()=>q,in:()=>q,then:(resolve:any)=>{
 const list=[{id:"personal",name:"Espace historique"},{id:"manager",name:"Espace géré"},{id:"coaching",name:"Espace coaching"},...(state.added?[{id:"new",name:"Nouvel espace QA"}]:[])];
 const data=table==="coaching_programs"?[{id:"program",client_user_id:"client-coaching"}]:table==="workspace_members"?selection.includes("workspaces:")?list.map(w=>({workspace_id:w.id,role:w.id==="personal"||w.id==="new"?"owner":"manager",workspaces:w})):list.map(w=>({workspace_id:w.id,user_id:w.id==="coaching"?"client-coaching":w.id==="manager"?"other":"admin"})):[];
 return Promise.resolve({data,error:null}).then(resolve);
 }};return q;
}}}));
beforeEach(()=>{state.added=false;});
it("conserve plusieurs espaces owner et manager après création, sans dupliquer les clientes coaching",async()=>{
 render(<MemoryRouter><AdminCoachingPage/></MemoryRouter>);
 await screen.findByText("Espace géré"); expect(screen.queryByText("Espace coaching")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Simuler création réussie"}));
 await waitFor(()=>expect(screen.getByText("Nouvel espace QA")).toBeInTheDocument());
 expect(screen.getByText("Espace historique")).toBeInTheDocument();expect(screen.getByText("Espace géré")).toBeInTheDocument();expect(screen.queryByText("Espace coaching")).not.toBeInTheDocument();
});
