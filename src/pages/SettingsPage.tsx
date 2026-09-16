import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { Settings, KeyRound, Trash2, Bell, Mail, Sparkles, Shield, Bot, CreditCard, Loader2, ShoppingBag, Gift, ArrowRight, Cookie, RotateCcw, Map, Share2, CalendarHeart, Gem, Handshake, ClipboardList, Lightbulb, User, FileText, Search, FileUp, RefreshCw, type LucideIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { enablePostHog, disablePostHog } from "@/lib/posthog";
import { enableMetaPixel, disableMetaPixel } from "@/lib/meta-pixel";
import { enableSentryReplays, disableSentryReplays } from "@/lib/sentry";
import { STRIPE_PLANS } from "@/lib/stripe-config";
import { useUserPlan } from "@/hooks/use-user-plan";
import { useAccountPreferences } from "@/hooks/use-account-preferences";
import { useProfileUserId, useProfileOwner } from "@/hooks/use-workspace-query";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { MODULE_FLAGS } from "@/config/feature-flags";
import PurchaseHistory from "@/components/settings/PurchaseHistory";
import WorkspaceMembersSection from "@/components/settings/WorkspaceMembersSection";
import PromoCodeInput from "@/components/PromoCodeInput";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function SettingsPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const owner = useProfileOwner();
  const ownerId = owner.userId;
  if (owner.error) return <div role="alert">Impossible de trouver le propriétaire de cet espace. <Button onClick={() => {void owner.reload();}}>Réessayer</Button></div>;
  return <SettingsContent key={`${user?.id || ""}:${activeWorkspace?.id || ""}:${ownerId}`} />;
}

