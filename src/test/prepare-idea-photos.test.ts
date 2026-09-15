import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareIdeaPhotos } from "@/features/creer/prepare-idea-photos";
afterEach(()=>vi.unstubAllGlobals());
function fixture(){
 const upload=vi.fn().mockResolvedValue({error:null});const remove=vi.fn().mockResolvedValue({error:null});
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({blob:async()=>new Blob(["QA"],{type:"image/png"})}));
 const client={storage:{from:()=>({upload,remove,getPublicUrl:(path:string)=>({data:{publicUrl:`https://assets.test/${path}`}})})}};
 return {client,upload,remove};
}
describe("prepare current idea photos",()=>{
 it("keeps order, edited text and metadata, and uploads local images under the owner",async()=>{
  const {client,upload}=fixture();const raw={edited_text:"",content:"old",custom:"kept"};
  const prepared=await prepareIdeaPhotos(client,"owner","idea",[{base64:"one"},{preview:"https://assets.test/existing.png"},{base64:"two"}],raw);
  expect(upload).toHaveBeenCalledTimes(2);expect(upload.mock.calls.every(([path])=>path.startsWith('owner/idea/photos/'))).toBe(true);
  expect(prepared.contentData.photo_urls).toHaveLength(3);expect(prepared.contentData.photo_urls[1]).toBe("https://assets.test/existing.png");expect(prepared.contentData.image_url).toBe(prepared.contentData.photo_urls[0]);expect(prepared.contentData.edited_text).toBe("");expect(prepared.contentData.custom).toBe("kept");expect(raw).not.toHaveProperty('image_url');
 });
 it("removes only successfully uploaded new files if a later upload fails",async()=>{
  const {client,upload,remove}=fixture();upload.mockResolvedValueOnce({error:null}).mockResolvedValueOnce({error:Error('denied')});
  await expect(prepareIdeaPhotos(client,"owner","idea",[{base64:"one"},{base64:"two"}],{})).rejects.toThrow('photo 2');
  expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
 });
 it("reuses durable remote photos without uploading or removing them",async()=>{
  const {client,upload,remove}=fixture();const prepared=await prepareIdeaPhotos(client,"owner","idea",[{preview:"https://assets.test/existing.png"}],{});
  await prepared.rollback?.();expect(upload).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();expect(prepared.contentData.image_url).toBe("https://assets.test/existing.png");
 });
 it("rejects an unavailable local preview instead of saving an incomplete idea",async()=>{
  const {client}=fixture();await expect(prepareIdeaPhotos(client,"owner","idea",[{preview:"blob:lost"}],{})).rejects.toThrow('indisponible');
 });
 it("keeps existing content unchanged when there are no new photos",async()=>{
  const {client,upload}=fixture();const raw={image_url:"https://assets.test/saved.png"};const prepared=await prepareIdeaPhotos(client,"owner","idea",[],raw);expect(prepared.contentData).toBe(raw);expect(upload).not.toHaveBeenCalled();
 });
});
