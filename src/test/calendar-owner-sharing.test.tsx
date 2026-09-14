import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PostCommentsSection } from "@/components/calendar/PostCommentsSection";
import { CalendarShareDialog } from "@/components/calendar/CalendarShareDialog";
const state=vi.hoisted(()=>({workspace:"A",user:{id:"owner"},writes:[] as any[],queries:[] as any[]}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({user:state.user})}));
vi.mock("@/hooks/use-workspace-query",()=>({useWorkspaceFilter:()=>({column:"workspace_id",value:state.workspace}),useWorkspaceId:()=>state.workspace,useProfileUserId:()=>"owner"}));
vi.mock("sonner",()=>({toast:{error:vi.fn(),success:vi.fn()}}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string)=>{
 let filters: Array<(row:any)=>boolean>=[],single=false,insert:any;
 const q:any={select:()=>q,order:()=>q,limit:()=>q,in:(k:string,values:any[])=>{filters.push(r=>values.includes(r[k]));return q},eq:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q},is:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q},or:(expr:string)=>{state.queries.push(expr);filters.push(r=>r.workspace_id===state.workspace || r.legacy_owner_scope);return q},single:()=>{single=true;return q},maybeSingle:()=>{single=true;return q},insert:(p:any)=>{insert=p;return q},then:(resolve:any)=>{
 const shares=[{id:"s1",user_id:"owner",workspace_id:"A",canal_filter:"instagram",label:"Instagram only",is_active:true,created_at:"2026-09-14",share_token:"s1"},{id:"s2",user_id:"owner",workspace_id:"A",canal_filter:"all",label:"All channels",is_active:true,created_at:"2026-09-14",share_token:"s2"},{id:"s3",user_id:"owner",workspace_id:"B",canal_filter:"all",label:"Other workspace",is_active:true,created_at:"2026-09-14",share_token:"s3"}];
 const posts=[{id:"p",user_id:"owner",workspace_id:"A",canal:"instagram",status:"ready"},{id:"l",user_id:"owner",workspace_id:"A",canal:"linkedin",status:"ready"},{id:"b",user_id:"owner",workspace_id:"B",canal:"instagram",status:"ready"}];
 let rows=(table==="calendar_shares"?shares:table==="calendar_posts"?posts:[]).filter(r=>filters.every(f=>f(r)));
 if(insert){state.writes.push(insert);rows=[{...insert,created_at:"2026-09-14"}];}
 return Promise.resolve({data:single?rows[0]:rows,error:null}).then(resolve);
 }};return q;
}}}));
beforeEach(()=>{state.workspace="A";state.writes=[];state.queries=[]});
it("requires an explicit reply link when two applicable links exist",async()=>{
 render(<PostCommentsSection postId="p" ownerName="Owner"/>);
 const select=await screen.findByLabelText("Lien destinataire");
 expect(select).toHaveValue("");
 expect(screen.queryByText("Other workspace")).not.toBeInTheDocument();
 fireEvent.change(screen.getByPlaceholderText("Répondre..."),{target:{value:"For all channels"}});
 expect(screen.getByRole("button",{name:"Répondre"})).toBeDisabled();
 fireEvent.change(select,{target:{value:"s2"}});
 fireEvent.click(screen.getByRole("button",{name:"Répondre"}));
 await waitFor(()=>expect(state.writes).toHaveLength(1));
 expect(state.writes[0].share_id).toBe("s2");
});
it("lists current workspace and counts each link channel, then reloads on workspace change",async()=>{
 const {rerender}=render(<CalendarShareDialog open onOpenChange={()=>{}}/>);
 const instagram=await screen.findByText("Instagram only");
 expect(screen.queryByText("Other workspace")).not.toBeInTheDocument();
 expect(within(instagram.closest("div.rounded-xl")!).getByText(/⏳ 1/)).toBeInTheDocument();
 expect(within(screen.getByText("All channels").closest("div.rounded-xl")!).getByText(/⏳ 2/)).toBeInTheDocument();
 state.workspace="B";rerender(<CalendarShareDialog open onOpenChange={()=>{}}/>);
 expect(await screen.findByText("Other workspace")).toBeInTheDocument();
 expect(screen.queryByText("Instagram only")).not.toBeInTheDocument();
});
