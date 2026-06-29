import { useState } from "react";
import { usePageSEO } from "@/hooks/use-page-seo";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { toast } from "sonner";
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
import { Check, X, Sparkles } from "lucide-react";
import PromoCodeInput from "@/components/PromoCodeInput";

/* ─── Feature comparison data (2 plans : Gratuit / Premium) ─── */
const SECTIONS = [
  {
    title: "Fondations",
    rows: [
      { label: "Branding guidé (6 sections)", free: true, premium: true },
      { label: "Cible & persona", free: true, premium: true },
      { label: "Mon histoire", free: true, premium: true },
      { label: "Calendrier éditorial", free: true, premium: true },
      { label: "Ligne éditoriale", free: false, premium: true },
      { label: "Atelier de l'offre", free: false, premium: true },
    ],
  },
  {
    title: "Création de contenu",
    rows: [
      { label: "Posts, reels, stories, bio", free: true, premium: true },
      { label: "Volume de création IA", free: "Pour démarrer", premium: "Illimité" },
      { label: "Carrousels qualité max", free: false, premium: true },
      { label: "Commentaires stratégiques", free: false, premium: true },
      { label: "DM personnalisés", free: false, premium: true },
    ],
  },
  {
    title: "Publication & automatisation",
    rows: [
      { label: "Publication directe sur tes réseaux", free: false, premium: true },
      { label: "Programmation automatique", free: false, premium: true },
      { label: "Multi-réseaux en 1 clic", free: false, premium: true },
    ],
  },
  {
    title: "Analyse & suivi",
    rows: [
      { label: "Audits IA (Instagram, site, LinkedIn)", free: "Limités", premium: "Illimités" },
      { label: "Suivi de tes statistiques", free: false, premium: true },
    ],
  },
];

