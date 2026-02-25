import { useState } from "react";
import { Gift, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUserPlan } from "@/hooks/use-user-plan";

export default function PromoCodeInput() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ plan: string; expires_at: string | null; code: string } | null>(null);
  const { toast } = useToast();
  const { refresh } = useUserPlan();

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-promo", {
        body: { code: code.trim() },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      } else if (data?.success) {
        setResult(data);
        toast({ title: "🎉 Code activé !" });
        await refresh();
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const planLabel = result.plan === "now_pilot" ? "Binôme de com" : result.plan === "studio" ? "Binôme de com" : "Outil";
    const expiryLabel = result.expires_at
      ? new Date(result.expires_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
      : "illimité";

    return (
      <div className="flex items-start gap-3 rounded-xl bg-[#E8F5E9] p-4">
        <CheckCircle className="h-5 w-5 text-[#2E7D32] mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-[#2E7D32]">Code activé !</p>
          <p className="text-sm text-[#2E7D32]/80">
            Tu as accès au plan {planLabel} jusqu'au {expiryLabel}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground flex items-center gap-2">
        <Gift className="h-4 w-4 text-primary" />
        Tu as un code d'accès ?
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="MONCODE"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="rounded-[10px] h-10 uppercase tracking-wider font-mono"
          onKeyDown={(e) => e.key === "Enter" && handleRedeem()}
        />
        <Button
          onClick={handleRedeem}
          disabled={loading || !code.trim()}
          className="rounded-full px-5 shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activer"}
        </Button>
      </div>
    </div>
  );
}
