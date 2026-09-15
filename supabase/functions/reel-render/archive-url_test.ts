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