const FAQ = [
  {
    q: "Qu'est-ce que je peux faire gratuitement ?",
    a: "Tout pour démarrer : poser tes fondations (branding, cible, histoire), organiser ton calendrier éditorial, créer tes premiers contenus avec l'IA et lancer des audits pour te situer. Quand tu voudras publier régulièrement et automatiquement, le Premium prend le relais.",
  },
  {
    q: "C'est quoi la différence entre le gratuit et le Premium ?",
    a: "Le gratuit te fait publier ton premier contenu. Le Premium te fait publier régulièrement sans y penser : création de contenu illimitée, carrousels qualité max, publication directe et programmation automatique sur tous tes réseaux, audits illimités.",
  },
  {
    q: "Je peux annuler quand je veux ?",
    a: "Oui, le Premium est sans engagement. Tu annules en 1 clic depuis ton espace, à tout moment.",
  },
  {
    q: "Je peux passer au Premium en cours de route ?",
    a: "Oui ! Tu démarres en gratuit, et tu passes au Premium quand tu es prête. Tu ne perds rien de ce que tu as créé.",
  },
  {
    q: "Et si je veux être accompagnée par un humain ?",
    a: "Le Binôme de com' existe pour ça : Laetitia à tes côtés pendant 6 mois pour construire ta stratégie, te débloquer et valider chaque étape. C'est un accompagnement à part, en plus de l'outil — réserve un appel découverte pour voir si c'est fait pour toi.",
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
  const { plan } = useUserPlan();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  usePageSEO({
    title: "Tarifs — Gratuit ou Premium",
    description: "Découvre les formules de l'Assistant Com'. Gratuit pour poser tes bases et publier tes premiers contenus, Premium à 39€/mois pour publier régulièrement et automatiquement.",
    canonical: "/pricing",
  });

  const handleCheckout = async () => {
    if (!user) {
      window.location.href = "/login?redirect=/pricing";
      return;
    }
    setCheckoutLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("create-checkout", {
        body: {
          priceId: STRIPE_PLANS.outil.priceId,
          mode: "subscription",
        },
      }, 15000);
      if (error) throw new Error(error.message);
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error("Erreur", { description: friendlyError(e) });
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
          🧪 <strong>Béta en cours</strong> : tu testes l'outil gratuitement.
          Les abonnements premium ouvriront après la béta.
        </p>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        {/* ── Header ── */}
        <div className="text-center mb-12">
          <h1 className="font-display text-3xl sm:text-5xl font-bold text-foreground leading-tight">
            Un plan pour démarrer,
            <br />
            un pour ne plus t'arrêter
          </h1>
          <p className="mt-3 text-muted-foreground text-base sm:text-lg max-w-lg mx-auto">
            Commence gratuitement. Passe au Premium quand tu veux publier sans y penser.
          </p>
        </div>

        {/* ── 2 Plan Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto mb-12">
          {/* Free */}
          <div className="rounded-2xl bg-card border border-border p-6 flex flex-col">
            <span className="text-2xl mb-2">🌱</span>
            <h3 className="font-display text-xl font-bold">Gratuit</h3>
            <p className="text-xs text-muted-foreground font-medium mt-1">Pour poser tes bases et publier ton premier contenu</p>
            <p className="text-3xl font-bold mt-2">0€</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Découvre tout l'écosystème et crée tes premiers contenus, dans ta voix.
            </p>
            <ul className="space-y-2 text-sm text-foreground mb-6 flex-1">
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Fondations complètes : branding, cible, histoire</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Calendrier éditorial</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Création de contenu IA pour démarrer</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Audits IA pour te situer (Instagram, site, LinkedIn)</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Espaces par canal (Instagram, LinkedIn, Pinterest…)</li>
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
            <span className="text-2xl mb-2">🚀</span>
            <h3 className="font-display text-xl font-bold">Premium</h3>
            <p className="text-xs text-muted-foreground font-medium mt-1">Pour publier régulièrement, sans y penser</p>
            <p className="text-3xl font-bold mt-2 text-primary">
              39€
              <span className="text-base font-normal text-muted-foreground">/mois</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              L'outil complet qui transforme tes intentions en publications régulières.
            </p>
            <p className="text-xs text-muted-foreground mb-2 pb-2 border-b border-border">
              Tout le plan gratuit, plus :
            </p>
            <ul className="space-y-2 text-sm text-foreground mb-6 flex-1">
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Création de contenu illimitée, sans compter</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Carrousels qualité max</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Publication directe + programmation automatique</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Multi-réseaux en 1 clic + ouverture dans Canva</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Audits illimités</li>
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
        </div>

        {/* ── Ethical note ── */}
        <p className="text-sm text-muted-foreground italic text-center max-w-md mx-auto pb-10">
          Pas de période d'essai qui se transforme en prélèvement surprise. Pas d'engagement caché. Tu peux arrêter quand tu veux, en un clic.
        </p>

        {/* ── Binôme upsell band ── */}
        <div className="rounded-2xl border border-border p-6 sm:p-8 mb-16 flex flex-col sm:flex-row items-start sm:items-center gap-5" style={{ background: "linear-gradient(180deg, hsl(48 100% 96%) 0%, hsl(0 0% 100%) 60%)" }}>
          <span className="text-3xl">🤝</span>
          <div className="flex-1">
            <h3 className="font-display text-lg font-bold">Envie d'être accompagnée pour de vrai ?</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Le <strong>Binôme de com'</strong> : Laetitia à tes côtés pendant 6 mois. Stratégie sur mesure,
              sessions visio, support WhatsApp et validation de chaque livrable. Un accompagnement humain, en plus de l'outil.
            </p>
            <p className="text-sm font-medium text-foreground mt-2">À partir de 290€/mois · engagement 6 mois</p>
          </div>
          <a
            href="https://calendly.com/laetitia-mattioli/appel-decouverte"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-pill border border-border bg-card px-6 py-2.5 font-medium text-foreground hover:bg-secondary transition-colors text-sm whitespace-nowrap"
          >
            Réserver un appel découverte
          </a>
        </div>

        {/* ── Feature Comparison Table ── */}
        <div className="mb-16">
          <h2 className="font-display text-2xl font-bold text-center mb-8">
            Comparatif détaillé
          </h2>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full max-w-2xl mx-auto">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-sm font-medium text-muted-foreground py-3 pr-4 w-[56%]" />
                  <th className="text-center text-sm font-bold text-foreground py-3 w-[22%]">
                    🌱 Gratuit
                  </th>
                  <th className="text-center text-sm font-bold text-primary py-3 w-[22%]">
                    🚀 Premium
                  </th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((section) => (
                  <>
                    <tr key={section.title}>
                      <td
                        colSpan={3}
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
                          <CellValue value={row.premium} />
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
