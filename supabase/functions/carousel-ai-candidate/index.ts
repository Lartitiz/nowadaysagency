// Isolated acceptance route: same auth, workspace/quota checks and handler as production.
// No public UI points here. Retire this entrypoint after the accepted release.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleRequest } from "../carousel-ai/index.ts";
if (import.meta.main) serve(handleRequest);
