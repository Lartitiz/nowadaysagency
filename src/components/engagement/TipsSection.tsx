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

const STORIES_TIPS = [
  { emoji: "📱", text: "23,8% de ton audience part après la story 1. Ton hook est crucial : une question, une émotion, une affirmation choc.", source: "Socialinsider 2025" },
  { emoji: "📩", text: "'Écris [MOT] en DM' convertit 2x mieux que le sticker lien. Et ça booste l'algo.", source: "Social Media Examiner" },
  { emoji: "🎥", text: "Les stories vidéo génèrent plus de reach que les images. Mais mixe les deux pour varier le rythme.", source: "Socialinsider 2025" },
  { emoji: "❓", text: "Le sticker Question ouverte est le plus puissant : les réponses = DM = signal algo n°1.", source: "Instagram Algo" },
  { emoji: "🔥", text: "Les comptes qui postent des stories tous les jours ont 23% de rétention en plus.", source: "Outfame 2026" },
  { emoji: "🎯", text: "3-7 stories par jour, c'est le sweet spot. Au-delà de 10, les gens voient les petits points et passent.", source: "Buffer + Socialinsider" },
  { emoji: "⏰", text: "Étale tes stories dans la journée (matin/midi/soir). Chaque nouvelle story te remet en haut de la barre.", source: "Instagram Data" },
  { emoji: "🔇", text: "60-80% des gens regardent les stories SANS le son. Si tu fais de la face cam, prévois les sous-titres.", source: "Sprout Social" },
  { emoji: "📝", text: "Les stories 'screenshot de Notes iPhone' sont très tendance. Brut, intime, rapide.", source: "Tendances 2025" },
  { emoji: "🔗", text: "Ne mets JAMAIS un sticker lien sur la story 1 ou 2. Les gens partent avant de voir le reste.", source: "Best practices" },
  { emoji: "📈", text: "Les séquences structurées (problème→solution) ont +28% de complétion par rapport aux stories isolées.", source: "Later 2025" },
  { emoji: "⚖️", text: "Ratio sain : 80% connexion/éducation, 20% vente en croisière. En lancement, tu peux monter à 40% vente.", source: "Best practices" },
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
  const dayOfYear = useMemo(() => Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000), []);
  const isStoriesDay = dayOfYear % 2 === 0; // Alternate daily

  const feedTips = useMemo(() => {
    const pool = isLaunching ? LAUNCH_TIPS : CRUISE_TIPS;
    const picked: typeof pool = [];
    for (let i = 0; i < 4; i++) {
      picked.push(pool[(dayOfYear + i) % pool.length]);
    }
    return picked;
  }, [isLaunching, dayOfYear]);

  const storyTip = useMemo(() => {
    return STORIES_TIPS[dayOfYear % STORIES_TIPS.length];
  }, [dayOfYear]);

  return (
    <div className="space-y-4">
      {/* Stories tip of the day (alternating) */}
      {isStoriesDay && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-2">
          <h2 className="font-display text-lg font-bold text-foreground">📱 Tip stories du jour</h2>
          <p className="text-sm text-foreground">
            <span className="mr-1">{storyTip.emoji}</span>
            {storyTip.text}
          </p>
          {storyTip.source && (
            <p className="text-2xs text-muted-foreground">Source : {storyTip.source}</p>
          )}
        </div>
      )}

      {/* Feed tips */}
      {!isStoriesDay && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="font-display text-lg font-bold text-foreground">
            💡 Tips engagement — {isLaunching ? "🚀 Lancement en cours" : "Mode croisière"}
          </h2>
          <div className="space-y-3">
            {feedTips.map((tip, i) => (
              <div key={i} className="text-sm text-foreground">
                <span className="mr-1">{tip.emoji}</span>
                {tip.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
