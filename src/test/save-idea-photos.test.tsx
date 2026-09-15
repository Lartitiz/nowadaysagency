import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { resumeIdea } from "@/lib/resume-idea";
const mocks = vi.hoisted(() => ({ write:vi.fn(), single:vi.fn(), toast:{success:vi.fn(),error:vi.fn(),warning:vi.fn(),loading:vi.fn()} }));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>({insert:(fields:any)=>{mocks.write(fields);return {select:()=>({single:mocks.single})};}})}}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({user:{id:"owner"}})}));
vi.mock("@/hooks/use-workspace-query",()=>({useWorkspaceId:()=>"workspace"}));
vi.mock("sonner",()=>({toast:mocks.toast}));
vi.mock("@/components/ui/textarea-with-voice",()=>({TextareaWithVoice:(props:any)=><textarea {...props}/>}));
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
const raw={content_type:"caption_photo",content:"Ancien texte",edited_text:"Texte courant"};
const props={open:true,onOpenChange:vi.fn(),contentType:"post_instagram" as const,subject:"Photo QA",contentData:raw,sourceModule:"creer",format:"post"};
beforeEach(()=>{vi.clearAllMocks();mocks.single.mockResolvedValue({data:{id:"idea"},error:null});});
function save(extra:any={}) {render(<SaveToIdeasDialog {...props} {...extra}/>);fireEvent.click(document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Enregistrer dans Mes idées')!);}
describe("idea save commits the current photo with its edited text",()=>{
 it("waits for the photo before saving and returns durable media through resume",async()=>{
  let finish!:(value:any)=>void;const prepared=new Promise(resolve=>{finish=resolve;});const onSaved=vi.fn();
  save({onPrepareContent:()=>prepared,onSaved});expect(mocks.write).not.toHaveBeenCalled();
  finish({contentData:{...raw,image_url:"https://assets.test/current.png",photo_urls:["https://assets.test/current.png"]}});
  await waitFor(()=>expect(onSaved).toHaveBeenCalled());const row=mocks.write.mock.calls[0][0];const resumed=resumeIdea(row as any);
  expect(resumed?.raw.edited_text).toBe("Texte courant");expect(resumed?.raw.image_url).toBe("https://assets.test/current.png");expect(JSON.parse(row.content_draft).image_url).toBe(resumed?.raw.image_url);
 });
 it("keeps the dialog open and does not save a text-only success after an upload failure",async()=>{
  save({onPrepareContent:async()=>{throw Error("upload refused")}});
  await waitFor(()=>expect(mocks.toast.error).toHaveBeenCalled());expect(mocks.write).not.toHaveBeenCalled();expect(props.onOpenChange).not.toHaveBeenCalled();
 });
 it("cleans only new uploads if the database refuses the save",async()=>{
  const rollback=vi.fn(async()=>{});mocks.single.mockResolvedValue({data:null,error:{code:"42501",message:"denied"}});
  save({onPrepareContent:async()=>({contentData:{...raw,image_url:"https://assets.test/new.png"},rollback})});
  await waitFor(()=>expect(mocks.toast.error).toHaveBeenCalled());expect(rollback).toHaveBeenCalledTimes(1);
 });
 it("retains media if a transport error leaves the database commit uncertain",async()=>{
  const rollback=vi.fn(async()=>{});mocks.single.mockRejectedValue(Error("network lost"));
  save({onPrepareContent:async()=>({contentData:{...raw,image_url:"https://assets.test/new.png"},rollback})});
  await waitFor(()=>expect(mocks.toast.error).toHaveBeenCalled());expect(rollback).not.toHaveBeenCalled();
 });
 it("does not write a late prepared photo after the creation context changes",async()=>{
  let active=true;const rollback=vi.fn(async()=>{});save({isSaveCurrent:()=>active,onPrepareContent:async()=>{active=false;return {contentData:raw,rollback}}});
  await waitFor(()=>expect(rollback).toHaveBeenCalled());expect(mocks.write).not.toHaveBeenCalled();
 });
});
