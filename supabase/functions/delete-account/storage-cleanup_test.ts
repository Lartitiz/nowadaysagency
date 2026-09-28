import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleanupUserStorage } from "./storage-cleanup.ts";

function fakeStorage(fail?: "list" | "remove") {
  const removed: string[] = [];
  const prefixes: string[] = [];
  const data = {
    "u1": [{ name: "reel-videos", id: null, metadata: null }, ...Array.from({ length: 120 }, (_, i) => ({ name: `p${i}.jpg`, id: `id${i}`, metadata: {} }))],
    "u1/reel-videos": [{ name: "reel.mp4", id: "vid", metadata: {} }],
  } as Record<string, any[]>;
  const admin = { storage: {
    listBuckets: async () => ({ data: [{ id: "user-photos" }, { id: "calendar-media" }], error: null }),
    from: (bucket: string) => ({
      list: async (prefix: string, options: any) => {
        prefixes.push(prefix);
        return { data: (data[prefix] ?? []).slice(options.offset, options.offset + options.limit), error: fail === "list" ? { message: "network failure" } : null };
      },
      remove: async (paths: string[]) => {
        removed.push(...paths.map(p => `${bucket}/${p}`));
        return { error: fail === "remove" ? { message: "denied" } : null };
      },
    }),
  } };
  return { admin, removed, prefixes };
}

Deno.test("effacement : photos, sous-dossiers et plus de 100 objets, uniquement chez la propriétaire", async () => {
  const f = fakeStorage();
  assertEquals(await cleanupUserStorage(f.admin, "u1"), 242);
  assertEquals(f.removed.includes("calendar-media/u1/reel-videos/reel.mp4"), true);
  assertEquals(f.removed.includes("user-photos/u1/p119.jpg"), true);
  assertEquals(f.prefixes.every(p => p === "u1" || p.startsWith("u1/")), true);
});
for (const phase of ["list", "remove"] as const) {
  Deno.test(`effacement : erreur ${phase} remontée, jamais un faux succès`, async () => {
    await assertRejects(() => cleanupUserStorage(fakeStorage(phase).admin, "u1"));
  });
}

Deno.test('Studio cleanup includes workspace paths, collaborator versions and stops on inventory errors',async()=>{
 const removed:string[]=[];let inventoryFails=false;
 const admin={storage:{listBuckets:async()=>({data:[{id:'visual-studio'}],error:null}),from:()=>({remove:async(paths:string[])=>{removed.push(...paths);return {error:null};}})},from:(table:string)=>{
  const q={select:()=>q,eq:()=>table==='workspaces'?Promise.resolve({data:[{id:'space'}],error:null}):q,or:(filter:string)=>{assertEquals(filter,'user_id.eq.user-1,workspace_id.in.(space)');return q;},order:()=>q,range:async()=>inventoryFails?{error:{message:'offline'}}:{data:table==='visual_studio_sessions'?[{source_path:'space/session/original',visual_studio_versions:[{result_path:'space/session/result.jpg'}]}]:[{result_path:'another/session/my-version.jpg'}],error:null}};return q;
 }};
 assertEquals(await cleanupUserStorage(admin,'user-1'),3);
 assertEquals(removed,['space/session/original','space/session/result.jpg','another/session/my-version.jpg']);
 inventoryFails=true;await assertRejects(()=>cleanupUserStorage(admin,'user-1'));assertEquals(removed.length,3);
});
