import { useState } from "react";
import { Gift, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useUserPlan } from "@/hooks/use-user-plan";
import { friendlyError } from "@/lib/error-messages";
import { STRIPE_PLANS } from "@/lib/stripe-config";

// Pages où create-checkout accepte de revenir si la personne annule le paiement.
const CANCEL_PAGES = ["/pricing", "/abonnement", "/parametres"];

export default function PromoCodeInput() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState(false);
  // Code de réduction Stripe reconnu : il s'applique au paiement, pas ici.
  const [discount, setDiscount] = useState<{ code: string; label: string } | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [result, setResult] = useState<{ plan: string; expires_at: string | null; code: string; coachingSetupFailed?: boolean; warning?: string } | null>(null);
  const { refresh } = useUserPlan();

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("redeem-promo", {
        body: { code: code.trim() },
      }, 30000);
      // Un refus (400) arrive avec `error` ET le message du serveur dans `data` :
      // on lit d'abord la réponse, l'erreur technique seulement s'il n'y en a pas.
      if (data?.discount) {
        setHint(false);
        setDiscount(data.discount);
      } else if (data?.error) {
        // Un code de réduction (ex. tarif partenaire) ne vit pas ici mais sur la
        // page de paiement : le dire, sinon « invalide » laisse croire qu'il ne marche pas.
        const unknownCode = /invalide/i.test(data.error);
        setHint(unknownCode);
        toast.error("Erreur", { description: data.error });
      } else if (error) {
        throw new Error(error.message);
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

  const handleDiscountCheckout = async () => {
    if (!discount || checkoutLoading) return;
    setCheckoutLoading(true);
    try {
      const page = CANCEL_PAGES.includes(window.location.pathname) ? window.location.pathname : "/pricing";
      const { data, error } = await invokeWithTimeout("create-checkout", {
        body: {
          priceId: STRIPE_PLANS.outil.priceId,
          mode: "subscription",
          promotionCode: discount.code,
          cancelUrl: `${window.location.origin}${page}?checkout=cancelled`,
        },
      }, 15000);
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      toast.error("Erreur", { description: friendlyError(e) });
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (discount) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-[#E8F5E9] p-4" role="status">
        <CheckCircle className="h-5 w-5 text-[#2E7D32] mt-0.5 shrink-0" />
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[#2E7D32]">Code de réduction reconnu : {discount.label} sur le Premium</p>
          <p className="text-sm text-[#2E7D32]/80">
            La réduction s'applique au paiement. Tu verras le prix réduit sur la page de paiement avant de valider.
          </p>
          <Button onClick={handleDiscountCheckout} disabled={checkoutLoading} className="rounded-full px-5">
            {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Passer au paiement avec cette réduction"}
          </Button>
          <button type="button" onClick={() => { setDiscount(null); setCode(""); }} className="block text-xs text-muted-foreground underline">
            Saisir un autre code
          </button>
        </div>
      </div>
    );
  }

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
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setHint(false); }}
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
      {hint && (
        <p className="text-sm text-muted-foreground" role="status">
          Vérifie l'orthographe du code. Si c'est un code de réduction sur l'abonnement, tu peux aussi le saisir sur la page de paiement, dans « Ajouter un code promotionnel ».
        </p>
      )}
    </div>
  );
}
