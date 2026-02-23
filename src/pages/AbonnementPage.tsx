import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CreditCard, Loader2, ArrowRight, Zap, ChevronDown, ChevronUp } from "lucide-react";
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

const CREDIT_PACKS = [
  { credits: 20, price: "4,90€", unitPrice: "~0,25€/crédit", badge: null },
  { credits: 50, price: "9,90€", unitPrice: "~0,20€/crédit", badge: "Le + populaire" },
  { credits: 100, price: "14,90€", unitPrice: "~0,15€/crédit", badge: "Meilleur prix" },
] as const;

function getProgressColor(pct: number): string {
  if (pct >= 80) return "bg-destructive";
  if (pct >= 50) return "bg-primary";
  return "bg-primary/60";
}

function getNextRenewalDate(): string {
  const next = new Date();
  next.setMonth(next.getMonth() + 1, 1);
  return next.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

export default function AbonnementPage() {
  const { user } = useAuth();
  const { plan, usage, isPaid, isPilot, refresh } = useUserPlan();

  const [subInfo, setSubInfo] = useState<any>(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    refresh();

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

  const handleBuyPack = (credits: number, price: string) => {
    const email = user?.email || "";
    const text = encodeURIComponent(
      `Bonjour Laetitia, je voudrais acheter un pack de ${credits} crédits (${price}). Mon email : ${email}`
    );
    window.open(`https://wa.me/33612345678?text=${text}`, "_blank");
  };

  const planLabel = subInfo?.plan === "now_pilot" ? "🤝 Now Pilot" : subInfo?.plan === "studio" ? "Now Studio" : subInfo?.plan === "outil" ? "Outil" : "Gratuit";
  const totalUsed = usage.total?.used ?? 0;
  const totalLimit = usage.total?.limit ?? 100;
  const totalPct = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0;
  const totalRemaining = Math.max(0, totalLimit - totalUsed);
  const isExhausted = totalRemaining === 0;
  const monthName = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const renewalDate = getNextRenewalDate();

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
                {subInfo?.plan === "now_pilot" && " · 250€/mois"}
              </p>
              {subInfo?.plan === "now_pilot" && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">🎯 Accompagnement 6 mois · 9 sessions avec Laetitia</p>
                  <p className="text-xs text-muted-foreground">💡 300 crédits IA / mois</p>
                  <Link to="/accompagnement">
                    <Button size="sm" variant="outline" className="rounded-full mt-1 text-xs">
                      🤝 Voir mon accompagnement →
                    </Button>
                  </Link>
                </div>
              )}
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
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold text-foreground">Mes crédits IA</h2>
          </div>

          {/* Global bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Crédits mensuels : {totalUsed}/{totalLimit} utilisés</span>
              <span className={`font-mono-ui font-semibold ${isExhausted ? "text-destructive" : "text-foreground"}`}>
                {totalPct}%
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full transition-all ${getProgressColor(totalPct)}`}
                style={{ width: `${Math.min(totalPct, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Se renouvellent le {renewalDate}
            </p>
          </div>

          {/* Category detail toggle */}
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="flex items-center gap-1 mt-4 text-xs text-primary hover:underline"
          >
            {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showDetail ? "Masquer le détail" : "Voir le détail"}
          </button>

          {showDetail && (
            <div className="mt-3 space-y-3 pt-3 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-2">📊 Détail des crédits ce mois</p>
              {QUOTA_CATEGORIES.map(cat => {
                const catUsage = usage[cat.key];
                if (!catUsage || catUsage.limit === 0) return null;
                const pct = catUsage.limit > 0 ? Math.round((catUsage.used / catUsage.limit) * 100) : 0;
                return (
                  <div key={cat.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{cat.emoji} {cat.label}</span>
                      <span className="text-xs font-mono-ui text-muted-foreground">{catUsage.used}/{catUsage.limit}</span>
                    </div>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full transition-all ${getProgressColor(pct)}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Exhausted state */}
          {isExhausted && (
            <div className="mt-4 p-4 rounded-xl bg-destructive/5 border border-destructive/20">
              <p className="text-sm font-semibold text-foreground">😅 Plus de crédits ce mois-ci !</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tu as utilisé tous tes crédits. Ils se renouvellent le {renewalDate}.
              </p>
              <p className="text-xs text-muted-foreground mt-2">En attendant, tu peux recharger :</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {CREDIT_PACKS.map(pack => (
                  <Button
                    key={pack.credits}
                    size="sm"
                    variant="outline"
                    className="rounded-full text-xs gap-1"
                    onClick={() => handleBuyPack(pack.credits, pack.price)}
                  >
                    <Zap className="h-3 w-3" /> +{pack.credits} · {pack.price}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* ── Recharger section ── */}
          {!isExhausted && (
            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-sm font-semibold text-foreground mb-1">Besoin de plus de crédits ce mois-ci ?</p>
              <p className="text-xs text-muted-foreground mb-3">
                Les crédits bonus s'ajoutent à ton quota mensuel. Ils n'expirent pas et sont utilisés en dernier.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {CREDIT_PACKS.map(pack => (
                  <div
                    key={pack.credits}
                    className="rounded-xl border border-border p-4 text-center hover:border-primary/40 transition-all relative"
                  >
                    {pack.badge && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full whitespace-nowrap">
                        {pack.badge}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-foreground flex items-center justify-center gap-1">
                      <Zap className="h-4 w-4 text-primary" /> {pack.credits} crédits
                    </p>
                    <p className="text-lg font-bold text-primary mt-1">{pack.price}</p>
                    <p className="text-[11px] text-muted-foreground">{pack.unitPrice}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full mt-3 text-xs w-full"
                      onClick={() => handleBuyPack(pack.credits, pack.price)}
                    >
                      Acheter
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── Changer de plan ─── */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-4">
          <h2 className="font-display text-lg font-bold text-foreground mb-4">Changer de plan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PlanCard
              name="Gratuit"
              price="0€"
              credits="10 crédits"
              active={plan === "free"}
              onSelect={() => {}}
              disabled
            />
            <PlanCard
              name="Outil"
              price="39€/mois"
              credits="100 crédits"
              active={plan === "outil"}
              onSelect={() => handleCheckout(STRIPE_PLANS.outil.priceId)}
              disabled={plan === "outil" || portalLoading}
            />
            <div className={`rounded-xl border-2 p-4 text-center transition-all ${
              plan === "now_pilot" ? "border-primary bg-rose-pale" : "border-border hover:border-primary/30"
            }`}>
              <h3 className="font-display font-bold text-foreground">🤝 Now Pilot</h3>
              <p className="text-lg font-semibold text-primary mt-1">250€/mois</p>
              <p className="text-xs text-muted-foreground mt-0.5">300 crédits · 6 mois</p>
              <p className="text-[11px] text-muted-foreground mt-1">✅ L'outil + 9 sessions avec Laetitia</p>
              {plan === "now_pilot" ? (
                <span className="inline-block mt-3 text-xs font-semibold text-primary">Plan actuel ✓</span>
              ) : (
                <Button size="sm" variant="outline" className="mt-3 rounded-full text-xs" onClick={() => window.open("https://calendly.com/laetitia-mattioli/rendez-vous-avec-laetitia", "_blank")}>
                  📞 Réserver un appel
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Pour changer de plan ou poser une question : <a href="mailto:laetitia@nowadaysagency.com" className="text-primary hover:underline">laetitia@nowadaysagency.com</a>
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
