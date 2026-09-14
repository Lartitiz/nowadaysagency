import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { publishReelOnce, isDurableReelUrl, REEL_UNCERTAIN } from "./reel-publication.ts";
import { reelLedgerFixture } from "./reel-publication-fixture.ts";
Deno.env.set("SUPABASE_URL", "https://fake.local");
const video = "https://fake.local/storage/v1/object/public/calendar-media/reels-montes/u1/video.mp4";
const conn = { user_id: "u1", workspace_id: "A", platform_account_id: "account" };
Deno.test("durable video excludes temporary URLs, covers, other origin and signed links", () => {
  for (const url of [null, "blob:video", "https://render.test/video.mp4", video+"?token=signed", video.replace("fake.local","other.local"), video.replace(".mp4",".jpg")]) assertEquals(isDurableReelUrl(url),false);
  assertEquals(isDurableReelUrl(video),true);
});
Deno.test("replay after lost client response returns same receipt without another Meta call", async () => {
  const db = reelLedgerFixture(); let sends = 0;
  const run = () => publishReelOnce(db, conn, "caption", video, async()=>"container", async()=>{ sends++; return "post"; });
  assertEquals(await run(), "post"); assertEquals(await run(), "post"); assertEquals(sends,1);
  await assertRejects(()=>publishReelOnce(db,conn,"edited caption",video,async()=>"c",async()=>"p"),Error,"autre légende");
});
Deno.test("concurrent requests and orphan reservations are never resent", async () => {
  const db = reelLedgerFixture(); let finish!: (v:string)=>void, started!:()=>void;
  const entered = new Promise<void>(r=>started=r); let sends=0;
  const pending = publishReelOnce(db,conn,"caption",video,()=>{ started(); return new Promise(r=>finish=r); },async()=>{ sends++; return "post"; });
  await entered;
  await assertRejects(()=>publishReelOnce(db,conn,"caption",video,async()=>"c",async()=>"p"),Error,REEL_UNCERTAIN);
  finish("container"); assertEquals(await pending,"post"); assertEquals(sends,1);
  const orphan = reelLedgerFixture();
  for (const state of ["preparing", "publishing"]) {
    orphan.rows.clear(); for (const [id,row] of db.rows) orphan.rows.set(id,{...row,state,post_id:null,created_at:"2000-01-01"});
    await assertRejects(()=>publishReelOnce(orphan,conn,"caption",video,async()=>"c",async()=>"p"),Error,REEL_UNCERTAIN);
  }
});
Deno.test("preparation error can retry, lost Meta response or receipt cannot", async () => {
  const db = reelLedgerFixture();
  await assertRejects(()=>publishReelOnce(db,conn,"c",video,async()=>{throw new Error("format");},async()=>"p"),Error,"format");
  assertEquals(db.rows.size,0);
  let sends=0;
  const run = ()=>publishReelOnce(db,conn,"c",video,async()=>"container",async()=>{sends++;throw new Error("lost");});
  await assertRejects(run,Error,REEL_UNCERTAIN); await assertRejects(run,Error,REEL_UNCERTAIN); assertEquals(sends,1);
  const failedReceipt = reelLedgerFixture(); failedReceipt.failReceipt();
  const after = ()=>publishReelOnce(failedReceipt,conn,"c",video,async()=>"container",async()=>"post");
  await assertRejects(after,Error,REEL_UNCERTAIN); await assertRejects(after,Error,REEL_UNCERTAIN);
});
Deno.test("receipt isolated by user, workspace and Instagram account", async () => {
  const db = reelLedgerFixture(); let sends=0;
  for (const target of [conn,{...conn,user_id:"u2"},{...conn,workspace_id:"B"},{...conn,platform_account_id:"account2"}]) {
    assertEquals(await publishReelOnce(db,target,"c",video,async()=>"container",async()=>`post-${++sends}`),`post-${sends}`);
  }
  assertEquals(sends,4);
});
