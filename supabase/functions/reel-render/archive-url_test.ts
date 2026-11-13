import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isAllowedReelRenderUrl } from "./archive-url.ts";
Deno.test("accepts the exact CDN output returned by the real renderer",()=>{
 assertEquals(isAllowedReelRenderUrl("https://json2video-cdn1.s3.amazonaws.com/clients/qa/renders/2026-09-15-result.mp4"),true);
});
Deno.test("keeps legacy HTTPS provider MP4s",()=>{
 assertEquals(isAllowedReelRenderUrl("https://cdn.json2video.com/qa.mp4"),true);
});
Deno.test("rejects unrelated storage, credentials, parameters and non-HTTPS URLs",()=>{
 for(const url of ["https://evil.s3.amazonaws.com/clients/qa/renders/a.mp4","https://json2video-cdn1.s3.amazonaws.com.evil.test/clients/qa/renders/a.mp4","http://cdn.json2video.com/a.mp4","https://u:p@cdn.json2video.com/a.mp4","https://cdn.json2video.com:444/a.mp4","https://cdn.json2video.com/a.mp4?redirect=http://localhost","https://cdn.json2video.com/a.mp4#fragment","https://json2video-cdn1.s3.amazonaws.com/private/a.mp4","https://json2video-cdn1.s3.amazonaws.com/clients/qa/renders/a.html","https://json2video-cdn1.s3.amazonaws.com/clients/qa/renders/a%2f.mp4"])
 assertEquals(isAllowedReelRenderUrl(url),false,url);
});
const HF = "https://storage.googleapis.com/hyperframes-render-nowadays-reels-1113/renders/u-0a1b2c3d-1111-2222-3333-444455556666-1794606313064-ab12cd34/output.mp4";
Deno.test("accepte le MP4 final signé du rendu HyperFrames (notre Google Cloud)",()=>{
 assertEquals(isAllowedReelRenderUrl(HF+"?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=a&X-Goog-Date=b&X-Goog-Expires=7200&X-Goog-SignedHeaders=host&X-Goog-Signature=c"),true);
});
Deno.test("refuse tout autre fichier ou paramètre côté Google Cloud",()=>{
 for(const url of [
  HF+"?redirect=http://localhost",
  HF+"#x",
  HF.replace("output.mp4","plan.tar.gz"),
  HF.replace("hyperframes-render-nowadays-reels-1113","autre-bucket"),
  HF.replace("/renders/u-","/renders/hf-render-"),
  HF.replace("storage.googleapis.com","storage.googleapis.com.evil.test"),
  "http"+HF.slice(5),
 ]) assertEquals(isAllowedReelRenderUrl(url),false,url);
});