function SettingsContent() {
  const { user, signOut, isAdmin } = useAuth();
  const { plan, isPaid, isBinome, refresh: refreshPlan } = useUserPlan();
  // Clé canonique des lignes `profiles` (propriétaire de l'espace actif, ≠ user.id
  // pour un binôme/manager). DOIT correspondre à ce que lit l'edge function.
  const profileUserId = useProfileUserId();
  const { activeWorkspace } = useWorkspace();

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const ritual = useAccountPreferences(profileUserId);
  const notifications = useAccountPreferences(user?.id || "");
  const ritualEnabled = ritual.data.weekly_ritual_enabled;
  const ritualDay = ritual.data.weekly_ritual_day;
  const ritualLoaded = ritual.loaded && ritual.canEdit;
  const savingRitual = ritual.saving;
  const saveRitual = (next: {enabled?: boolean; day?: number}) => ritual.save(
    next.enabled !== undefined ? {weekly_ritual_enabled: next.enabled} : {weekly_ritual_day: next.day!}
  );
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => {mounted.current = false;}; }, []);
  const [deleting, setDeleting] = useState(false);
  const [resettingOnboarding, setResettingOnboarding] = useState(false);
  
  const navigate = useNavigate();
  const [cookieConsent, setCookieConsent] = useState(() => localStorage.getItem("cookie_consent"));

  // Subscription state
  const [subInfo, setSubInfo] = useState<{ plan: string; status: string; current_period_end?: string; cancel_at?: string; source?: string } | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    loadSubscription();
    // Re-charger quand l'espace actif change : le plan affiché est le plan
    // effectif du périmètre courant (même règle que l'enforcement serveur).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  const loadSubscription = async () => {
    setLoadingSub(true);
    try {
      const { data, error } = await invokeWithTimeout(
        "check-subscription",
        { body: { workspace_id: activeWorkspace?.id || null } },
        15000,
      );
      if (error) throw error;
      if (mounted.current && data) setSubInfo(data);
    } catch (e) {
      console.error("Settings error:", e);
      toast.error("Erreur", { description: "Une erreur est survenue. Réessaie." });
    }
    if (mounted.current) setLoadingSub(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Mot de passe trop court", { description: "6 caractères minimum." });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      console.error("Erreur technique:", error);
      toast.error("Erreur", { description: friendlyError(error) });
    } else {
      toast.success("Mot de passe mis à jour ✓");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("create-portal-session", {}, 15000);
      if (error) throw new Error(error.message);
      if (data?.url) window.open(data.url, "_blank");
    } catch {
      toast.error("Erreur", { description: "Impossible d'ouvrir le portail." });
    }
    setPortalLoading(false);
  };

  const handleCheckoutOutil = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("create-checkout", {
        body: { priceId: STRIPE_PLANS.outil.priceId, mode: "subscription" },
      }, 15000);
      if (error) throw new Error(error.message);
      if (data?.url) window.location.href = data.url;
    } catch {
      toast.error("Erreur", { description: "Impossible d'ouvrir le paiement." });
    }
    setPortalLoading(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      console.log("[delete-account] Calling edge function...");
      const { data, error } = await invokeWithTimeout("delete-account", {}, 30000);
      console.log("[delete-account] Response:", { data, error });

      if (error) {
        console.error("[delete-account] Edge function error:", error);
        throw new Error(error.message);
      }
      if (data?.error) {
        console.error("[delete-account] Data error:", data.error);
        throw new Error(data.error);
      }
      if (data?.success !== true || (data?.errors && data.errors.length > 0)) {
        console.error("[delete-account] Deletion incomplete:", data?.errors);
        throw new Error(
          "La suppression n'a pas pu être finalisée entièrement. Contacte le support avant de réessayer."
        );
      }

      console.log("[delete-account] Success, tables cleaned:", data?.tables_cleaned);
      if (!mounted.current) return;
      await signOut();
      toast.success("Compte supprimé. À bientôt peut-être 💛");
      window.location.href = "/";
    } catch (e: any) {
      console.error("[delete-account] Fatal error:", e);
      toast.error("Erreur lors de la suppression", {
        description: e?.message || "La suppression a rencontré un problème. Ouvre la console (F12) pour voir le détail.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const planLabel = subInfo?.plan === "binome" ? "Binôme de com" : subInfo?.plan === "outil" ? "Premium" : "Gratuit";

  return (
    <div className="min-h-screen bg-background [--primary:330_50%_20%] [--bordeaux:330_50%_20%] dark:[--primary:338_72%_83%]">
      <AppHeader />
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-8 pb-28 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-rose-pale flex items-center justify-center">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Paramètres</h1>
            <p className="text-sm text-muted-foreground">Gère ton compte et tes préférences.</p>
          </div>
        </div>

        <Tabs defaultValue="account" className="space-y-6">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto w-full gap-1">
            <TabsTrigger value="account">Mon compte</TabsTrigger>
            <TabsTrigger value="connections">Mon espace</TabsTrigger>
            <TabsTrigger value="preferences">Préférences</TabsTrigger>
            <TabsTrigger value="billing">Abonnement</TabsTrigger>
          </TabsList>
          <TabsContent value="account" forceMount className="data-[state=inactive]:hidden"><p className="mb-4 text-sm text-muted-foreground">Ton accès personnel à l’outil, quel que soit l’espace affiché.</p><Button asChild variant="outline" className="mb-4"><Link to="/profil">Modifier mes informations</Link></Button>
        {/* ─── Account info ─── */}
        <Section icon={<Shield className="h-4 w-4" />} title="Mon compte">
          <div>
            <label className="text-xs font-mono-ui text-muted-foreground uppercase tracking-wide">Email</label>
            <p className="text-sm text-foreground mt-1">{user?.email}</p>
          </div>
        </Section>

        {/* ─── Change password ─── */}
        <Section icon={<KeyRound className="h-4 w-4" />} title="Changer de mot de passe">
          <div className="space-y-3">
            <div>
              <label htmlFor="settings-new-password" className="text-sm font-medium mb-1.5 block">Nouveau mot de passe</label>
              <Input id="settings-new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="6 caractères minimum" className="rounded-[10px] h-11" />
            </div>
            <div>
              <label htmlFor="settings-confirm-password" className="text-sm font-medium mb-1.5 block">Confirmer</label>
              <Input id="settings-confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Répète ton nouveau mot de passe" className="rounded-[10px] h-11" />
            </div>
            <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword} className="rounded-full bg-primary text-primary-foreground hover:bg-bordeaux">
              {changingPassword ? "Modification..." : "Mettre à jour"}
            </Button>
          </div>
        </Section>

          </TabsContent>
          <TabsContent value="connections" forceMount className="data-[state=inactive]:hidden"><p className="mb-4 text-sm text-muted-foreground">Espace actuel : <strong>{activeWorkspace?.name || "Mon activité"}</strong>. Les connexions et les membres concernent cet espace.</p>
        {/* ─── Connexions réseaux ─── */}
        <Section icon={<Share2 className="h-4 w-4" />} title="Mes connexions">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connecte tes comptes Instagram, LinkedIn, Pinterest et Canva pour publier et récupérer tes statistiques directement depuis l'app.
            </p>
            <Button asChild className="rounded-full bg-primary text-primary-foreground hover:bg-bordeaux">
              <Link to="/parametres/connexions">Gérer mes connexions</Link>
            </Button>
          </div>
        </Section>

        {/* ─── Membres de l'espace (owner/manager) ─── */}
        <WorkspaceMembersSection />

          </TabsContent>
          <TabsContent value="preferences" forceMount className="data-[state=inactive]:hidden">
        {/* ─── Rendez-vous hebdo ─── */}
        <Section icon={<CalendarHeart className="h-4 w-4" />} title="Mes idées par email">
          {ritual.error && <p role="alert">{ritual.error} <Button variant="link" onClick={ritual.reload}>Réessayer</Button></p>}
          {!ritual.canEdit && <p className="text-sm text-muted-foreground">Ces préférences appartiennent au propriétaire du compte.</p>}
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5"><Mail className="h-4 w-4 text-muted-foreground" /></div>
                <div>
                  <p className="text-sm font-medium text-foreground">Recevoir mes 5 idées de la semaine</p>
                  <p className="text-xs text-muted-foreground">Un email par mois, lors de la première occurrence du jour choisi. Il reprend 5 idées du pool partagé de la semaine, également disponibles dans l’outil. Tu peux le désactiver quand tu veux.</p>
                </div>
              </div>
              <Switch
                checked={ritualEnabled}
                disabled={!ritualLoaded || savingRitual}
                onCheckedChange={(v) => saveRitual({ enabled: v })}
                aria-label="Activer les idées par email"
              />
            </div>
            {ritualEnabled && (
              <div className="flex items-center justify-between gap-4 pl-7">
                <label htmlFor="ritual-day" className="text-sm text-foreground">Le jour de mon rendez-vous</label>
                <Select
                  value={String(ritualDay)}
                  onValueChange={(v) => saveRitual({ day: Number(v) })}
                  disabled={!ritualLoaded || savingRitual}
                >
                  <SelectTrigger id="ritual-day" className="w-40 rounded-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </Section>

        {/* ─── Notification preferences ─── */}
        <Section icon={<Bell className="h-4 w-4" />} title="Préférences de notification">
          <p className="text-xs text-muted-foreground mb-3">Ces choix concernent tes emails personnels, indépendamment de l’espace affiché. Ils ne réactivent pas une désinscription générale.</p>
          {notifications.error && <p role="alert">{notifications.error} <Button variant="link" onClick={notifications.reload}>Réessayer</Button></p>}
          <Link to="/unsubscribe" className="text-sm text-primary underline">Gérer ma désinscription générale des emails</Link>
          <div className="space-y-4">
            <PrefRow icon={<Sparkles className="h-4 w-4 text-muted-foreground" />} label="Conseils & astuces" description="Conseils de prise en main et informations sur ton utilisation." checked={notifications.data.notification_tips} disabled={!notifications.loaded || notifications.saving} onCheckedChange={(v) => { void notifications.save({notification_tips: v}); }} />
            <PrefRow icon={<Bell className="h-4 w-4 text-muted-foreground" />} label="Rappels de routines" description="Relances d’inactivité et rappels de brouillons oubliés." checked={notifications.data.notification_reminders} disabled={!notifications.loaded || notifications.saving} onCheckedChange={(v) => { void notifications.save({notification_reminders: v}); }} />
          </div>
        </Section>

          </TabsContent>
          <TabsContent value="billing" forceMount className="data-[state=inactive]:hidden"><p className="mb-4 text-sm text-muted-foreground">Plan et crédits de l’espace actuel. Le portail de facturation te permet de gérer ton abonnement.</p>
        {/* ─── Subscription ─── */}
        <Section icon={<CreditCard className="h-4 w-4" />} title="Mon abonnement">
          {loadingSub ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">
                  Plan actuel :{" "}
                  <span className="text-primary font-semibold">
                    {subInfo?.source === "promo" && <Gem className="inline h-3.5 w-3.5 mr-1 align-text-bottom" strokeWidth={1.75} />}{planLabel}
                    {subInfo?.source === "promo" && " · Accès beta"}
                  </span>
                </p>
                {subInfo?.source === "promo" && subInfo?.current_period_end && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Expire le {new Date(subInfo.current_period_end).toLocaleDateString("fr-FR")}
                  </p>
                )}
                {subInfo?.source !== "promo" && subInfo?.current_period_end && subInfo.plan !== "free" && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Prochain renouvellement : {new Date(subInfo.current_period_end).toLocaleDateString("fr-FR")}
                  </p>
                )}
                {subInfo?.cancel_at && (
                  <p className="text-xs text-destructive mt-0.5">
                    Annulation prévue le {new Date(subInfo.cancel_at).toLocaleDateString("fr-FR")}
                  </p>
                )}
              </div>

              {/* Actions based on plan */}
              <div className="flex flex-wrap gap-2">
                {subInfo?.plan === "free" && (
                  <>
                    <Button size="sm" className="rounded-full" onClick={handleCheckoutOutil} disabled={portalLoading}>
                      {portalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      <Gem className="h-4 w-4" strokeWidth={1.75} />
                      Passer au plan Premium (39€/mois)
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-full" asChild>
                      <Link to="/binome"><Handshake className="h-4 w-4" strokeWidth={1.75} />Découvrir l'accompagnement</Link>
                    </Button>
                  </>
                )}
                {subInfo?.plan === "outil" && subInfo?.source !== "promo" && (
                  <>
                    <Button size="sm" variant="outline" className="rounded-full" onClick={handleManageSubscription} disabled={portalLoading}>
                      {portalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Gérer mon abonnement
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-full" asChild>
                      <Link to="/binome"><Handshake className="h-4 w-4" strokeWidth={1.75} />Découvrir l'accompagnement</Link>
                    </Button>
                  </>
                )}
                {subInfo?.source === "promo" && (
                  <Button size="sm" className="rounded-full" onClick={handleCheckoutOutil} disabled={portalLoading}>
                    <Gem className="h-4 w-4" strokeWidth={1.75} />
                    S'abonner pour garder l'accès
                  </Button>
                )}
                {subInfo?.plan === "binome" && (
                  <Button size="sm" variant="outline" className="rounded-full" onClick={handleManageSubscription} disabled={portalLoading}>
                    {portalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Gérer mon abonnement
                  </Button>
                )}
              </div>

              <Link to="/pricing" className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.75} /> Voir tous les plans <ArrowRight className="h-3 w-3" />
              </Link>

              {/* Promo code */}
              <div className="pt-3 border-t border-border">
                <PromoCodeInput />
              </div>
            </div>
          )}
        </Section>

        {/* ─── AI Quota ─── */}
        <Section icon={<Sparkles className="h-4 w-4" />} title={`Mes crédits IA · ${new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`}>
          <AiQuotaDisplay />
        </Section>

        {/* ─── Purchases ─── */}
        <Section icon={<ShoppingBag className="h-4 w-4" />} title="Mes achats">
          <PurchaseHistory />
        </Section>

          </TabsContent>
        </Tabs>
        <details className="mt-8 border-t border-border pt-5"><summary className="cursor-pointer font-medium text-primary">Confidentialité, aide et réglages avancés</summary><div className="mt-5">
        {/* ─── Cookies ─── */}
        <Section icon={<Cookie className="h-4 w-4" />} title="Cookies et traceurs">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              On utilise PostHog (hébergé en UE) pour comprendre comment l'outil est utilisé, et le pixel Meta (Facebook/Instagram) pour mesurer l'effet de nos publicités. Tu peux modifier ton choix ici.
            </p>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Statut :</span>
              {cookieConsent === "accepted" ? (
                <Badge variant="success">Accepté</Badge>
              ) : (
                <Badge variant="secondary">Refusé</Badge>
              )}
            </div>
            {cookieConsent === "accepted" ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  localStorage.setItem("cookie_consent", "refused");
                  disablePostHog();
                  disableSentryReplays();
                  disableMetaPixel();
                  setCookieConsent("refused");
                  toast("Consentement révoqué. Les cookies analytics sont désactivés.");
                }}
              >
                Révoquer mon consentement
              </Button>
            ) : (
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => {
                  localStorage.setItem("cookie_consent", "accepted");
                  enablePostHog();
                  enableSentryReplays();
                  enableMetaPixel();
                  setCookieConsent("accepted");
                  toast.success("Cookies analytics activés. Merci !");
                }}
              >
                Accepter les cookies analytics
              </Button>
            )}
            <Link to="/confidentialite" className="block text-primary text-sm font-medium hover:underline">
              Lire notre politique de confidentialité →
            </Link>
            <Link to="/cgu-cgv" className="block text-primary text-sm font-medium hover:underline">
              CGU / CGV →
            </Link>
          </div>
        </Section>

        {/* ─── AI section ─── */}
        <Section icon={<Bot className="h-4 w-4" />} title="Intelligence artificielle">
          <div className="space-y-3 text-sm text-foreground leading-relaxed">
            <p>Cet outil utilise l'IA pour t'aider à structurer et rédiger tes contenus de communication.</p>
            <div>
              <p className="font-semibold mb-1">Ce que l'IA fait :</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                <li>Propose des structures, accroches, scripts et textes</li>
                <li>Analyse ton profil et ton branding pour personnaliser</li>
                <li>Suggère des améliorations et des angles</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-1">Ce que l'IA ne fait pas :</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                <li>Les publications nécessitent une action de ta part</li>
                <li>Ne remplace pas ta voix ni ton expertise</li>
                <li>Tu gardes le choix de conserver ou de modifier les propositions</li>
              </ul>
            </div>
            <p className="text-muted-foreground">Les informations nécessaires à tes demandes sont transmises aux services d’IA utilisés par l’outil. Consulte nos engagements pour connaître le traitement de tes données.</p>
            <Link to="/legal-ia" className="text-primary text-xs font-medium hover:underline">Nos engagements →</Link>
          </div>
        </Section>

        {/* ─── Visite guidée ─── */}
        <Section icon={<Map className="h-4 w-4" />} title="Visite guidée">
          <p className="text-sm text-muted-foreground mb-4">
            Envie de revoir la présentation de l'outil ?
          </p>
          <Button
            variant="outline"
            className="rounded-full text-sm"
            onClick={() => {
              localStorage.removeItem("lac_tour_seen");
              localStorage.removeItem("lac_tour_branding_seen");
              localStorage.removeItem("lac_tour_dashboard_seen");
              localStorage.removeItem("lac_plan_welcomed");
              localStorage.removeItem("lac_dashboard_tour_seen");
              toast.success("🎉 Tour réactivé", { description: "Tu verras la visite guidée à ta prochaine visite du dashboard." });
            }}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Relancer la visite guidée
          </Button>
        </Section>

        {/* ─── Parcours initial ─── */}
        <Section icon={<RotateCcw className="h-4 w-4" />} title="Parcours initial">
          <p className="text-sm text-muted-foreground mb-4">
            Tu peux relancer le parcours d'onboarding pour repartir de zéro. Toutes tes données de branding seront supprimées.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="rounded-full" disabled={resettingOnboarding}>
                {resettingOnboarding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Refaire l'onboarding
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Repartir de zéro{activeWorkspace?.name ? ` sur l'espace « ${activeWorkspace.name} »` : ""} ?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Le branding (storytelling, persona, ton, stratégie, offres, charte) de l'espace
                  {activeWorkspace?.name ? ` « ${activeWorkspace.name} »` : " actif"} sera supprimé et tu repasseras par l'onboarding pour CET espace uniquement. Tes autres espaces, ton compte et tes contenus générés sont conservés.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Annuler</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-full"
                  disabled={resettingOnboarding}
                  onClick={async () => {
                    if (!user) return;
                    // Le reset DOIT être scopé à l'espace actif : supprimer par
                    // user_id effacerait le branding de TOUS les espaces (dont
                    // ceux des clientes pour un compte agence). Sans espace actif
                    // identifié, on refuse plutôt que de risquer un effacement large.
                    if (!activeWorkspace?.id) {
                      toast.error("Espace introuvable", { description: "Recharge la page puis réessaie." });
                      return;
                    }
                    setResettingOnboarding(true);
                    try {
                      const sessionData = await supabase.auth.getSession();
                      const token = sessionData.data.session?.access_token;
                      const res = await invokeWithTimeout("reset-onboarding", {
                        headers: { Authorization: `Bearer ${token}` },
                        body: { workspaceId: activeWorkspace.id },
                      }, 30000);

                      if (res.error) throw res.error;
                      if (res.data?.error) throw new Error(res.data.error);
                      if (res.data?.success !== true || res.data?.errors?.length) throw new Error("Réinitialisation incomplète. Certaines données ont pu être effacées ; réessaie pour terminer.");
                      if (!mounted.current) return;

                      // Clear all localStorage
                      localStorage.removeItem("lac_onboarding_step");
                      localStorage.removeItem("lac_onboarding_answers");
                      localStorage.removeItem("lac_onboarding_branding");
                      localStorage.removeItem("lac_onboarding_ts");
                      localStorage.removeItem("branding_skip_import");
                      localStorage.removeItem("lac_onboarding_reset");
                      localStorage.removeItem("lac_welcome_seen");
                      localStorage.removeItem("lac_dashboard_tour_seen");
                      localStorage.removeItem("lac_missions_collapsed");
                      localStorage.removeItem("lac_missions_first_seen");
                      localStorage.removeItem("lac_missions_dismissed");
                      localStorage.removeItem("lac_branding_cache_refreshed");
                      localStorage.removeItem("lac_plan_welcomed");
                      localStorage.removeItem("lac_plan_tour_seen");

                      toast.success("✅ Reset effectué", {
                        description: "Tu vas être redirigée vers l'onboarding.",
                      });

                      // Hard redirect to clear all React state
                      setTimeout(() => {
                        if (mounted.current) window.location.href = "/onboarding";
                      }, 500);
                    } catch (e: any) {
                      console.error("[reset-onboarding] Error:", e);
                      toast.error("Erreur lors de la réinitialisation", {
                        description: e?.message || "Réessaie ou contacte le support.",
                      });
                    } finally {
                      setResettingOnboarding(false);
                    }
                  }}
                >
                  Oui, repartir de zéro
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>

        {/* ─── Danger zone ─── */}
        <div className="mt-8 rounded-2xl border-2 border-destructive/20 bg-card p-6">
          <h2 className="font-display text-lg font-bold text-destructive mb-2 flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Zone dangereuse
          </h2>
          <p className="text-sm text-muted-foreground mb-4">La suppression de ton compte est irréversible. Toutes tes données seront effacées.</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="rounded-full">Supprimer mon compte</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tu es sûre ?</AlertDialogTitle>
                <AlertDialogDescription>Toutes tes données seront définitivement supprimées : profil, branding, contenus, calendrier, audits, statistiques, coaching... Cette action est irréversible.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAccount} disabled={deleting} className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? "Suppression..." : "Oui, supprimer mon compte"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* ─── Feature flags (admin only) ─── */}
        {isAdmin && (
          <Section icon={<Shield className="h-5 w-5" />} title="Feature flags (admin)">
            <p className="text-sm text-muted-foreground mb-4">
              Modules masqués pour les utilisateur·ices. Active-les quand ils sont prêts.
            </p>
            <div className="space-y-2">
              {MODULE_FLAGS.map(flag => (
                <div key={flag.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{flag.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Routes : {flag.routes.join(", ")}
                    </p>
                  </div>
                  <Switch
                    checked={flag.enabled}
                    disabled
                    aria-label={`Toggle ${flag.label}`}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground italic mt-3">
              Pour activer un module : modifier <code className="bg-muted px-1 rounded">enabled</code> dans <code className="bg-muted px-1 rounded">src/config/feature-flags.ts</code> et redéployer.
            </p>
          </Section>
        )}
        </div></details>
      </main>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-6 mb-4">
      <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">{icon} {title}</h2>
      {children}
    </div>
  );
}

function PrefRow({ icon, label, description, checked, onCheckedChange, disabled }: { icon: React.ReactNode; label: string; description: string; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

// Jours ISO 8601 : 1 = lundi … 7 = dimanche (aligné sur l'edge function email-trigger)
const WEEKDAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 7, label: "Dimanche" },
];

const QUOTA_CATEGORIES: { key: string; icon: LucideIcon; label: string }[] = [
  { key: "content", icon: FileText, label: "Contenus" },
  { key: "audit", icon: Search, label: "Audits" },
  { key: "dm_comment", icon: Mail, label: "DM / Commentaires" },
  { key: "bio_profile", icon: User, label: "Bio / Profil" },
  { key: "suggestion", icon: Lightbulb, label: "Suggestions" },
  { key: "import", icon: FileUp, label: "Imports" },
  { key: "adaptation", icon: RefreshCw, label: "Adaptations" },
];

function AiQuotaDisplay() {
  const { plan, usage, isPaid } = useUserPlan();
  const planLabel = plan === "binome" ? "Binôme de com (290€/mois)" : plan === "outil" ? "Premium (39€/mois)" : "Gratuit";
  const total = usage.total;
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Plan : <span className="text-primary font-semibold">{planLabel}</span></p>
      <div className="space-y-3">
        {QUOTA_CATEGORIES.map(({ key, icon: Icon, label }) => {
          const cat = usage[key];
          if (!cat || cat.limit === 0) return null;
          const pct = Math.round((cat.used / cat.limit) * 100);
          return (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1.5"><Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />{label}</span>
                <span className="text-muted-foreground">{cat.used}/{cat.limit} <span className="text-xs">({pct}%)</span></span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>
          );
        })}
      </div>
      {total && (
        <div className="pt-2 border-t border-border flex justify-between text-sm font-medium">
          <span>Total</span>
          <span>{total.used}/{total.limit}</span>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Renouvellement : {nextMonth.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
      {!isPaid && (
        <Link to="/pricing" className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline">
          Voir les plans pour plus de crédits <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
