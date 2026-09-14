import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SharedCalendarPage from "@/pages/SharedCalendarPage";
vi.mock("react-router-dom",()=>({useParams:()=>({"*":"fiction"})}));
vi.mock("@/components/social-mockup/SocialMockup",()=>({SocialMockup:()=>null}));
vi.mock("@/hooks/use-mobile",()=>({useIsMobile:()=>false}));
vi.mock("sonner",()=>({toast:{error:vi.fn(),success:vi.fn()}}));
const fixture = {share:{id:"s",label:"QA",guest_name:"Test",show_content_draft:true,guest_can_edit_status:false,guest_can_edit_wording:true,show_columns:["theme","wording"],view_mode:"table"},profile:{prenom:"QA"},posts:[{id:"p",date:"2026-09-14",theme:"Test content",canal:"instagram",format:"post_photo",status:"ready",content_draft:"Original",updated_at:"2026-09-14T01:00:00Z"}],comments:[]};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
beforeEach(()=>{localStorage.clear();sessionStorage.clear()});
afterEach(()=>vi.unstubAllGlobals());
describe("Shared calendar persistence",()=>{
 it("keeps a failed comment and retries with same request ID without optimistic success",async()=>{
   const requests: any[]=[];
   const fetchMock=vi.fn(async(url:string,options?:RequestInit)=>{
     if(url.includes("public-calendar-comment")){requests.push(JSON.parse(String(options?.body)));return requests.length===1?json({error:"insert_failed"},500):json({id:"c",calendar_post_id:"p",share_id:"s",author_name:"Test",content:"Keep my comment",is_resolved:false,created_at:"2026-09-14T02:00:00Z"},201)}
     return json(fixture);
   });
   vi.stubGlobal("fetch",fetchMock);
   render(<SharedCalendarPage/>);
   fireEvent.click(await screen.findByTitle("Commenter"));
   const input=await screen.findByLabelText("Ton commentaire");
   fireEvent.change(input,{target:{value:"Keep my comment"}});
   fireEvent.keyDown(input,{key:"Enter",shiftKey:false});
   await waitFor(()=>expect(requests).toHaveLength(1));
   await waitFor(()=>expect(input).toHaveValue("Keep my comment"));
   expect(document.querySelectorAll("p")).not.toContainEqual(expect.objectContaining({textContent:"Keep my comment"}));
   await act(async()=>{});
   fireEvent.keyDown(input,{key:"Enter",shiftKey:false});
   await waitFor(()=>expect(input).toHaveValue(""));
   expect(requests[1].request_id).toBe(requests[0].request_id);
   expect(screen.getAllByText("Keep my comment")).toHaveLength(1);
 });
 it("keeps wording edits after a failed save and closes only after receipt",async()=>{
   let writes=0;
   vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.includes("public-calendar-edit") ? (++writes===1?json({error:"write_failed"},500):json({success:true,updated_at:"2026-09-14T03:00:00Z"})) : json(fixture)));
   render(<SharedCalendarPage/>);
   fireEvent.click(await screen.findByText("Original"));
   const editor=screen.getByLabelText("Modifier le wording");
   fireEvent.change(editor,{target:{value:"Keep my wording"}});
   fireEvent.blur(editor);
   await waitFor(()=>expect(writes).toBe(1));
   await act(async()=>{});
   expect(editor).toHaveValue("Keep my wording");
   fireEvent.blur(editor);
   await waitFor(()=>expect(screen.queryByLabelText("Modifier le wording")).not.toBeInTheDocument());
   expect(screen.getByText("Keep my wording")).toBeInTheDocument();
 });
 it("keeps the revision request until the server confirms it",async()=>{
   vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.includes("public-calendar-comment")?json({error:"write_failed"},500):json(fixture)));
   render(<SharedCalendarPage/>);
   fireEvent.click(await screen.findByTitle("Commenter"));
   fireEvent.click(screen.getByText("À revoir"));
   const editor=screen.getByLabelText("Qu'est-ce qu'il faut changer ?");
   fireEvent.change(editor,{target:{value:"Keep this revision"}});
   fireEvent.click(screen.getByText("Envoyer la demande de révision"));
   await act(async()=>{});
   expect(editor).toHaveValue("Keep this revision");
   expect(screen.getByText("Envoyer la demande de révision")).toBeInTheDocument();
 });
 it("recovers a failed read instead of leaving a permanent expired screen",async()=>{
   vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(json({error:"internal"},500)).mockResolvedValueOnce(json(fixture)));
   render(<SharedCalendarPage/>);
   fireEvent.click(await screen.findByText("Réessayer"));
   expect(await screen.findByText("Test content")).toBeInTheDocument();
 });
});
