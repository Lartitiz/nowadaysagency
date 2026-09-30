import { lireRetour } from "@/lib/retour-apres-detour";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CreditCard, Loader2, ArrowRight, Zap, ChevronDown, ChevronUp, Gift, Search, Sparkles, Handshake, Gem, Target, Lightbulb, BarChart3, Check, Phone, Flame, Image as ImageIcon, Video, type LucideIcon } from "lucide-react";
import { useUserPlan, type AiCategory } from "@/hooks/use-user-plan";
import { STRIPE_PLANS, CREDIT_PACKS } from "@/lib/stripe-config";
import { Link, useNavigate } from "react-router-dom";
import { isFairUsePlan } from "@/lib/plan-limits";
import PromoCodeInput from "@/components/PromoCodeInput";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// Compteur global unique (« total ») affiché en tête. Ici on ne détaille que les
// sous-plafonds qui ont vraiment du sens (grille du 01/10/2026) : carrousels
// (Qualité Max compris), images, vidéos, et les audits du gratuit. Le reste
// compte dans le compteur global.
const QUOTA_CATEGORIES: { key: AiCategory; icon: LucideIcon; label: string }[] = [
  { key: "carousel", icon: Sparkles, label: "Carrousels (Qualité Max compris)" },
  { key: "photo_retouch", icon: ImageIcon, label: "Images" },
  { key: "video", icon: Video, label: "Vidéos" },
  { key: "audit", icon: Search, label: "Audits" },
];

