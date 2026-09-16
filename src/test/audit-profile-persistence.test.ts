import { beforeEach, expect, it, vi } from "vitest";
import { auditScopedQuery, readAuditProfile, saveAuditProfile, persistWebsiteAudit } from "@/lib/audit-profile-persistence";
const m = vi.hoisted(() => ({ calls: [] as any[], response: { data: null, error: null } as any }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
 m.calls.push(["from",table]); const q: any = {};
 for (const name of ["select","eq","is","update","insert","lt"]) q[name]=(...args: any[])=>{m.calls.push([name,...args]);return q;};
 q.then=(resolve:any)=>Promise.resolve(m.response).then(resolve);q.maybeSingle=q.single=()=>Promise.resolve(m.response);return q;
} } }));
beforeEach(()=>{m.calls=[];m.response={data:null,error:null};});
it("reads profiles by the resolved owner and reports read failures",async()=>{
 m.response={data:{website_url:"https://client.test"},error:null};expect(await readAuditProfile("client","website_url")).toEqual(m.response.data);
 expect(m.calls).toContainEqual(["eq","user_id","client"]);m.response={error:new Error("denied")};await expect(readAuditProfile("client","website_url")).rejects.toThrow("denied");
});
it("refuses to write without a resolved owner or confirmed row",async()=>{
 await expect(saveAuditProfile("",{instagram_bio:"bio"})).rejects.toThrow();expect(m.calls).toHaveLength(0);
 await expect(saveAuditProfile("client",{instagram_bio:"bio"})).rejects.toThrow("non confirmée");
 m.response={data:{user_id:"someone-else"},error:null};await expect(saveAuditProfile("client",{instagram_bio:"bio"})).rejects.toThrow();
});
it("updates only the requested fields on the same owner and requires a receipt",async()=>{
 m.response={data:{user_id:"client"},error:null};await saveAuditProfile("client",{instagram_bio:"nouvelle bio"});
 expect(m.calls).toContainEqual(["update",{instagram_bio:"nouvelle bio"}]);expect(m.calls).toContainEqual(["eq","user_id","client"]);expect(m.calls).toContainEqual(["select","user_id"]);
});
it("isolates personal audit reads from workspace rows",()=>{
 auditScopedQuery("website_homepage","*","user_id","owner");expect(m.calls).toContainEqual(["is","workspace_id",null]);
 m.calls=[];auditScopedQuery("website_homepage","*","workspace_id","A");expect(m.calls).toContainEqual(["eq","workspace_id","A"]);expect(m.calls.some(c=>c[0]==="is")).toBe(false);
});

it("keeps the previous audit latest when the insert is rejected",async()=>{
 m.response={error:new Error("insert refused")};
 await expect(persistWebsiteAudit({raw_result:{score:30}},"workspace_id","A",()=>true)).rejects.toThrow("insert refused");
 expect(m.calls.some(c=>c[0]==="update")).toBe(false);
});
it("demotes only older audits in the saved scope after receiving the new row",async()=>{
 m.response={data:{id:"new",created_at:"2026-09-16T12:00:00Z"},error:null};
 const result=await persistWebsiteAudit({raw_result:{score:30}},"user_id","owner",()=>true);
 expect(result.receipt.id).toBe("new");expect(m.calls).toContainEqual(["lt","created_at","2026-09-16T12:00:00Z"]);expect(m.calls).toContainEqual(["is","workspace_id",null]);
 expect(m.calls.findIndex(c=>c[0]==="insert")).toBeLessThan(m.calls.findIndex(c=>c[0]==="update"));
});
it("does not initiate another write after leaving the audit or without a receipt date",async()=>{
 m.response={data:{id:"new"},error:null};expect((await persistWebsiteAudit({},"workspace_id","A",()=>true)).markerError).toBeTruthy();
 await persistWebsiteAudit({},"workspace_id","A",()=>false);expect(m.calls.some(c=>c[0]==="update")).toBe(false);
});
