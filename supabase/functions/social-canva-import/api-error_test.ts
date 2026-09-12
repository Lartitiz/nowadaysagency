import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CanvaApiError, checkCanvaResponse } from "./api-error.ts";
Deno.test("Canva errors stop polling with an actionable message", () => {
  for (const [status, code, responseStatus] of [[401,"not_connected",400],[403,"canva_forbidden",403],[429,"canva_rate_limit",429],[503,"canva_unavailable",502]] as const) {
    const e = assertThrows(() => checkCanvaResponse({ok:false,status},{}), CanvaApiError);
    assertEquals(e.code,code);
    assertEquals(e.status,responseStatus);
  }
  checkCanvaResponse({ok:true,status:200},{job:{status:"in_progress"}});
});
