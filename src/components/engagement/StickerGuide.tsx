import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface StickerReco {
  name: string;
  emoji: string;
  rank: number;
  impact: string;
  stars: number;
  barrier: string;
  formulations: string[];
  placement: string;
}

interface ObjectiveDef {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  recommendations: StickerReco[];
  avoid: string[];
}

const OBJECTIVES: ObjectiveDef[] = [
  {
    id: "reagir",
    emoji: "💬",
    label: "Faire réagir",
    desc: "Boost algo, engagement",
    recommendations: [
      {
        name: "Sondage", emoji: "🗳️", rank: 1, impact: "⭐⭐⭐ Fort", stars: 3, barrier: "très basse (1 tap)",
        formulations: ["\"Tu te reconnais ?\" → Oui / Tellement", "\"Tu es plutôt A ou B ?\"", "\"Tu fais ça aussi ?\" → Oui / Jamais"],
        placement: "story 1 ou 2 (pas en fin)",
      },
      {
        name: "Quiz", emoji: "📊", rank: 2, impact: "⭐⭐⭐ Fort", stars: 3, barrier: "basse (1 tap, aspect ludique)",
        formulations: ["\"Vrai ou faux : [affirmation]\"", "Tester les connaissances sur un sujet", "4ème option \"Je sais pas, dis-moi\" pour les hésitant·es"],
        placement: "après le contenu éducatif",
      },
    ],
    avoid: ["Sticker lien sur story 1 ou 2 (les gens partent)", "GIFs décoratifs sans fonction (dilue le message)", "Trop de stickers sur 1 story (1 seul par story max)"],
  },
  {
    id: "comprendre",
    emoji: "🔍",
    label: "Comprendre mon audience",
    desc: "Récolter des insights",
    recommendations: [
      {
        name: "Question ouverte", emoji: "❓", rank: 1, impact: "⭐⭐⭐⭐ Max", stars: 4, barrier: "moyenne (taper une réponse)",
        formulations: ["\"C'est quoi ton plus gros défi en [sujet] ?\"", "\"Qu'est-ce qui te bloque le plus ?\"", "\"Dis-moi en 1 mot ce que tu ressens\""],
        placement: "story 3-4 (après le contexte)",
      },
      {
        name: "Sondage", emoji: "🗳️", rank: 2, impact: "⭐⭐⭐ Fort", stars: 3, barrier: "très basse (1 tap)",
        formulations: ["\"Tu préfères A ou B ?\"", "\"C'est un problème pour toi ?\" → Oui / Pas du tout"],
        placement: "story 1 ou 2",
      },
    ],
    avoid: ["Questions trop larges (\"Ça va ?\")", "Sticker lien (distrait de la conversation)"],
  },
  {
    id: "convertir",
    emoji: "💰",
    label: "Amener vers mon offre",
    desc: "Conversion",
    recommendations: [
      {
        name: "Question ouverte / DM keyword", emoji: "❓", rank: 1, impact: "⭐⭐⭐⭐ Max", stars: 4, barrier: "moyenne",
        formulations: ["\"Écris STRATÉGIE en DM et je t'envoie le lien\"", "\"Tu veux les détails ? Écris-moi 💬\"", "\"Réponds OUI si tu veux que je t'en parle\""],
        placement: "avant-dernière ou dernière story",
      },
      {
        name: "Sondage", emoji: "🗳️", rank: 2, impact: "⭐⭐⭐ Fort", stars: 3, barrier: "très basse",
        formulations: ["\"Tu veux en savoir plus ?\" → Oui / Pas maintenant", "\"Ça t'intéresse ?\" → Carrément / Pas pour moi"],
        placement: "story 2-3 pour qualifier l'intérêt",
      },
    ],
    avoid: ["Sticker lien en story 1 ou 2", "CTA agressif (\"ACHÈTE MAINTENANT\")", "Plus de 1 CTA par séquence"],
  },
  {
    id: "eduquer",
    emoji: "📚",
    label: "Éduquer en s'amusant",
    desc: "Pédagogie ludique",
    recommendations: [
      {
        name: "Quiz", emoji: "📊", rank: 1, impact: "⭐⭐⭐ Fort", stars: 3, barrier: "basse",
        formulations: ["\"Vrai ou faux : [affirmation sur ton domaine]\"", "\"Quelle est la bonne réponse ?\"", "Toujours inclure \"Je sais pas\" comme option"],
        placement: "après l'explication, pour vérifier la compréhension",
      },
      {
        name: "Slider emoji", emoji: "📏", rank: 2, impact: "⭐⭐ Moyen", stars: 2, barrier: "très basse",
        formulations: ["\"Tu le savais ?\" 🤯 ← → 😎", "\"Sur 10, à quel point ça te parle ?\""],
        placement: "story 2-3 comme feedback",
      },
    ],
    avoid: ["Trop de texte sur la story avec le quiz", "Questions trop faciles (pas d'intérêt)"],
  },
  {
    id: "teasing",
    emoji: "🎉",
    label: "Créer de l'attente",
    desc: "Teasing, lancement",
    recommendations: [
      {
        name: "Compte à rebours", emoji: "⏰", rank: 1, impact: "⭐⭐ Moyen", stars: 2, barrier: "basse (1 tap pour activer)",
        formulations: ["\"J-3 avant la grande annonce 👀\"", "\"Active le rappel pour ne pas louper ça\""],
        placement: "dernière story de la séquence",
      },
      {
        name: "Sondage", emoji: "🗳️", rank: 2, impact: "⭐⭐⭐ Fort", stars: 3, barrier: "très basse",
        formulations: ["\"Tu veux que je t'en dise plus ?\" → Oui / Attends je devine", "\"Ça t'intrigue ?\" → Grave / Dis-moi tout"],
        placement: "story 1 ou 2",
      },
    ],
    avoid: ["Tout révéler d'un coup (détruit le suspense)", "Trop de teasing sans jamais livrer"],
  },
];

