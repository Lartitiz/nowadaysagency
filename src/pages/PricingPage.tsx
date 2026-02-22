import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
import { Check, X, Sparkles, ArrowRight, Infinity } from "lucide-react";
import PromoCodeInput from "@/components/PromoCodeInput";

/* ─── Feature comparison data ─── */
const SECTIONS = [
  {
    title: "Fondations",
    rows: [
      { label: "Branding guidé", free: true, outil: true, studio: true },
      { label: "Définir sa cible", free: true, outil: true, studio: true },
      { label: "Mon histoire", free: true, outil: true, studio: true },
      { label: "Positionnement offre", free: false, outil: true, studio: true },
    ],
  },
  {
    title: "Création de contenu",
    rows: [
      { label: "Générations IA", free: "3/mois", outil: "♾️", studio: "♾️" },
      { label: "Posts Instagram", free: true, outil: true, studio: true },
      { label: "Reels", free: true, outil: true, studio: true },
      { label: "Stories", free: true, outil: true, studio: true },
      { label: "Bio Instagram", free: true, outil: true, studio: true },
      { label: "Commentaires stratégiques", free: false, outil: true, studio: true },
      { label: "DM personnalisés", free: false, outil: true, studio: true },
    ],
  },
  {
    title: "Analyse & suivi",
    rows: [
      { label: "Audit Instagram", free: "1/mois", outil: "♾️", studio: "♾️" },
      { label: "Audit LinkedIn", free: false, outil: true, studio: true },
      { label: "Import stats (Excel/CSV)", free: false, outil: true, studio: true },
      { label: "Dashboard KPI", free: false, outil: true, studio: true },
    ],
  },
  {
    title: "Engagement & prospection",
    rows: [
      { label: "Contacts stratégiques", free: false, outil: true, studio: true },
      { label: "Routine d'engagement", free: false, outil: true, studio: true },
      { label: "Mini-CRM prospection", free: false, outil: true, studio: true },
    ],
  },
  {
    title: "Communauté",
    rows: [
      { label: "Lire le feed", free: true, outil: true, studio: true },
      { label: "Poster et commenter", free: false, outil: true, studio: true },
      { label: "Lives mensuels (×2)", free: false, outil: true, studio: true },
      { label: "Replays", free: false, outil: true, studio: true },
    ],
  },
  {
    title: "Now Studio exclusif",
    rows: [
      { label: "Coachings individuels", free: false, outil: false, studio: "6 × 1h" },
      { label: "Validation par Laetitia", free: false, outil: false, studio: true },
      { label: "Espace privé Studio", free: false, outil: false, studio: true },
      { label: "Lives exclusifs Studio", free: false, outil: false, studio: true },
      { label: "Canal direct Laetitia", free: false, outil: false, studio: true },
      { label: "Binôme attitrée", free: false, outil: false, studio: true },
      { label: "Weekend Bourgogne", free: false, outil: false, studio: "Inclus" },
    ],
  },
];

