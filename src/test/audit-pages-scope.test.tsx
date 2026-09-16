import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import SiteAccueilRecap from "@/pages/SiteAccueilRecap";
import LinkedInAudit from "@/pages/LinkedInAudit";
import SalesPageOptimizer from "@/pages/SalesPageOptimizer";
const m = vi.hoisted(() => ({ scope: "A", ready: true, owner: "client", ownerError:false, reads: [] as any[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "manager" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column:"workspace_id",value:m.scope }),useWorkspaceReady:()=>m.ready,useWorkspaceId:()=>m.scope,
 useProfileOwner:()=>({userId:m.owner,loading:!m.ready,error:m.ownerError,reload:vi.fn()}) }));
vi.mock("@/components/AppHeader",()=>({default:()=>null}));
vi.mock("@/components/SubPageHeader",()=>({default:()=>null}));
vi.mock("@/hooks/use-user-plan",()=>({useUserPlan:()=>({plan:"outil"})}));
vi.mock("@/components/RedFlagsChecker",()=>({default:()=>null}));
vi.mock("@/components/ui/input-with-voice",()=>({InputWithVoice:(props:any)=><input {...props}/>}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string)=>{
 const filters:any[]=[];const pending=new Promise(resolve=>m.reads.push({table,filters,resolve}));const q:any={};
 for(const name of ["select","eq","is","not","gt","gte","order","limit"])q[name]=(...args:any[])=>{filters.push([name,...args]);return q;};
 q.maybeSingle=()=>pending;q.then=pending.then.bind(pending);return q;
}}}));
const ui=(Page:any)=><MemoryRouter><Page/></MemoryRouter>;
beforeEach(()=>{m.scope="A";m.ready=true;m.owner="client";m.ownerError=false;m.reads=[];});
async function resolveReads(start:number,end:number,data:(table:string)=>any,error:any=null){await act(async()=>{for(const r of m.reads.slice(start,end))r.resolve({data:data(r.table),error});});}
it("recap waits for workspace, reports failed reads and retries without inventing empty content",async()=>{
 m.ready=false;const view=render(ui(SiteAccueilRecap));expect(m.reads).toHaveLength(0);m.ready=true;view.rerender(ui(SiteAccueilRecap));
 await resolveReads(0,2,()=>null,new Error("offline"));expect(screen.getByRole("alert")).toBeInTheDocument();expect(screen.queryByText(/pas encore rédigée/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Réessayer"}));await resolveReads(2,4,t=>t==='website_homepage'?{hook_title:"Texte conservé",faq:[]}:null);
 expect(screen.getByText("Texte conservé")).toBeInTheDocument();
});
it("recap ignores responses from former A and B visits",async()=>{
 const view=render(ui(SiteAccueilRecap));m.scope="B";view.rerender(ui(SiteAccueilRecap));m.scope="A";view.rerender(ui(SiteAccueilRecap));
 await resolveReads(4,6,t=>t==='website_homepage'?{hook_title:"Actuelle",faq:[]}:null);await resolveReads(0,4,t=>t==='website_homepage'?{hook_title:"Ancienne",faq:[]}:null);
 expect(screen.getByText("Actuelle")).toBeInTheDocument();expect(screen.queryByText("Ancienne")).not.toBeInTheDocument();
});
it("LinkedIn audit uses the owner account and workspace checklist independently",async()=>{
 render(ui(LinkedInAudit));await resolveReads(0,4,t=>t==='profiles'?{linkedin_url:"https://linkedin.com/in/client"}:t==='linkedin_profile'?null:[]);
 expect(screen.getByPlaceholderText("https://linkedin.com/in/...")).toHaveValue("https://linkedin.com/in/client");
 expect(m.reads.find(r=>r.table==='profiles').filters).toContainEqual(["eq","user_id","client"]);
 expect(m.reads.find(r=>r.table==='linkedin_profile').filters).toContainEqual(["eq","workspace_id","A"]);
});
it("owner failure blocks the audit before any data read",()=>{
 m.ownerError=true;render(ui(LinkedInAudit));expect(m.reads).toHaveLength(0);expect(screen.getByRole("alert")).toHaveTextContent("propriétaire");
});
it("optimizer retains offer URL priority without using the manager profile",async()=>{
 render(ui(SalesPageOptimizer));await resolveReads(0,3,t=>t==='profiles'?{website_url:"https://owner.test"}:t==='offers'?{url_sales_page:"https://offer.test"}:null);
 expect(screen.getByDisplayValue("https://offer.test")).toBeInTheDocument();expect(m.reads.find(r=>r.table==='profiles').filters).toContainEqual(["eq","user_id","client"]);
});
