import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleVerifyCheckoutRequest } from "./index.ts";

Deno.test("verify-checkout: une visite anonyme ne peut vérifier aucune session", async () => {
  const response = await handleVerifyCheckoutRequest(new Request("https://edge.local/verify-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "cs_test_12345678" }),
  }));
  assertEquals(response.status, 401);
  assertEquals((await response.json()).state, undefined);
});

Deno.test("verify-checkout: un identifiant manquant ou forgé ne confirme rien", async () => {
  for (const sessionId of [undefined, "cs_test", "https://evil.test/", "cs_test_12345678?other=1"]) {
    const response = await handleVerifyCheckoutRequest(new Request("https://edge.local/verify-checkout", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer token" },
      body: JSON.stringify({ session_id: sessionId }),
    }));
    assertEquals(response.status, 400);
    assertEquals((await response.json()).state, undefined);
  }
});

const packPrice = "price_1T7ubCIwPeG7GjpyJ8I0qPAM";
function fixture(overrides: any = {}) {
  const session = { id: "cs_test_12345678", status: "complete", payment_status: "paid", mode: "payment", metadata: {user_id:"owner"}, ...overrides.session };
  return {
    db: { auth: {getUser: async () => ({data:{user:{id:"owner"}},error:null})}, from: () => {
      const q: any = { select:()=>q, eq:()=>q, maybeSingle:async()=>({data: overrides.row ?? null,error:overrides.error ?? null}) }; return q;
    } },
    stripe: {checkout:{sessions:{retrieve:async()=>session, listLineItems:async()=>({data:[{price:{id:overrides.price || packPrice},quantity:1}]})}}}
  };
}
async function verify(overrides: any = {}) {
 const response = await handleVerifyCheckoutRequest(new Request("https://edge.local/verify-checkout", {method:"POST",headers:{authorization:"Bearer token","content-type":"application/json"},body:JSON.stringify({session_id:"cs_test_12345678"})}),fixture(overrides));
 return {status:response.status,...await response.json()};
}
Deno.test("pack: paid receipt alone remains pending until credits are delivered",async()=>{
 assertEquals((await verify({row:{id:"purchase",fulfillment_state:"pending"}})).state,"pending");
 assertEquals((await verify({row:{credits:10,price_id:packPrice}})).state,"confirmed");
 assertEquals((await verify({row:{credits:30,price_id:packPrice}})).state,"pending");
});
Deno.test("payment awaiting settlement, another account and a database failure never confirm",async()=>{
 assertEquals((await verify({session:{payment_status:"unpaid"}})).state,"payment_pending");
 assertEquals((await verify({session:{metadata:{user_id:"other"}}})).status,403);
 assertEquals((await verify({error:{message:"offline"}})).status,503);
});
Deno.test("subscription confirmation requires the exact paid price, active right and period",async()=>{
 const price="price_1T7uZHIwPeG7GjpycpUQuMqf";
 const input={price,session:{mode:"subscription",subscription:"sub_test"},row:{plan:"outil",status:"active",source:"stripe",stripe_price_id:price,current_period_end:"2099-01-01"}};
 assertEquals((await verify(input)).state,"confirmed");
 for(const patch of [{status:"canceled"},{plan:"free"},{stripe_price_id:"other"},{current_period_end:"2020-01-01"}]) assertEquals((await verify({...input,row:{...input.row,...patch}})).state,"pending");
});
