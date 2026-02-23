import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CreditCard, Loader2, ArrowRight } from "lucide-react";
import { useUserPlan, type AiCategory } from "@/hooks/use-user-plan";
import { STRIPE_PLANS } from "@/lib/stripe-config";
import { Link } from "react-router-dom";
import PromoCodeInput from "@/components/PromoCodeInput";

const QUOTA_CATEGORIES: { key: AiCategory; emoji: string; label: string }[] = [
  { key: "content", emoji: "📝", label: "Contenus" },
  { key: "audit", emoji: "🔍", label: "Audits" },
  { key: "dm_comment", emoji: "📩", label: "DM / Commentaires" },
  { key: "bio_profile", emoji: "👤", label: "Bio / Profil" },
  { key: "suggestion", emoji: "💡", label: "Suggestions" },
  { key: "import", emoji: "📄", label: "Imports" },
  { key: "adaptation", emoji: "🔄", label: "Adaptations" },
];

export default function AbonnementPage() {
  const { user } = useAuth();
  const { plan, usage, isPaid } = useUserPlan();

  const [subInfo, setSubInfo] = useState<any>(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingSub(true);
      try {
        const { data } = await supabase.functions.invoke("check-subscription");
        if (data) setSubInfo(data);
      } catch {}
      setLoadingSub(false);
    })();
  }, []);

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data } = await supabase.functions.invoke("create-portal-session");
      if (data?.url) window.open(data.url, "_blank");
    } catch {}
    setPortalLoading(false);
  };

  const handleCheckout = async (priceId: string) => {
    setPortalLoading(true);
    try {
      const { data } = await supabase.functions.invoke("create-checkout", {
        body: { priceId, mode: "subscription" },
      });
      if (data?.url) window.location.href = data.url;
    } catch {}
    setPortalLoading(false);
  };

  const planLabel = subInfo?.plan === "studio" ? "Now Studio" : subInfo?.plan === "outil" ? "Outil" : "Gratuit";
  const totalUsed = usage.total?.used ?? 0;
  const totalLimit = usage.total?.limit ?? 100;
  const monthName = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-8">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-rose-pale flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Mon abonnement</h1>
            <p className="text-sm text-muted-foreground">Ton plan, tes crédits, ta facturation.</p>
          </div>
        </div>

        {/* ─── Plan actuel ─── */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-4">
          <h2 className="font-display text-lg font-bold text-foreground mb-3">Plan actuel</h2>
          {loadingSub ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                <span className="font-semibold text-primary">{subInfo?.source === "promo" ? "💎 " : ""}{planLabel}</span>
                {subInfo?.plan === "outil" && " · 39€/mois"}
                {subInfo?.plan === "studio" && " · 250€/mois"}
              </p>
              {subInfo?.source === "promo" && subInfo?.current_period_end && (
                <p className="text-xs text-muted-foreground">🎁 Expire le {new Date(subInfo.current_period_end).toLocaleDateString("fr-FR")}</p>
              )}
              {subInfo?.source !== "promo" && subInfo?.current_period_end && subInfo.plan !== "free" && (
                <p className="text-xs text-muted-foreground">Prochain renouvellement : {new Date(subInfo.current_period_end).toLocaleDateString("fr-FR")}</p>
              )}
              {isPaid && subInfo?.source !== "promo" && (
                <Button size="sm" variant="outline" className="rounded-full mt-2" onClick={handlePortal} disabled={portalLoading}>
                  {portalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Gérer ma facturation
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ─── Crédits IA ─── */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-4">
          <h2 className="font-display text-lg font-bold text-foreground mb-4">
            Mes crédits IA · {monthName}
          </h2>
          <div className="space-y-3">
            {QUOTA_CATEGORIES.map(cat => {
              const catUsage = usage[cat.key];
              if (!catUsage || catUsage.limit === 0) return null;
              const pct = catUsage.limit > 0 ? Math.round((catUsage.used / catUsage.limit) * 100) : 0;
              return (
                <div key={cat.key} className="flex items-center gap-3">
                  <span className="text-base w-6 text-center shrink-0">{cat.emoji}</span>
                  <span className="text-sm font-medium w-28 shrink-0">{cat.label}</span>
                  <Progress value={pct} className="flex-1 h-2" />
                  <span className="text-xs font-mono-ui text-muted-foreground w-14 text-right shrink-0">
                    {catUsage.used}/{catUsage.limit}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Total</span>
            <span className="text-sm font-mono-ui font-semibold text-primary">{totalUsed}/{totalLimit}</span>
          </div>
        </div>

        {/* ─── Changer de plan ─── */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-4">
          <h2 className="font-display text-lg font-bold text-foreground mb-4">Changer de plan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Gratuit */}
            <PlanCard
              name="Gratuit"
              price="0€"
              credits="10 crédits"
              active={plan === "free"}
              onSelect={() => {}}
              disabled
            />
            {/* Outil */}
            <PlanCard
              name="Outil"
              price="39€/mois"
              credits="100 crédits"
              active={plan === "outil"}
              onSelect={() => handleCheckout(STRIPE_PLANS.outil.priceId)}
              disabled={plan === "outil" || portalLoading}
            />
            {/* Studio */}
            <PlanCard
              name="Now Studio"
              price="250€/mois"
              credits="300 crédits"
              active={plan === "studio"}
              onSelect={() => window.open("mailto:hello@nowadays.com?subject=Now Studio", "_blank")}
              disabled={plan === "studio"}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Pour changer de plan ou poser une question : <a href="mailto:hello@nowadays.com" className="text-primary hover:underline">hello@nowadays.com</a>
          </p>
        </div>

        {/* ─── Promo code ─── */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold text-foreground mb-3">Code promotionnel</h2>
          <PromoCodeInput />
        </div>
      </main>
    </div>
  );
}

function PlanCard({ name, price, credits, active, onSelect, disabled }: {
  name: string; price: string; credits: string; active: boolean; onSelect: () => void; disabled: boolean;
}) {
  return (
    <div className={`rounded-xl border-2 p-4 text-center transition-all ${
      active ? "border-primary bg-rose-pale" : "border-border hover:border-primary/30"
    }`}>
      <h3 className="font-display font-bold text-foreground">{name}</h3>
      <p className="text-lg font-semibold text-primary mt-1">{price}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{credits}</p>
      {active ? (
        <span className="inline-block mt-3 text-xs font-semibold text-primary">Plan actuel ✓</span>
      ) : (
        <Button size="sm" variant="outline" className="mt-3 rounded-full text-xs" onClick={onSelect} disabled={disabled}>
          Passer → 
        </Button>
      )}
    </div>
  );
}