// Icônes filaires des packs de crédits (le champ `emoji` de CREDIT_PACKS reste
// dans stripe-config, mais l'affichage passe par lucide — charte Nowadays).
const PACK_ICONS: Record<string, LucideIcon> = {
  pack_10: Zap,
  pack_30: Zap,
  pack_60: Flame,
};


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
  const retour = lireRetour();
  const navigate = useNavigate();
  const checkoutCancelled = new URLSearchParams(window.location.search).get("checkout") === "cancelled";
  const { user } = useAuth();
  const { plan, usage, isPaid, isBinome, bonusCredits, refresh, verified } = useUserPlan();
  const { activeWorkspace, loading: workspaceLoading, switchWorkspace } = useWorkspace();

  const [subInfo, setSubInfo] = useState<any>(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [packLoading, setPackLoading] = useState<string | null>(null);

  useEffect(() => {
    // Attendre le workspace actif : le « Plan actuel » affiché doit être le plan
    // EFFECTIF (celui que le serveur applique), qui dépend du périmètre.
    if (workspaceLoading) return;
    let cancelled = false;
    refresh();

    (async () => {
      setLoadingSub(true);
      setSubscriptionError(false);
      setSubInfo(null);
      try {
        const { data, error } = await invokeWithTimeout(
          "check-subscription",
          { body: { workspace_id: activeWorkspace?.id || null } },
          15000,
        );
        if (error || data?.error || !data?.plan) throw new Error(error?.message || data?.error || "Abonnement indisponible");
        if (!cancelled) setSubInfo(data);
      } catch (e) {
        console.error("Abonnement error:", e);
        if (!cancelled) setSubscriptionError(true);
      }
      if (!cancelled) setLoadingSub(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, workspaceLoading, activeWorkspace?.id, retryCount]);

  const handlePortal = async () => {
    if (portalLoading || packLoading || !verified) return;
    setPortalLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("create-portal-session", {}, 15000);
      if (error || !data?.url) throw new Error(error?.message || "Lien de paiement indisponible");
      if (data?.url) window.open(data.url, "_blank");
    } catch (e) {
      console.error("Abonnement error:", e);
      toast.error(e instanceof Error ? e.message : "Une erreur est survenue. Réessaie.");
    }
    setPortalLoading(false);
  };

  const handleCheckout = async (priceId: string) => {
    if (portalLoading || packLoading || !verified) return;
    setPortalLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("create-checkout", {
        body: { priceId, mode: "subscription", cancelUrl: `${window.location.origin}/abonnement?checkout=cancelled` },
      }, 15000);
      if (error || !data?.url) throw new Error(error?.message || "Lien de paiement indisponible");
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      console.error("Abonnement error:", e);
      toast.error(e instanceof Error ? e.message : "Une erreur est survenue. Réessaie.");
    }
    setPortalLoading(false);
  };

  const handleBuyPack = async (packKey: string, priceId: string) => {
    if (!priceId || packLoading || portalLoading || !verified) return;
    setPackLoading(packKey);
    try {
      const { data, error } = await invokeWithTimeout("create-checkout", {
        body: { priceId, mode: "payment", cancelUrl: `${window.location.origin}/abonnement?checkout=cancelled` },
      }, 15000);
      if (error || !data?.url) throw new Error(error?.message || "Lien de paiement indisponible");
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      console.error("Abonnement error:", e);
      toast.error(e instanceof Error ? e.message : "Une erreur est survenue. Réessaie.");
    }
    setPackLoading(null);
  };


  const planLabel = subInfo?.source === "admin" ? "Accès administrateur" : subInfo?.plan === "binome" ? "Binôme de com" : subInfo?.plan === "outil" ? "Premium" : "Gratuit";
  const isAdminAccess = subInfo?.source === "admin";

  const totalUsed = usage.total?.used ?? 0;
  const totalLimit = usage.total?.limit ?? 100;
  // Les crédits bonus peuvent porter la conso au-delà du mensuel : on plafonne
  // l'affichage à 100% (un « 25/23 — 109% » lit comme un bug, pas comme un état).
  const totalUsedCapped = Math.min(totalUsed, totalLimit);
  const totalPct = totalLimit > 0 ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0;
  const totalRemaining = Math.max(0, totalLimit - totalUsed);
  const isUnlimited = isFairUsePlan(isAdminAccess ? "admin" : subInfo?.plan, totalLimit);
  const isExhausted = !isUnlimited && totalRemaining === 0;
  const monthName = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const renewalDate = getNextRenewalDate();

  const packsAvailable = Object.values(CREDIT_PACKS).some(p => p.priceId);

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-8">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
        {retour && <Button variant="outline" className="mb-4" onClick={async () => { if (retour.workspaceId && !await switchWorkspace(retour.workspaceId)) return; navigate(retour.chemin); }}>Reprendre {retour.quoi}</Button>}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-rose-pale flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Mon abonnement</h1>
            <p className="text-sm text-muted-foreground">Ton plan, tes crédits, ta facturation.</p>
          </div>
        </div>

        {checkoutCancelled && <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm mb-4">Paiement annulé. Aucun nouvel achat n’a été confirmé.</p>}

        {subscriptionError && (
          <div role="alert" className="rounded-2xl border border-destructive/30 bg-card p-6 mb-4">
            <p className="font-semibold">Abonnement momentanément indisponible</p>
            <p className="text-sm text-muted-foreground mt-1">Nous ne pouvons pas confirmer ton plan ni tes crédits. Réessaie avant de changer d’abonnement.</p>
            <Button variant="outline" className="rounded-full mt-3" onClick={() => setRetryCount(value => value + 1)}>Réessayer</Button>
          </div>
        )}

        {loadingSub && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Vérification de l’abonnement…</p>}
        {!loadingSub && !subscriptionError && <>

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
                <span className="font-semibold text-primary inline-flex items-center gap-1">
                  {subInfo?.source === "promo" && <Gem className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  {subInfo?.plan === "binome" && <Handshake className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  {planLabel}
                </span>
                {subInfo?.source === "stripe" && subInfo?.plan === "outil" && " · 39€/mois"}
                {subInfo?.source === "stripe" && subInfo?.plan === "binome" && " · 350€/mois"}
              </p>
              {subInfo?.source === "admin" && <p className="text-xs text-muted-foreground">Accès de gestion et de démonstration, sans mensualité liée à ce rôle.</p>}
              {subInfo?.plan === "binome" && subInfo?.source !== "admin" && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Target className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.75} /> Accompagnement 6 mois · 7 sessions avec Laetitia</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.75} /> Création de contenu illimitée incluse</p>
                </div>
              )}
              {subInfo?.source === "promo" && subInfo?.current_period_end && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Gift className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.75} /> Expire le {new Date(subInfo.current_period_end).toLocaleDateString("fr-FR")}</p>
              )}
              {subInfo?.source === "stripe" && subInfo?.current_period_end && subInfo.plan !== "free" && (
                <p className="text-xs text-muted-foreground">Prochain renouvellement : {new Date(subInfo.current_period_end).toLocaleDateString("fr-FR")}</p>
              )}
              {isPaid && subInfo?.has_stripe_subscription && (
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
                  {isAdminAccess ? "Accès illimité de gestion et de démonstration." : "Tes textes sans compter. Les carrousels, les images et les vidéos ont un plafond mensuel : clique sur « Voir le détail »."}
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
          {!isAdminAccess && bonusCredits > 0 && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
              <Gift className="h-4 w-4 text-primary" />
              <span className="text-sm text-foreground">
                Tu as aussi <strong>{bonusCredits} crédits bonus</strong> (jamais expirés)
              </span>
            </div>
          )}
          {!isAdminAccess && <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" strokeWidth={1.75} /> Astuce : invite une amie à rejoindre ton workspace et gagne 5 crédits bonus.
          </p>}

          {/* Category detail toggle */}
          {!isAdminAccess && <button
            onClick={() => setShowDetail(!showDetail)}
            className="flex items-center gap-1 mt-4 text-xs text-primary hover:underline"
          >
            {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showDetail ? "Masquer le détail" : "Voir le détail"}
          </button>}

          {!isAdminAccess && showDetail && (
            <div className="mt-3 space-y-3 pt-3 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.75} /> Détail des crédits ce mois</p>
              {QUOTA_CATEGORIES.map(cat => {
                const catUsage = usage[cat.key];
                // Masque les sous-plafonds non pertinents : 0 (non dispo sur ce
                // plan) et illimité (≥9999, inutile d'afficher « X/9999 »).
                // (la valeur alignée sur le garde-fou global, ex. audits 200 en
                // Premium, n'est pas un plafond à montrer non plus).
                if (!catUsage || catUsage.limit === 0 || catUsage.limit >= 9999 || (isUnlimited && catUsage.limit >= totalLimit)) return null;
                const pct = catUsage.limit > 0 ? Math.round((catUsage.used / catUsage.limit) * 100) : 0;
                return (
                  <div key={cat.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><cat.icon className="h-3 w-3 shrink-0" strokeWidth={1.75} /> {cat.label}</span>
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
          {!isAdminAccess && packsAvailable && (
            <div className="mt-5 pt-4 border-t border-border">
              <p id="packs" className="scroll-mt-24 text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5"><Zap className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} /> Acheter des crédits bonus</p>
              <p className="text-xs text-muted-foreground mb-3">
                Les crédits bonus n’expirent pas et sont utilisés après tes crédits mensuels. Ils n’ouvrent pas les fonctions Premium et n’augmentent pas les plafonds d’images, de carrousels ou de vidéos.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(CREDIT_PACKS).map(([key, pack]) => {
                  if (!pack.priceId) return null;
                  const PackIcon = PACK_ICONS[key] || Zap;
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
                        <PackIcon className="h-5 w-5 text-primary" strokeWidth={1.75} />
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
              <p className="text-sm font-semibold text-foreground">Crédits mensuels utilisés : tes bonus prennent le relais 🎁</p>
              <p className="text-xs text-muted-foreground mt-1">
                Il te reste <strong>{bonusCredits} crédits bonus</strong> : tu peux continuer à créer normalement.
                Tes crédits mensuels reviennent le {renewalDate}.
              </p>
            </div>
          )}
          {isExhausted && bonusCredits === 0 && (
            <div className="mt-4 p-4 rounded-xl bg-destructive/5 border border-destructive/20">
              <p className="text-sm font-semibold text-foreground">Plus de crédits ce mois-ci !</p>
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
                Le plan Premium : tes textes sans compter, 20 carrousels, 30 images et 3 vidéos par mois, plus la publication automatique sur tes réseaux.
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
        {subInfo?.source !== "admin" && <div className="rounded-2xl border border-border bg-card p-6 mb-4">
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
              credits="Textes sans compter · 20 carrousels · 30 images · 3 vidéos / mois"
              active={plan === "outil"}
              onSelect={() => handleCheckout(STRIPE_PLANS.outil.priceId)}
              disabled={plan === "outil" || portalLoading}
            />
            <div className={`rounded-xl border-2 p-4 text-center transition-all ${
              plan === "binome" ? "border-primary bg-rose-pale" : "border-border hover:border-primary/30"
            }`}>
              <h3 className="font-display font-bold text-foreground flex items-center justify-center gap-1.5"><Handshake className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} /> Ta binôme de com</h3>
              <p className="text-lg font-semibold text-primary-text mt-1">350€/mois</p>
              <p className="text-xs text-muted-foreground mt-0.5">Engagement 6 mois</p>
              <div className="text-2xs text-muted-foreground mt-1 space-y-0.5 text-left">
                <p className="flex items-start gap-1"><Check className="h-3 w-3 shrink-0 mt-0.5 text-primary" strokeWidth={1.75} /> L'outil complet : 40 carrousels, 60 images, 6 vidéos / mois</p>
                <p className="flex items-start gap-1"><Check className="h-3 w-3 shrink-0 mt-0.5 text-primary" strokeWidth={1.75} /> 3 sessions fondations</p>
                <p className="flex items-start gap-1"><Check className="h-3 w-3 shrink-0 mt-0.5 text-primary" strokeWidth={1.75} /> 4 sessions focus personnalisées</p>
                <p className="flex items-start gap-1"><Check className="h-3 w-3 shrink-0 mt-0.5 text-primary" strokeWidth={1.75} /> WhatsApp illimité 6 mois</p>
                <p className="flex items-start gap-1"><Check className="h-3 w-3 shrink-0 mt-0.5 text-primary" strokeWidth={1.75} /> 7 sessions avec Laetitia (~12h)</p>
                <p className="flex items-start gap-1"><Check className="h-3 w-3 shrink-0 mt-0.5 text-primary" strokeWidth={1.75} /> Comptes-rendus détaillés</p>
              </div>
              {plan === "binome" ? (
                <span className="inline-block mt-3 text-xs font-semibold text-primary-text">Plan actuel ✓</span>
              ) : (
                <Button size="sm" variant="outline" className="mt-3 rounded-full text-xs gap-1.5" onClick={() => window.open("https://calendly.com/laetitia-mattioli/appel-decouverte", "_blank")}>
                  <Phone className="h-3.5 w-3.5" strokeWidth={1.75} /> Réserver un appel découverte
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Pour changer de plan ou poser une question : <a href="mailto:laetitia@nowadaysagency.com" className="text-primary underline">laetitia@nowadaysagency.com</a>
          </p>
        </div>}

        {/* ─── Promo code ─── */}
        {subInfo?.source !== "admin" && <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold text-foreground mb-3">Code promotionnel</h2>
          <PromoCodeInput />
        </div>}
        </>}
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
        <span className="inline-block mt-3 text-xs font-semibold text-primary-text">Plan actuel ✓</span>
      ) : (
        <Button size="sm" variant="outline" className="mt-3 rounded-full text-xs" onClick={onSelect} disabled={disabled}>
          Passer à {name} →
        </Button>
      )}
    </div>
  );
}
