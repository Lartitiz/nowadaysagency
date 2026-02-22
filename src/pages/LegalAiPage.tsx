import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function LegalAiPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
        <Link to="/parametres" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="h-4 w-4" /> Retour aux paramètres
        </Link>

        <h1 className="font-display text-2xl font-bold text-foreground mb-6">À propos de l'utilisation de l'IA</h1>

        <div className="rounded-2xl bg-card border border-border p-6 space-y-4 text-sm text-foreground leading-relaxed">
          <p>
            L'assistant de com' utilise l'intelligence artificielle pour aider à la génération de contenus : posts, scripts, pages web, audits.
          </p>
          <p>
            Les contenus générés sont des propositions de travail destinées à être relues, personnalisées et validées par l'utilisateur·ice avant publication.
          </p>
          <p>
            Nowadays Agency ne garantit pas l'exactitude ou la pertinence de chaque suggestion générée par l'IA. L'utilisateur·ice reste seul·e responsable du contenu qu'iel publie.
          </p>
          <p>
            Tes données sont utilisées uniquement pour personnaliser les générations dans l'app. Elles ne sont pas partagées avec des tiers.
          </p>
        </div>
      </main>
    </div>
  );
}