const FAQ = [
  {
    q: "Je peux annuler quand je veux ?",
    a: "Oui, le plan Outil est sans engagement. Tu annules en 1 clic depuis ton espace. Le Now Studio est un engagement de 6 mois.",
  },
  {
    q: "Je peux upgrader en cours de route ?",
    a: "Oui ! Tu peux passer du gratuit à l'outil, ou de l'outil au Now Studio à tout moment.",
  },
  {
    q: "Il y a une garantie ?",
    a: "Le Now Studio est satisfait ou remboursé si tu appliques tout et que tu n'as pas de résultats.",
  },
  {
    q: "C'est quoi la différence entre l'outil et le Now Studio ?",
    a: "L'outil, c'est l'IA qui t'aide au quotidien. Le Now Studio, c'est l'outil + Laetitia qui te coache, te débloque, et valide chaque étape.",
  },
  {
    q: "Mes données sont sécurisées ?",
    a: "Oui, hébergées en Europe, chiffrées, jamais revendues.",
  },
  {
    q: "39€/mois c'est pas cher pour un outil IA ?",
    a: "C'est 10× moins cher qu'un community manager. Et l'outil est spécialisé com' éthique, pas générique.",
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
  const [annual, setAnnual] = useState(false);

  const handleCheckout = async () => {
    if (!user) {
      window.location.href = "/login";
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
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const isCurrentPlan = (p: string) => plan === p;

  return (
    <div className="min-h-screen bg-background">
      {user && <AppHeader />}

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

          {/* Annual toggle */}
          <div className="mt-6 inline-flex items-center gap-3 bg-secondary rounded-pill px-4 py-2">
            <button
              onClick={() => setAnnual(false)}
              className={`text-sm font-medium px-3 py-1 rounded-pill transition-colors ${
                !annual ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`text-sm font-medium px-3 py-1 rounded-pill transition-colors ${
                annual ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Annuel{" "}
              <span className="text-primary text-xs font-semibold">-20%</span>
            </button>
          </div>
        </div>

        {/* ── 3 Plan Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
          {/* Free */}
          <div className="rounded-2xl bg-card border border-border p-6 flex flex-col">
            <span className="text-2xl mb-2">🆓</span>
            <h3 className="font-display text-xl font-bold">Gratuit</h3>
            <p className="text-3xl font-bold mt-2">
              0€
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              L'essentiel pour tester
            </p>
            <ul className="space-y-2 text-sm text-foreground mb-6 flex-1">
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Branding guidé</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> 3 générations IA / mois</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> 1 audit / mois</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Recommandations</li>
            </ul>
            {isCurrentPlan("free") ? (
              <div className="text-center rounded-pill border-2 border-primary py-2.5 font-medium text-primary text-sm">
                Ton plan actuel
              </div>
            ) : !user ? (
              <Link
                to="/login"
                className="block text-center rounded-pill border border-border py-2.5 font-medium text-foreground hover:bg-secondary transition-colors text-sm"
              >
                Commencer
              </Link>
            ) : null}
          </div>

          {/* Outil */}
          <div className="rounded-2xl bg-card border-2 border-primary p-6 flex flex-col relative shadow-card-hover">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-pill">
              Populaire
            </div>
            <span className="text-2xl mb-2">💎</span>
            <h3 className="font-display text-xl font-bold">Outil</h3>
            <p className="text-3xl font-bold mt-2 text-primary">
              {annual ? "31€" : "39€"}
              <span className="text-base font-normal text-muted-foreground">
                /mois
              </span>
            </p>
            {annual && (
              <p className="text-xs text-muted-foreground">
                374€/an au lieu de 468€
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Tout l'outil débloqué, sans engagement
            </p>
            <ul className="space-y-2 text-sm text-foreground mb-6 flex-1">
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Générations IA illimitées</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Audits illimités</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Mini-CRM prospection</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Générateur commentaires + DM</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Dashboard stats complet</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Calendrier éditorial</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Contacts stratégiques + routine</li>
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

          {/* Now Studio */}
          <div className="rounded-2xl bg-card border border-border p-6 flex flex-col" style={{ background: "linear-gradient(180deg, hsl(48 100% 95%) 0%, hsl(0 0% 100%) 40%)" }}>
            <span className="text-2xl mb-2">🌟</span>
            <h3 className="font-display text-xl font-bold">Now Studio</h3>
            <p className="text-3xl font-bold mt-2 text-primary">
              250€
              <span className="text-base font-normal text-muted-foreground">
                /mois × 6
              </span>
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              L'outil + Laetitia à tes côtés
            </p>
            <ul className="space-y-2 text-sm text-foreground mb-6 flex-1">
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Tout le plan Outil</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> 6 coachings individuels (1h)</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Validation par Laetitia</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Espace privé Studio</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Canal direct Laetitia</li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Weekend Bourgogne inclus</li>
            </ul>
            {isCurrentPlan("studio") ? (
              <div className="text-center rounded-pill border-2 border-primary py-2.5 font-medium text-primary text-sm">
                Ton plan actuel
              </div>
            ) : (
              <a
                href="https://calendly.com/laetitia-mattioli/appel-decouverte-academy"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center rounded-pill border border-border py-2.5 font-medium text-foreground hover:bg-secondary transition-colors text-sm"
              >
                Réserver un appel
              </a>
            )}
          </div>
        </div>

        {/* ── Feature Comparison Table ── */}
        <div className="mb-16">
          <h2 className="font-display text-2xl font-bold text-center mb-8">
            Comparatif détaillé
          </h2>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-sm font-medium text-muted-foreground py-3 pr-4 w-[45%]" />
                  <th className="text-center text-sm font-bold text-foreground py-3 w-[18%]">
                    🆓 Gratuit
                  </th>
                  <th className="text-center text-sm font-bold text-primary py-3 w-[18%]">
                    💎 Outil
                  </th>
                  <th className="text-center text-sm font-bold text-foreground py-3 w-[18%]">
                    🌟 Studio
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
              to="/login"
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
