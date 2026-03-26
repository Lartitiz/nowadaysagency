import { useState } from "react";
import { usePageSEO } from "@/hooks/use-page-seo";
import { useAuth } from "@/contexts/AuthContext";
import { Link, Navigate } from "react-router-dom";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { useUserPlan } from "@/hooks/use-user-plan";
import { STRIPE_PLANS } from "@/lib/stripe-config";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Check, X, Sparkles, ArrowRight } from "lucide-react";
import PromoCodeInput from "@/components/PromoCodeInput";

/* ─── Feature comparison data ─── */
const SECTIONS = [
  {
    title: "Fondations",
    rows: [
      { label: "Branding guidé", free: true, outil: true, studio: true },
      { label: "Définir sa cible", free: true, outil: true, studio: true },
      { label: "Mon histoire", free: true, outil: true, studio: true },
      { label: "Positionnement offre", free: true, outil: true, studio: true },
    ],
  },
  {
    title: "Création de contenu",
    rows: [
      { label: "Contenus IA par mois", free: "30/mois", outil: "Illimités", studio: "Illimités" },
      { label: "Posts Instagram", free: true, outil: true, studio: true },
      { label: "Reels", free: true, outil: true, studio: true },
      { label: "Stories", free: true, outil: true, studio: true },
      { label: "Bio Instagram", free: true, outil: true, studio: true },
      { label: "Commentaires stratégiques", free: true, outil: true, studio: true },
      { label: "DM personnalisés", free: true, outil: true, studio: true },
    ],
  },
  {
    title: "Analyse & suivi",
    rows: [
      { label: "Audits IA par mois", free: "30/mois", outil: "Illimités", studio: "Illimités" },
      { label: "Audit LinkedIn", free: true, outil: true, studio: true },
      { label: "Suivi de tes statistiques", free: true, outil: true, studio: true },
      { label: "Tableau de bord performances", free: true, outil: true, studio: true },
    ],
  },
  {
    title: "Engagement & prospection",
    rows: [
      { label: "Gestion de tes contacts clés", free: true, outil: true, studio: true },
      { label: "Routine d'engagement quotidienne", free: true, outil: true, studio: true },
      { label: "Suivi de tes prospects", free: true, outil: true, studio: true },
    ],
  },
  {
    title: "Communauté",
    rows: [
      { label: "Accès à la communauté (lecture)", free: true, outil: true, studio: true },
      { label: "Participer à la communauté", free: false, outil: true, studio: true },
      { label: "Lives mensuels avec Laetitia", free: false, outil: true, studio: true },
    ],
  },
  {
    title: "Accompagnement Binôme exclusif",
    rows: [
      { label: "Sessions visio individuelles", free: false, outil: false, studio: "6 × 2h" },
      { label: "Support WhatsApp jours ouvrés", free: false, outil: false, studio: true },
      { label: "Plan de com' sur mesure (mois 1-2)", free: false, outil: false, studio: true },
      { label: "Validation livrables par Laetitia", free: false, outil: false, studio: true },
      { label: "Espace accompagnement dédié", free: false, outil: false, studio: true },
    ],
  },
];

