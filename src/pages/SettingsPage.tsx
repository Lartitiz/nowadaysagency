import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Settings, KeyRound, Trash2, Bell, Mail, Sparkles, Shield, Bot, CreditCard, Loader2, ShoppingBag, Gift, ArrowRight, Cookie, RotateCcw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { enablePostHog, disablePostHog } from "@/lib/posthog";
import { enableSentryReplays, disableSentryReplays } from "@/lib/sentry";
import { STRIPE_PLANS } from "@/lib/stripe-config";
import { useUserPlan } from "@/hooks/use-user-plan";
import PurchaseHistory from "@/components/settings/PurchaseHistory";
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
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { plan, isPaid, isStudio, refresh: refreshPlan } = useUserPlan();

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification preferences
  const [notifEmail, setNotifEmail] = useState(() => localStorage.getItem("pref_notif_email") !== "false");
  const [notifTips, setNotifTips] = useState(() => localStorage.getItem("pref_notif_tips") !== "false");
  const [notifReminders, setNotifReminders] = useState(() => localStorage.getItem("pref_notif_reminders") !== "false");

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
  }, []);

  const loadSubscription = async () => {
    setLoadingSub(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (!error && data) setSubInfo(data);
    } catch (e) {
      console.error("Settings error:", e);
      toast({ title: "Erreur", description: "Une erreur est survenue. Réessaie.", variant: "destructive" });
    }
    setLoadingSub(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Mot de passe trop court", description: "6 caractères minimum.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      console.error("Erreur technique:", error);
      toast({ title: "Erreur", description: friendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Mot de passe mis à jour ✓" });
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const togglePref = (key: string, value: boolean, setter: (v: boolean) => void) => {
    localStorage.setItem(key, String(value));
    setter(value);
    toast({ title: "Préférence enregistrée ✓" });
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch {
      toast({ title: "Erreur", description: "Impossible d'ouvrir le portail.", variant: "destructive" });
    }
    setPortalLoading(false);
  };

  const handleCheckoutOutil = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: STRIPE_PLANS.outil.priceId, mode: "subscription" },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch {
      toast({ title: "Erreur", description: "Impossible d'ouvrir le paiement.", variant: "destructive" });
    }
    setPortalLoading(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await signOut();
      toast({ title: "Compte supprimé. À bientôt peut-être 💛" });
      window.location.href = "/";
    } catch (e) {
      console.error("Delete account error:", e);
      toast({
        title: "Erreur lors de la suppression",
        description: "La suppression a rencontré un problème. Contacte laetitia@nowadaysagency.com pour qu'on règle ça.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const planLabel = subInfo?.plan === "now_pilot" ? "Binôme de com" : subInfo?.plan === "studio" ? "Binôme de com" : subInfo?.plan === "outil" ? "Premium" : "Gratuit";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-rose-pale flex items-center justify-center">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Paramètres</h1>
            <p className="text-sm text-muted-foreground">Gère ton compte et tes préférences.</p>
          </div>
        </div>

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
                    {subInfo?.source === "promo" ? "💎 " : ""}{planLabel}
                    {subInfo?.source === "promo" && " · Accès beta"}
                  </span>
                </p>
                {subInfo?.source === "promo" && subInfo?.current_period_end && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    🎁 Expire le {new Date(subInfo.current_period_end).toLocaleDateString("fr-FR")}
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
                      💎 Passer au plan Premium (39€/mois)
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-full" asChild>
                      <Link to="/studio/discover">🤝 Découvrir l'accompagnement</Link>
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
                      <Link to="/studio/discover">🤝 Découvrir l'accompagnement</Link>
                    </Button>
                  </>
                )}
                {subInfo?.source === "promo" && (
                  <Button size="sm" className="rounded-full" onClick={handleCheckoutOutil} disabled={portalLoading}>
                    💎 S'abonner pour garder l'accès
                  </Button>
                )}
                {subInfo?.plan === "studio" && (
                  <Button size="sm" variant="outline" className="rounded-full" onClick={handleManageSubscription} disabled={portalLoading}>
                    {portalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Gérer mon abonnement
                  </Button>
                )}
              </div>

              <Link to="/pricing" className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                📋 Voir tous les plans <ArrowRight className="h-3 w-3" />
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
              <label className="text-sm font-medium mb-1.5 block">Nouveau mot de passe</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="6 caractères minimum" className="rounded-[10px] h-11" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Confirmer</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Répète ton nouveau mot de passe" className="rounded-[10px] h-11" />
            </div>
            <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword} className="rounded-full bg-primary text-primary-foreground hover:bg-bordeaux">
              {changingPassword ? "Modification..." : "Mettre à jour"}
            </Button>
          </div>
        </Section>

        {/* ─── Notification preferences ─── */}
        <Section icon={<Bell className="h-4 w-4" />} title="Préférences de notification">
          <div className="space-y-4">
            <PrefRow icon={<Mail className="h-4 w-4 text-muted-foreground" />} label="Emails de suivi" description="Reçois un récap hebdomadaire de ta progression." checked={notifEmail} onCheckedChange={(v) => togglePref("pref_notif_email", v, setNotifEmail)} />
            <PrefRow icon={<Sparkles className="h-4 w-4 text-muted-foreground" />} label="Conseils & astuces" description="Reçois des conseils com' personnalisés par email." checked={notifTips} onCheckedChange={(v) => togglePref("pref_notif_tips", v, setNotifTips)} />
            <PrefRow icon={<Bell className="h-4 w-4 text-muted-foreground" />} label="Rappels de routines" description="Un petit rappel quand tu oublies tes routines." checked={notifReminders} onCheckedChange={(v) => togglePref("pref_notif_reminders", v, setNotifReminders)} />
          </div>
        </Section>

        {/* ─── Cookies ─── */}
        <Section icon={<Cookie className="h-4 w-4" />} title="Cookies et traceurs">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              On utilise PostHog (hébergé en UE) pour comprendre comment l'outil est utilisé. Aucune donnée publicitaire. Tu peux modifier ton choix ici.
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
                  setCookieConsent("refused");
                  toast({ title: "Consentement révoqué. Les cookies analytics sont désactivés." });
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
                  setCookieConsent("accepted");
                  toast({ title: "Cookies analytics activés. Merci !" });
                }}
              >
                Accepter les cookies analytics
              </Button>
            )}
            <Link to="/confidentialite" className="block text-primary text-sm font-medium hover:underline">
              Lire notre politique de confidentialité →
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
                <li>Ne publie rien à ta place</li>
                <li>Ne remplace pas ta voix ni ton expertise</li>
                <li>Ne stocke pas tes données hors de l'app</li>
              </ul>
            </div>
            <p className="text-muted-foreground">Tes données sont utilisées uniquement pour personnaliser les générations dans l'app. Elles ne sont pas partagées avec des tiers.</p>
            <Link to="/legal-ia" className="text-primary text-xs font-medium hover:underline">Nos engagements →</Link>
          </div>
        </Section>

        {/* ─── Refaire l'onboarding ─── */}
        <Section icon={<RotateCcw className="h-4 w-4" />} title="Parcours initial">
          <p className="text-sm text-muted-foreground mb-4">
            Tu peux relancer le parcours d'onboarding pour mettre à jour ton profil, ton activité et tes objectifs. Tes données de branding existantes ne seront pas supprimées.
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
                <AlertDialogTitle>Relancer le parcours initial ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tu vas repasser par les étapes d'onboarding pour mettre à jour ton profil. Tes contenus et ton branding existants seront conservés.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Annuler</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-full"
                  disabled={resettingOnboarding}
                  onClick={async () => {
                    if (!user) return;
                    setResettingOnboarding(true);
                    try {
                      await Promise.all([
                        supabase.from("profiles").update({ onboarding_completed: false, onboarding_step: 0 }).eq("user_id", user.id),
                        supabase.from("user_plan_config").update({ onboarding_completed: false }).eq("user_id", user.id),
                      ]);
                      localStorage.removeItem("lac_onboarding_step");
                      localStorage.removeItem("lac_onboarding_answers");
                      localStorage.removeItem("lac_onboarding_branding");
                      localStorage.removeItem("lac_onboarding_ts");
                      navigate("/onboarding", { replace: true });
                    } catch (e) {
                      console.error("Reset onboarding error:", e);
                      toast({ title: "Erreur", description: "Impossible de relancer l'onboarding.", variant: "destructive" });
                    } finally {
                      setResettingOnboarding(false);
                    }
                  }}
                >
                  Oui, relancer
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

function PrefRow({ icon, label, description, checked, onCheckedChange }: { icon: React.ReactNode; label: string; description: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

const QUOTA_CATEGORIES = [
  { key: "content", emoji: "📝", label: "Contenus" },
  { key: "audit", emoji: "🔍", label: "Audits" },
  { key: "dm_comment", emoji: "📩", label: "DM / Commentaires" },
  { key: "bio_profile", emoji: "👤", label: "Bio / Profil" },
  { key: "suggestion", emoji: "💡", label: "Suggestions" },
  { key: "import", emoji: "📄", label: "Imports" },
  { key: "adaptation", emoji: "🔄", label: "Adaptations" },
];

function AiQuotaDisplay() {
  const { plan, usage, isPaid } = useUserPlan();
  const planLabel = plan === "now_pilot" ? "Binôme de com (250€/mois)" : plan === "studio" ? "Binôme de com (250€/mois)" : plan === "outil" ? "Premium (39€/mois)" : "Gratuit";
  const total = usage.total;
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Plan : <span className="text-primary font-semibold">{planLabel}</span></p>
      <div className="space-y-3">
        {QUOTA_CATEGORIES.map(({ key, emoji, label }) => {
          const cat = usage[key];
          if (!cat || cat.limit === 0) return null;
          const pct = Math.round((cat.used / cat.limit) * 100);
          return (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{emoji} {label}</span>
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
          ⬆️ Voir les plans pour plus de crédits <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
