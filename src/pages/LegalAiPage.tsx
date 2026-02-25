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

        <h1 className="font-display text-2xl font-bold text-foreground mb-6">Nos engagements</h1>

        <div className="rounded-2xl bg-card border border-border p-6 space-y-5 text-sm leading-relaxed">
          <p className="italic text-muted-foreground">
            Cet outil a été conçu par une personne qui croit que la communication peut être puissante sans être manipulatrice. Concrètement, ça veut dire :
          </p>

          <div>
            <p className="font-semibold text-foreground">Pas de dark patterns</p>
            <p className="text-muted-foreground">Pas de bouton "Annuler" minuscule planqué en gris pendant que "Acheter maintenant" clignote. Si tu veux fermer une fenêtre, tu la fermes. Point.</p>
          </div>

          <div>
            <p className="font-semibold text-foreground">Pas de faux compteurs</p>
            <p className="text-muted-foreground">Tu ne verras jamais "Plus que 2 places !" ou "17 personnes regardent cette offre". Parce que c'est faux. Et parce que tu mérites mieux que du stress artificiel.</p>
          </div>

          <div>
            <p className="font-semibold text-foreground">Pas de FOMO fabriqué</p>
            <p className="text-muted-foreground">On ne va pas t'envoyer 3 mails de "dernière chance" pour te faire craquer. Si une offre t'intéresse, elle sera encore là demain.</p>
          </div>

          <div>
            <p className="font-semibold text-foreground">Pas de culpabilisation</p>
            <p className="text-muted-foreground">Si tu ne te connectes pas pendant 3 semaines, personne ne t'envoie un message passif-agressif du type "Tu nous manques 😢". Ta com' avance à ton rythme. Pas au nôtre.</p>
          </div>

          <div>
            <p className="font-semibold text-foreground">L'IA propose, toi tu décides</p>
            <p className="text-muted-foreground">Chaque contenu généré est une base de travail. Pas un produit fini. Ton expertise et ta voix restent au centre.</p>
          </div>

          <p className="italic text-muted-foreground text-xs">
            Ça paraît évident ? Ça devrait l'être. Sauf que la majorité des outils SaaS font exactement l'inverse.
          </p>
        </div>
      </main>
    </div>
  );
}