const FAQ = [
  {
    q: "Pourquoi tout l'outil est gratuit ?",
    a: "L'outil est entièrement accessible en gratuit : tu peux créer jusqu'à 60 contenus IA par mois et lancer 3 audits. Quand tu voudras produire sans limite et rejoindre la communauté, le Premium sera là.",
  },
  {
    q: "Je peux annuler quand je veux ?",
    a: "Oui, le plan Premium est sans engagement. Tu annules en 1 clic depuis ton espace. L'accompagnement binôme est un engagement de 6 mois.",
  },
  {
    q: "Je peux upgrader en cours de route ?",
    a: "Oui ! Tu peux passer du gratuit au Premium, ou du Premium à l'accompagnement binôme à tout moment.",
  },
  {
    q: "Il y a une garantie ?",
    a: "L'accompagnement binôme est satisfait ou remboursé si tu appliques tout et que tu n'as pas de résultats.",
  },
  {
    q: "C'est quoi la différence entre le Premium et l'accompagnement binôme ?",
    a: "Le Premium, c'est l'IA en illimité pour créer tes contenus en autonomie. L'accompagnement binôme, c'est le Premium + Laetitia qui te coache, construit ta stratégie, te débloque, et valide chaque étape.",
  },
  {
    q: "Mes données sont sécurisées ?",
    a: "Oui, hébergées en Europe, chiffrées, jamais revendues.",
  },
];
/* ─── Cell renderer ─── */
function CellValue({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="h-4 w-4 text-primary mx-auto" />;
  if (value === false) return <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />;
  return <span className="text-sm font-medium text-foreground">{value}</span>;
}

/* ─── Main page ─── */
export default function PricingPage() {
  const { user } = useAuth();
  const { plan, loading: planLoading } = useUserPlan();
  const { toast } = useToast();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  usePageSEO({
    title: "Tarifs — Gratuit, Premium ou Binôme",
    description: "Découvre les formules de l'Assistant Com'. Gratuit pour démarrer, Premium à 39€/mois pour l'IA illimitée, Binôme à 250€/mois avec coaching humain.",
    canonical: "/pricing",
  });
  

  const handleCheckout = async () => {
    if (!user) {
      window.location.href = "/login?redirect=/pricing";
      return;
    }
    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId: STRIPE_PLANS.outil.priceId,
          mode: "subscription",
        },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const isCurrentPlan = (p: string) => plan === p;

  return (
    <div className="min-h-screen bg-background">
      {user ? <AppHeader /> : (
        <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
          <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
            <Link to="/" className="font-display text-xl font-bold text-primary tracking-tight">Nowadays</Link>
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Se connecter</Link>
              <Link to="/login" className="rounded-full bg-primary text-primary-foreground px-6 py-2 text-sm font-medium shadow-cta hover:opacity-90 transition-all">
                Commencer
              </Link>
            </div>
          </nav>
        </header>
      )}

      {/* Bandeau béta */}
      <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 text-center">
        <p className="text-sm text-foreground">
          🧪 <strong>Béta en cours</strong> : tu testes l'outil gratuitement avec 60 contenus IA par mois.
          Les abonnements premium ouvriront après la béta.
        </p>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        {/* ── Header ── */}
        <div className="text-center mb-12">
          <h1 className="font-display text-[28px] sm:text-[40px] font-bold text-foreground leading-tight">
            Un plan pour chaque étape
            <br />
            de ton projet
          </h1>
          <p className="mt-3 text-muted-foreground text-base sm:text-lg max-w-lg mx-auto">
            Commence gratuitement. Upgrade quand tu es prête.
          </p>

        </div>

        {/* ── 3 Plan Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
          {/* Free */}
          <div className="rounded-2xl bg-card border border-border p-6 flex flex-col">
            <span className="text-2xl mb-2">🆓</span>
            <h3 className="font-display text-xl font-bold">Gratuit</h3>
            <p className="text-xs text-muted-foreground font-medium mt-1">Tout l'outil. Pour de vrai.</p>
            <p className="text-3xl font-bold mt-2">
              0€
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Explore tout l'écosystème Nowadays : branding, calendrier, audits, espaces canaux. 60 contenus IA par mois pour commencer à structurer ta com'.
            </p>
            <ul className="space-y-2 text-sm text-foreground mb-6 flex-1">
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Branding guidé complet (6 sections)</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Calendrier éditorial avec vue mensuelle</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Crée jusqu'à 60 contenus IA par mois</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> 3 audits IA par mois (Instagram, site, LinkedIn)</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Espaces par canal (Instagram, LinkedIn, Pinterest…)</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Mini-CRM et contacts stratégiques</li>
            </ul>
            {isCurrentPlan("free") ? (
              <div className="text-center rounded-pill border-2 border-primary py-2.5 font-medium text-primary text-sm">
                Ton plan actuel
              </div>
            ) : !user ? (
              <Link
                to="/login?redirect=/pricing"
                className="block text-center rounded-pill border border-border py-2.5 font-medium text-foreground hover:bg-secondary transition-colors text-sm"
              >
                Commencer gratuitement
              </Link>
            ) : null}
          </div>

          {/* Premium */}
          <div className="rounded-2xl bg-card border-2 border-primary p-6 flex flex-col relative shadow-card-hover">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-pill">
              Populaire
            </div>
            <span className="text-2xl mb-2">💎</span>
            <h3 className="font-display text-xl font-bold">Premium</h3>
            <p className="text-xs text-muted-foreground font-medium mt-1">Crée sans compter. L'IA qui connaît ta voix.</p>
            <p className="text-3xl font-bold mt-2 text-primary">
              39€
              <span className="text-base font-normal text-muted-foreground">
                /mois
              </span>
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Contenus IA illimités, audits illimités, communauté active. Pour celleux qui veulent publier régulièrement sans se poser la question des limites.
            </p>
            <p className="text-xs text-muted-foreground mb-2 pb-2 border-b border-border">
              Tout le plan gratuit, plus :
            </p>
            <ul className="space-y-2 text-sm text-foreground mb-6 flex-1">
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Contenus IA illimités (posts, reels, stories, newsletters…)</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Audits IA illimités</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Communauté active : poste, commente, échange</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Lives mensuels avec Laetitia + replays</li>
            </ul>
            {isCurrentPlan("outil") ? (
              <div className="text-center rounded-pill border-2 border-primary py-2.5 font-medium text-primary text-sm">
                Ton plan actuel
              </div>
            ) : (
              <Button
                onClick={handleCheckout}
                disabled={checkoutLoading}
                className="w-full rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux shadow-cta h-11"
              >
                {checkoutLoading ? "Un instant..." : "S'abonner"}
              </Button>
            )}
          </div>

          {/* Binôme */}
          <div className="rounded-2xl bg-card border border-border p-6 flex flex-col" style={{ background: "linear-gradient(180deg, hsl(48 100% 95%) 0%, hsl(0 0% 100%) 40%)" }}>
            <span className="text-2xl mb-2">🤝</span>
            <h3 className="font-display text-xl font-bold">Ta binôme de com</h3>
            <p className="text-xs text-muted-foreground font-medium mt-1">On fait ensemble. Tu n'es plus seul·e face à ta com'.</p>
            <p className="text-3xl font-bold mt-2 text-primary">
              250€
              <span className="text-base font-normal text-muted-foreground">
                /mois × 6
              </span>
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              L'outil Premium + Laetitia à tes côtés pendant 6 mois. Stratégie sur mesure, sessions visio, support WhatsApp, validation de chaque livrable.
            </p>
            <p className="text-xs text-muted-foreground mb-2 pb-2 border-b border-border">
              Tout le plan Premium, plus :
            </p>
            <ul className="space-y-2 text-sm text-foreground mb-6 flex-1">
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> 6 sessions visio individuelles de 2h</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Support WhatsApp jours ouvrés (réponse 24-48h)</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Plan de com' sur mesure les 2 premiers mois</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Validation de tes livrables par Laetitia</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Espace accompagnement dédié dans l'outil</li>
            </ul>
            {isCurrentPlan("binome") ? (
              <div className="text-center rounded-pill border-2 border-primary py-2.5 font-medium text-primary text-sm">
                Ton plan actuel
              </div>
            ) : (
              <a
                href="https://calendly.com/laetitia-mattioli/appel-decouverte"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center rounded-pill border border-border py-2.5 font-medium text-foreground hover:bg-secondary transition-colors text-sm"
              >
                Réserver un appel
              </a>
            )}
          </div>
        </div>

        {/* ── Ethical note ── */}
        <p className="text-sm text-muted-foreground italic text-center max-w-md mx-auto py-6">
          Pas de période d'essai qui se transforme en prélèvement surprise. Pas d'engagement caché. Tu peux arrêter quand tu veux, en un clic.
        </p>

        {/* ── Feature Comparison Table ── */}
        <div className="mb-16">
          <h2 className="font-display text-2xl font-bold text-center mb-8">
            Comparatif détaillé
          </h2>
          <p className="text-xs text-muted-foreground text-center sm:hidden mb-2">👉 Fais défiler pour voir toutes les colonnes</p>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-sm font-medium text-muted-foreground py-3 pr-4 w-[45%]" />
                  <th className="text-center text-sm font-bold text-foreground py-3 w-[18%]">
                    🆓 Gratuit
                  </th>
                  <th className="text-center text-sm font-bold text-primary py-3 w-[18%]">
                    💎 Premium
                  </th>
                  <th className="text-center text-sm font-bold text-foreground py-3 w-[18%]">
                    🤝 Binôme
                  </th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((section) => (
                  <>
                    <tr key={section.title}>
                      <td
                        colSpan={4}
                        className="pt-6 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {section.title}
                      </td>
                    </tr>
                    {section.rows.map((row) => (
                      <tr
                        key={row.label}
                        className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
                      >
                        <td className="py-3 pr-4 text-sm text-foreground">
                          {row.label}
                        </td>
                        <td className="py-3 text-center">
                          <CellValue value={row.free} />
                        </td>
                        <td className="py-3 text-center bg-primary/[0.03]">
                          <CellValue value={row.outil} />
                        </td>
                        <td className="py-3 text-center">
                          <CellValue value={row.studio} />
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── FAQ ── */}
        <div className="max-w-2xl mx-auto mb-16">
          <h2 className="font-display text-2xl font-bold text-center mb-8">
            Questions fréquentes
          </h2>
          <Accordion type="single" collapsible className="space-y-3">
            {FAQ.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="rounded-2xl border border-border bg-card px-5"
              >
                <AccordionTrigger className="text-left text-sm font-semibold text-foreground hover:no-underline py-4">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* ── Promo Code ── */}
        {user && (
          <div className="max-w-md mx-auto mb-16">
            <PromoCodeInput />
          </div>
        )}

        {/* ── Final CTA ── */}
        <div className="text-center rounded-2xl border border-border bg-card p-8 sm:p-12">
          <h2 className="font-display text-xl sm:text-2xl font-bold mb-3">
            Toujours pas sûre ?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Commence gratuitement. Tu verras par toi-même si l'outil te
            convient. Pas de carte bancaire requise.
          </p>
          {user ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-pill bg-primary text-primary-foreground px-8 py-3 font-medium shadow-cta hover:bg-bordeaux transition-all hover:-translate-y-0.5"
            >
              <Sparkles className="h-4 w-4" /> Aller au dashboard
            </Link>
          ) : (
            <Link
              to="/login?redirect=/pricing"
              className="inline-flex items-center gap-2 rounded-pill bg-primary text-primary-foreground px-8 py-3 font-medium shadow-cta hover:bg-bordeaux transition-all hover:-translate-y-0.5"
            >
              <Sparkles className="h-4 w-4" /> Commencer gratuitement
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
