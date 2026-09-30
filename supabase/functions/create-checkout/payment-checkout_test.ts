import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { paymentCheckout } from "./payment-checkout.ts";
const params={mode:"payment",line_items:[{price:"pack",quantity:1}]};
function fixture(status?:string, fulfilled=false) {
 let attempt:any={attempt_id:"stable",params,expires_at:"2099-01-01",stripe_session_id:status?"cs_one":null};
 let failSave=false; const keys:string[]=[];
 const admin={rpc:async()=>({data:attempt,error:null}),from:(table:string)=>{
  let patch:any,removed=false;
  const b:any={select:()=>b,eq:()=>b,update:(p:any)=>{patch=p;return b;},delete:()=>{removed=true;return b;},maybeSingle:async()=>({data:fulfilled?{fulfillment_state:"fulfilled"}:null,error:null}),then:(ok:any)=>{
    if(failSave){failSave=false;return Promise.resolve({error:new Error("save failed")}).then(ok);}
    if(removed)attempt={...attempt,attempt_id:"new",stripe_session_id:null};
    if(patch)attempt={...attempt,...patch};
    return Promise.resolve({error:null}).then(ok);
  }};return b;
 }};
 const stripe={checkout:{sessions:{retrieve:async()=>({id:"cs_one",status,url:"https://checkout.stripe.com/one"}),create:async(_:any,o:any)=>{keys.push(o.idempotencyKey);return {id:"cs_one",status:"open",url:"https://checkout.stripe.com/one"};}}}};
 return {admin,stripe,keys,fail:()=>{failSave=true;}};
}
Deno.test("payment pack two tabs reuse one stable Stripe idempotency key",async()=>{
 const f=fixture();await Promise.all([paymentCheckout(f.stripe,f.admin,"user",params),paymentCheckout(f.stripe,f.admin,"user",params)]);
 assertEquals(new Set(f.keys).size,1);
});
Deno.test("Stripe created but local save failed: retry uses identical key",async()=>{
 const f=fixture();f.fail();await assertRejects(()=>paymentCheckout(f.stripe,f.admin,"user",params));
 await paymentCheckout(f.stripe,f.admin,"user",params);assertEquals(f.keys,["payment-checkout-stable","payment-checkout-stable"]);
});
Deno.test("paid but not delivered: cannot buy again; delivered purchase permits another pack",async()=>{
 const pending=fixture("complete");await assertRejects(()=>paymentCheckout(pending.stripe,pending.admin,"user",params));assertEquals(pending.keys.length,0);
 const delivered=fixture("complete",true);await paymentCheckout(delivered.stripe,delivered.admin,"user",params);assertEquals(delivered.keys,["payment-checkout-new"]);
});
