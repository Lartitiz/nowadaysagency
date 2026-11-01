import { supabase } from "@/integrations/supabase/client";
export const preuve = (p: string) => supabase.storage.from("user-photos").remove([p]);
