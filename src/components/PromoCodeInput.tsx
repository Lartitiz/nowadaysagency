import { useState } from "react";
import { Gift, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useUserPlan } from "@/hooks/use-user-plan";
import { friendlyError } from "@/lib/error-messages";

export default function PromoCodeInput() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ plan: string; expires_at: string | null; code: string; coachingSetupFailed?: boolean; warning?: string } | null>(null);
  const { refresh } = useUserPlan();

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("redeem-promo", {
        body: { code: code.trim() },
      }, 30000);
      if (error) throw new Error(error.message);
      if (data?.error) {
        toast.error("Erreur", { description: data.error });
      } else if (data?.success) {
        setResult(data);
        if (data.coachingSetupFailed) {
          toast.warning("Code activé, avec un souci technique", { description: data.warning });
        } else {
          toast.success("🎉 Code activé !");
        }
        await refresh();
      }
    } catch (e: any) {
      toast.error("Erreur", { description: friendlyError(e) });
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const planLabel = result.plan === "binome" ? "Binôme de com" : "Outil";
    const expiryLabel = result.expires_at
      ? new Date(result.expires_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
      : "illimité";

    if (result.coachingSetupFailed) {
      return (
        <div className="flex items-start gap-3 rounded-xl bg-[#FFF4E5] p-4">
          <AlertTriangle className="h-5 w-5 text-[#B26A00] mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#B26A00]">Code activé, mais...</p>
            <p className="text-sm text-[#B26A00]/80">
              Tu as accès au plan {planLabel} jusqu'au {expiryLabel}. {result.warning}
            </p>
          </div>
        </div>
      );
    }

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