const STICKER_TABLE = [
  { name: "❓ Question ouverte", impact: "⭐⭐⭐⭐ Max", usage: "Comprendre, convertir" },
  { name: "🗳️ Sondage", impact: "⭐⭐⭐ Fort", usage: "Engagement quotidien" },
  { name: "📊 Quiz", impact: "⭐⭐⭐ Fort", usage: "Éduquer en s'amusant" },
  { name: "📏 Slider emoji", impact: "⭐⭐ Moyen", usage: "Feedback émotionnel" },
  { name: "⏰ Compte à rebours", impact: "⭐⭐ Moyen", usage: "Lancements" },
  { name: "🔗 Lien", impact: "⭐ Faible", usage: "Page vente (avec modé.)" },
  { name: "📍 Localisation", impact: "⭐⭐ Moyen", usage: "Business local" },
  { name: "🎵 Musique", impact: "⭐ Faible", usage: "Ambiance" },
];

interface Props {
  onClose: () => void;
}

export default function StickerGuide({ onClose }: Props) {
  const [selectedObjective, setSelectedObjective] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const selectedDef = OBJECTIVES.find(o => o.id === selectedObjective);

  if (showTable) {
    return (
      <div className="space-y-4">
        <button onClick={() => setShowTable(false)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <h2 className="font-display text-lg font-bold text-foreground">📊 Tableau récap stickers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 font-medium text-foreground">Sticker</th>
                <th className="text-left py-2 pr-3 font-medium text-foreground">Impact algo</th>
                <th className="text-left py-2 font-medium text-foreground">Meilleur usage</th>
              </tr>
            </thead>
            <tbody>
              {STICKER_TABLE.map((s, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-foreground">{s.name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{s.impact}</td>
                  <td className="py-2 text-muted-foreground">{s.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground bg-rose-pale rounded-lg p-2.5">
          💡 Règle d'or : "Écris [MOT] en DM" {">"} sticker lien pour convertir. Les DM sont le signal algo le plus fort ET le meilleur canal de vente.
        </p>
      </div>
    );
  }

  if (selectedDef) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedObjective(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <h2 className="font-display text-lg font-bold text-foreground">🎯 Sticker recommandé</h2>
        <p className="text-sm text-muted-foreground">Pour {selectedDef.label.toLowerCase()} :</p>

        {selectedDef.recommendations.map((r) => (
          <div key={r.name} className="rounded-2xl border border-border bg-background p-4 space-y-2">
            <p className="font-body text-sm font-bold text-foreground">
              ⭐ N°{r.rank} : {r.emoji} {r.name.toUpperCase()}
            </p>
            <p className="text-xs text-muted-foreground">Impact algo : {r.impact}</p>
            <p className="text-xs text-muted-foreground">Barrière : {r.barrier}</p>
            <div className="mt-2">
              <p className="text-xs font-medium text-foreground mb-1">Comment le formuler :</p>
              <ul className="space-y-0.5">
                {r.formulations.map((f, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {f}</li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">📍 Où le placer : {r.placement}</p>
          </div>
        ))}

        {selectedDef.avoid.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">⚠️ À ÉVITER :</p>
            {selectedDef.avoid.map((a, i) => (
              <p key={i} className="text-xs text-muted-foreground">• {a}</p>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" className="rounded-full text-xs" onClick={() => setShowTable(true)}>
          📊 Voir le tableau récap complet
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-foreground">🎯 Quel sticker utiliser ?</h2>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-xs text-muted-foreground">Fermer</Button>
      </div>
      <p className="text-sm text-muted-foreground">Qu'est-ce que tu veux obtenir avec cette story ?</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OBJECTIVES.map((o) => (
          <button
            key={o.id}
            onClick={() => setSelectedObjective(o.id)}
            className="rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/50 transition-all"
          >
            <span className="text-lg">{o.emoji}</span>
            <p className="font-body text-sm font-bold text-foreground mt-1">{o.label}</p>
            <p className="text-xs text-muted-foreground">{o.desc}</p>
          </button>
        ))}
      </div>

      <Button variant="outline" size="sm" className="rounded-full text-xs" onClick={() => setShowTable(true)}>
        📊 Voir le tableau récap complet
      </Button>
    </div>
  );
}
