import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CreditCard, Loader2, ArrowRight, Zap, ChevronDown, ChevronUp, Gift } from "lucide-react";
import { useUserPlan, type AiCategory } from "@/hooks/use-user-plan";
import { STRIPE_PLANS, CREDIT_PACKS } from "@/lib/stripe-config";
import { Link } from "react-router-dom";
import PromoCodeInput from "@/components/PromoCodeInput";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// Compteur global unique (« total ») affiché en tête. Ici on ne détaille que les
// deux sous-plafonds qui ont vraiment du sens : les audits et les carrousels
// Qualité Max (Opus, réservés au payant). Le reste compte dans le compteur global.
const QUOTA_CATEGORIES: { key: AiCategory; emoji: string; label: string }[] = [
  { key: "audit", emoji: "🔍", label: "Audits" },
  { key: "quality_max", emoji: "✨", label: "Carrousels Qualité Max" },
];


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
  const { plan, usage, isPaid, isBinome, bonusCredits, refresh } = useUserPlan();
  const { activeWorkspace, loading: workspaceLoading } = useWorkspace();

  const [subInfo, setSubInfo] = useState<any>(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [packLoading, setPackLoading] = useState<string | null>(null);

  useEffect(() => {
    // Attendre le workspace actif : le « Plan actuel » affiché doit être le plan
    // EFFECTIF (celui que le serveur applique), qui dépend du périmètre.
    if (workspaceLoading) return;
    refresh();

    (async () => {
      setLoadingSub(true);
      try {
        const { data } = await invokeWithTimeout(
          "check-subscription",
          { body: { workspace_id: activeWorkspace?.id || null } },
          15000,
        );
        if (data) setSubInfo(data);
      } catch (e) {
        console.error("Abonnement error:", e);
        toast.error("Une erreur est survenue. Réessaie ou contacte le support.");
      }
      setLoadingSub(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceLoading, activeWorkspace?.id]);

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data } = await invokeWithTimeout("create-portal-session", {}, 15000);
      if (data?.url) window.open(data.url, "_blank");
    } catch (e) {
      console.error("Abonnement error:", e);
      toast.error("Une erreur est survenue. Réessaie ou contacte le support.");
    }
    setPortalLoading(false);
  };

  const handleCheckout = async (priceId: string) => {
    setPortalLoading(true);
    try {
      const { data } = await invokeWithTimeout("create-checkout", {
        body: { priceId, mode: "subscription" },
      }, 15000);
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      console.error("Abonnement error:", e);
      toast.error("Une erreur est survenue. Réessaie ou contacte le support.");
    }
    setPortalLoading(false);
  };

  const handleBuyPack = async (packKey: string, priceId: string) => {
    if (!priceId) return;
    setPackLoading(packKey);
    try {
      const { data } = await invokeWithTimeout("create-checkout", {
        body: { priceId, mode: "payment" },
      }, 15000);
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      console.error("Abonnement error:", e);
      toast.error("Une erreur est survenue. Réessaie ou contacte le support.");
    }
    setPackLoading(null);
  };


  const planLabel = subInfo?.plan === "binome" ? "🤝 Binôme de com" : subInfo?.plan === "outil" ? "Premium" : "Gratuit";

  const totalUsed = usage.total?.used ?? 0;
  const totalLimit = usage.total?.limit ?? 100;
  // Les crédits bonus peuvent porter la conso au-delà du mensuel : on plafonne
  // l'affichage à 100% (un « 25/23 — 109% » lit comme un bug, pas comme un état).
  const totalUsedCapped = Math.min(totalUsed, totalLimit);
  const totalPct = totalLimit > 0 ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0;
  const totalRemaining = Math.max(0, totalLimit - totalUsed);
  const isUnlimited = totalLimit >= 9999;
  const isExhausted = !isUnlimited && totalRemaining === 0;
  const monthName = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const renewalDate = getNextRenewalDate();

  const packsAvailable = Object.values(CREDIT_PACKS).some(p => p.priceId);

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
                {subInfo?.plan === "binome" && " · 290€/mois"}
              </p>
              {subInfo?.plan === "binome" && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">🎯 Accompagnement 6 mois · 7 sessions avec Laetitia</p>
                  <p className="text-xs text-muted-foreground">✨ Création de contenu illimitée incluse</p>
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
                <div>
                  <Button size="sm" variant="outline" className="rounded-full mt-2 gap-1.5" onClick={handlePortal} disabled={portalLoading}>
                    {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Gérer mon abonnement
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">Modifier ta carte, voir tes factures, ou annuler.</p>
                </div>
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
            {isUnlimited ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Créations ce mois : {totalUsed}</span>
                  <span className="font-semibold text-primary">Illimité</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Crée autant que tu veux. Seuls les carrousels Qualité Max ont un quota mensuel.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Crédits mensuels : {totalUsedCapped}/{totalLimit} utilisés</span>
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
              </>
            )}
          </div>

          {/* Bonus credits display */}
          {bonusCredits > 0 && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
              <Gift className="h-4 w-4 text-primary" />
              <span className="text-sm text-foreground">
                🎁 Tu as aussi <strong>{bonusCredits} crédits bonus</strong> (jamais expirés)
              </span>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            💡 Astuce : invite une amie à rejoindre ton workspace et gagne 5 crédits bonus.
          </p>

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
                // Masque les sous-plafonds non pertinents : 0 (non dispo sur ce
                // plan) et illimité (≥9999, inutile d'afficher « X/9999 »).
                if (!catUsage || catUsage.limit === 0 || catUsage.limit >= 9999) return null;
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

          {/* Credit packs */}
          {packsAvailable && (
            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-sm font-semibold text-foreground mb-1">⚡ Acheter des crédits bonus</p>
              <p className="text-xs text-muted-foreground mb-3">
                Les crédits bonus ne s'épuisent jamais et sont utilisés après tes crédits mensuels.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(CREDIT_PACKS).map(([key, pack]) => {
                  if (!pack.priceId) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => handleBuyPack(key, pack.priceId)}
                      disabled={!!packLoading}
                      className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-center"
                    >
                      {packLoading === key ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <span className="text-lg">{pack.emoji}</span>
                      )}
                      <span className="text-sm font-semibold text-foreground">{pack.label}</span>
                      <span className="text-xs text-primary-text font-semibold">{pack.price.toFixed(2).replace('.', ',')}€</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Exhausted state — si des bonus restent, ils prennent le relais : pas d'alarme rouge */}
          {isExhausted && bonusCredits > 0 && (
            <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/10">
              <p className="text-sm font-semibold text-foreground">Crédits mensuels utilisés — tes bonus prennent le relais 🎁</p>
              <p className="text-xs text-muted-foreground mt-1">
                Il te reste <strong>{bonusCredits} crédits bonus</strong> : tu peux continuer à créer normalement.
                Tes crédits mensuels reviennent le {renewalDate}.
              </p>
            </div>
          )}
          {isExhausted && bonusCredits === 0 && (
            <div className="mt-4 p-4 rounded-xl bg-destructive/5 border border-destructive/20">
              <p className="text-sm font-semibold text-foreground">😅 Plus de crédits ce mois-ci !</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tu as utilisé tous tes crédits. Ils se renouvellent le {renewalDate}.
              </p>
              {packsAvailable ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Tu peux acheter un pack de crédits bonus ci-dessus pour continuer.
                </p>
              ) : (
                <Link to="/pricing" className="inline-block mt-2 text-xs text-primary font-medium hover:underline">
                  Passer au plan Premium pour plus de crédits →
                </Link>
              )}
            </div>
          )}

          {!isExhausted && plan === "free" && !packsAvailable && (
            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-sm font-semibold text-foreground mb-1">Envie de plus de crédits ?</p>
              <p className="text-xs text-muted-foreground mb-3">
                Le plan Premium débloque la création illimitée + la publication automatique sur tes réseaux.
              </p>
              <Link to="/pricing">
                <Button size="sm" variant="outline" className="rounded-full text-xs">
                  Voir les plans →
                </Button>
              </Link>
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
              credits="Pour démarrer"
              active={plan === "free"}
              onSelect={() => {}}
              disabled
            />
            <PlanCard
              name="Premium"
              price="39€/mois"
              credits="Création illimitée"
              active={plan === "outil"}
              onSelect={() => handleCheckout(STRIPE_PLANS.outil.priceId)}
              disabled={plan === "outil" || portalLoading}
            />
            <div className={`rounded-xl border-2 p-4 text-center transition-all ${
              plan === "binome" ? "border-primary bg-rose-pale" : "border-border hover:border-primary/30"
            }`}>
              <h3 className="font-display font-bold text-foreground">🤝 Ta binôme de com</h3>
              <p className="text-lg font-semibold text-primary-text mt-1">290€/mois</p>
              <p className="text-xs text-muted-foreground mt-0.5">Engagement 6 mois</p>
              <div className="text-2xs text-muted-foreground mt-1 space-y-0.5 text-left">
                <p>✅ L'outil complet en illimité</p>
                <p>✅ 3 sessions fondations</p>
                <p>✅ 4 sessions focus personnalisées</p>
                <p>✅ WhatsApp illimité 6 mois</p>
                <p>✅ 7 sessions avec Laetitia (~12h)</p>
                <p>✅ Comptes-rendus détaillés</p>
              </div>
              {plan === "binome" ? (
                <span className="inline-block mt-3 text-xs font-semibold text-primary-text">Plan actuel ✓</span>
              ) : (
                <Button size="sm" variant="outline" className="mt-3 rounded-full text-xs" onClick={() => window.open("https://calendly.com/laetitia-mattioli/appel-decouverte", "_blank")}>
                  📞 Réserver un appel découverte
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
      <p className="text-lg font-semibold text-primary-text mt-1">{price}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{credits}</p>
      {active ? (
        <span className="inline-block mt-3 text-xs font-semibold text-primary">Plan actuel ✓</span>
      ) : (
        <Button size="sm" variant="outline" className="mt-3 rounded-full text-xs" onClick={onSelect} disabled={disabled}>
          Passer à {name} →
        </Button>
      )}
    </div>
  );
}
