import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { sharedBrandingAccess } from "./handler.ts";

Deno.serve((req) => sharedBrandingAccess(req, createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)));
