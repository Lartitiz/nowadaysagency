import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { STRIPE_PLANS } from "@/lib/stripe-config";
import { Button } from "@/components/ui/button";
import { Shield, Heart, Loader2, ArrowLeft, ArrowRight } from "lucide-react";

const BENEFITS = [
  {
    emoji: "🤝",
    title: "Tu n'es plus seule face à ta com'",
    text: "Fini de fixer ton écran en te demandant quoi poster. Tu as une binôme qui bosse avec toi, qui répond à tes questions, qui te débloque quand ça coince. Une vraie personne, pas un chatbot.",
  },
  {
    emoji: "🗺️",
    title: "Tu as un plan clair, et il avance",
    text: "Branding, réseaux, site, newsletter, SEO : tout est structuré, priorisé, planifié. Tu sais exactement quoi faire chaque semaine. L'éparpillement, c'est terminé.",
  },
  {
    emoji: "⚡",
    title: "Quelqu'un fait pour toi (en vrai)",
    text: "Je crée tes templates, tes accroches, ton calendrier éditorial. Tu n'as plus qu'à personnaliser et publier. La page blanche, c'est fini.",
  },
  {
    emoji: "📈",
    title: "Tu vois enfin des résultats",
    text: "Plus de visibilité, plus de demandes, plus de ventes. Pas par magie : parce que ta com' est devenue un vrai système qui travaille pour toi. Même quand tu dors.",
  },
  {
    emoji: "💜",
    title: "Tu communiques sans trahir tes valeurs",
    text: "Parce qu'il existe une manière de rendre ton projet visible sans devenir \"commerciale\", sans forcer, sans te sentir illégitime. C'est toute la promesse : ta voix, amplifiée. Pas déformée.",
  },
];

export default function CheckoutBinomePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const handleCheckout = () => {
    window.location.href = "https://buy.stripe.com/4gMfZidRHgQo7Ve0IF67S00";
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header minimal */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-display text-lg font-bold text-foreground">
            Nowadays
          </Link>
          {user ? (
            <Link to="/dashboard" className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
              Mon espace <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <Link to="/login?redirect=/checkout/binome" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Se connecter
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12 animate-fade-in">
        {/* Title */}
        <div className="text-center mb-8">
          <span className="text-5xl mb-4 block">🤝</span>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Ta binôme de com'
          </h1>
          <p className="text-muted-foreground mt-3 text-balance leading-relaxed">
            6 mois pour poser les bases d'une communication qui te ressemble.
            <br className="hidden sm:block" />
            L'outil + Laetitia à tes côtés.
          </p>
        </div>

        {/* Main Card */}
        <div
          className="rounded-2xl border border-border p-6 sm:p-8"
          style={{ background: "linear-gradient(180deg, hsl(48 100% 95%) 0%, hsl(0 0% 100%) 40%)" }}
        >
          {/* Price */}
          <div className="text-center mb-8">
            <p className="text-4xl font-bold text-foreground">
              250€<span className="text-lg font-normal text-muted-foreground">/mois</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Engagement 6 mois · 1 500€ au total
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-6 mb-8">
            {BENEFITS.map((b) => (
              <div key={b.title}>
                <span className="text-2xl block mb-1">{b.emoji}</span>
                <p className="font-bold text-foreground">{b.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">{b.text}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Button
            onClick={handleCheckout}
            disabled={checkoutLoading}
            className="w-full rounded-full h-12 text-base font-semibold"
            size="lg"
          >
            {checkoutLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Redirection vers le paiement...
              </>
            ) : (
              "Démarrer mon accompagnement"
            )}
          </Button>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Paiement sécurisé
            </span>
            <span className="flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5" /> Satisfaite ou remboursée
            </span>
          </div>
        </div>

        {/* Comment ça se passe */}
        <div className="mt-14">
          <h2 className="font-display text-2xl font-bold text-foreground text-center">
            Comment ça se passe, concrètement
          </h2>
          <p className="text-muted-foreground text-center mt-2 mb-8">
            6 mois, deux phases. D'abord on construit ta stratégie, ensuite on l'applique. Simple.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Phase 1 */}
            <div className="rounded-2xl border border-border p-6">
              <span className="inline-block text-xs font-semibold text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">
                Mois 1 → 3
              </span>
              <p className="font-bold text-foreground mb-1">Je construis ton plan de com'</p>
              <p className="text-sm text-muted-foreground italic mb-4">
                La partie stratégique : je fais pour toi, avec toi. Pas un PDF de 50 pages. Des vrais outils, prêts à l'emploi.
              </p>
              <ul className="space-y-1.5 text-sm text-foreground">
                <li>– Audit complet + atelier de lancement</li>
                <li>– Branding : positionnement, storytelling, ton</li>
                <li>– Plan d'action 6 mois + calendrier éditorial</li>
                <li>– Templates Canva créés dans ton identité</li>
                <li>– Messages clés rédigés (bio, accroches, scripts)</li>
              </ul>
            </div>

            {/* Phase 2 */}
            <div className="rounded-2xl border border-border p-6">
              <span className="inline-block text-xs font-semibold text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">
                Mois 3 → 6
              </span>
              <p className="font-bold text-foreground mb-1">On applique, ensemble</p>
              <p className="text-sm text-muted-foreground italic mb-4">
                Tu mets en œuvre, je suis à côté. On crée, on optimise, on ajuste. Et entre les sessions : je reste dispo.
              </p>
              <ul className="space-y-1.5 text-sm text-foreground">
                <li>– 1 session visio de 2h par mois</li>
                <li>– Support WhatsApp jours ouvrés (24-48h)</li>
                <li>– Relecture et validation de tes contenus</li>
                <li>– L'Assistant Com' Premium inclus</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom note */}
        <p className="text-xs text-muted-foreground text-center mt-10 italic leading-relaxed">
          L'abonnement s'arrête automatiquement après 6 mois.
          <br />
          Pas de mauvaise surprise, pas de renouvellement caché.
        </p>

        {/* Back link */}
        <div className="text-center mt-4 mb-8">
          <Link to="/pricing" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Voir tous les plans
          </Link>
        </div>
      </main>
    </div>
  );
}
