import { useMemo } from "react";

const CRUISE_TIPS = [
  { emoji: "🕐", text: "Interagis dans les 30 min après avoir posté. L'algorithme regarde l'engagement des premières minutes." },
  { emoji: "💬", text: "Tes commentaires doivent faire +4 mots. \"Trop beau 😍\" ne compte pas. Pose une question, donne un avis." },
  { emoji: "📱", text: "Les stickers interactifs en stories boostent tes vues de 15-25%. Utilise-les tous les jours." },
  { emoji: "🤝", text: "L'engagement, c'est 50% donner, 50% recevoir. Commente chez les autres d'abord." },
  { emoji: "📩", text: "Quand quelqu'un répond à ta story, c'est un signal fort. Réponds toujours, même un petit mot." },
  { emoji: "🔁", text: "Partage le contenu des autres en story avec un petit commentaire perso. Elles feront pareil." },
  { emoji: "⏰", text: "Poste quand ta communauté est active. Regarde tes insights pour trouver le meilleur créneau." },
  { emoji: "🎯", text: "Concentre-toi sur 15-20 comptes stratégiques plutôt que de commenter partout." },
  { emoji: "📊", text: "Les saves sont le signal n°1 pour l'algorithme. Crée du contenu qu'on veut garder." },
  { emoji: "💡", text: "Un DM sincère vaut 100 likes. Écris à 2-3 personnes par jour, pas plus." },
];

const LAUNCH_TIPS = [
  { emoji: "📩", text: "Réponds à CHAQUE DM dans l'heure. Pendant un lancement, chaque DM est une vente potentielle." },
  { emoji: "📊", text: "Qui vote \"oui\" à tes sondages ? Ce sont tes prospects les plus chaud·es. Envoie-leur un DM." },
  { emoji: "💌", text: "Les DM personnalisés convertissent 3-5x mieux qu'un lien en bio. Privilégie la conversation." },
  { emoji: "⏰", text: "40-60% des inscriptions arrivent dans les dernières 48h. Ne lâche pas, c'est maintenant." },
  { emoji: "🙅", text: "JAMAIS de DM non sollicité. N'écris qu'aux personnes qui ont montré un intérêt." },
  { emoji: "📱", text: "Publie au moins 5-7 stories par jour pendant le lancement. C'est le format n°1 de conversion." },
  { emoji: "🔥", text: "Relaye les témoignages en stories. La preuve sociale est ton meilleur argument." },
  { emoji: "💬", text: "Pose des questions en stories pour identifier qui est intéressé·e. Chaque interaction = data." },
  { emoji: "🎯", text: "Mets un compteur dans ta tête : combien de DM envoyés aujourd'hui ? Vise 5-10 minimum." },
  { emoji: "🙏", text: "Remercie publiquement celles qui s'inscrivent (avec leur accord). Ça rassure les autres." },
];

interface TipsSectionProps {
  isLaunching: boolean;
}

export default function TipsSection({ isLaunching }: TipsSectionProps) {
  const tips = useMemo(() => {
    const pool = isLaunching ? LAUNCH_TIPS : CRUISE_TIPS;
    // Pick 4 tips based on day of year for rotation
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const picked: typeof pool = [];
    for (let i = 0; i < 4; i++) {
      picked.push(pool[(dayOfYear + i) % pool.length]);
    }
    return picked;
  }, [isLaunching]);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h2 className="font-display text-lg font-bold text-foreground">
        💡 Tips engagement — {isLaunching ? "🚀 Lancement en cours" : "Mode croisière"}
      </h2>

      <div className="space-y-3">
        {tips.map((tip, i) => (
          <div key={i} className="text-sm text-foreground">
            <span className="mr-1">{tip.emoji}</span>
            {tip.text}
          </div>
        ))}
      </div>
    </div>
  );
}
