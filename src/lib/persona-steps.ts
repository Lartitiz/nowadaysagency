export interface PersonaStep {
  number: number;
  icon: string;
  title: string;
  consigne: string;
  helpTitle: string;
  helpContent: string;
  examples?: string;
  aiButtonLabel: string;
  aiType: string;
}

export const PERSONA_STEPS: PersonaStep[] = [
  {
    number: 1,
    icon: "😩",
    title: "Comprends ses frustrations",
    consigne: "Tu ne vends pas juste un produit ou un service. Tu réponds à un manque. Qu'est-ce qui coince pour ta cliente idéale en ce moment ?",
    helpTitle: "💡 Comment faire ?",
    helpContent: `Parle comme si tu décrivais une amie. Réponds à ces questions :
- Qu'est-ce qui la dérange dans son quotidien ?
- Que rêve-t-elle de faire, mais n'y arrive pas ?
- Qu'est-ce qui la fatigue ou lui pèse ?
- Qu'est-ce qui n'a plus de sens dans ses habitudes ?
- Comment ton projet vient adoucir ça, lui offrir une autre voie ?`,
    aiButtonLabel: "✨ M'aider à approfondir ses frustrations",
    aiType: "frustrations",
  },
  {
    number: 2,
    icon: "✨",
    title: "Ce qu'elle désire profondément",
    consigne: "Si ta cliente achète chez toi, à quoi ressemble sa vie ? Qu'est-ce qui change ? C'est ça que tu vends au fond : une transformation.",
    helpTitle: "💡 Comment faire ?",
    helpContent: `Réponds à cette question :
'Si ma cliente achète chez moi... qu'est-ce qu'elle aurait, ferait ou ressentirait ?'

Pour t'aider :
- Que devient possible pour elle grâce à ton projet ?
- En quoi sa vie est plus simple, plus fluide, plus belle ?
- Que ressent-elle de nouveau ? (fierté, légèreté, confiance, joie...)
- Qu'est-ce qu'elle ne fait plus ? (culpabiliser, hésiter, se sentir perdue...)
- Qu'ose-t-elle enfin faire ou être ?`,
    examples: `Tu peux commencer ta dictée vocale comme ça :
👉 'Elle rêverait de pouvoir...'
👉 'Ce qu'elle cherche au fond, c'est...'

Exemples :
Mode : Avoir une garde-robe belle, durable et éthique sans prise de tête. Porter des vêtements qui reflètent ses valeurs.

Bien-être : Se réveiller avec de l'énergie. Se sentir bien dans son corps, sans obsession. Avoir des repères simples.`,
    aiButtonLabel: "✨ Formuler 10 bénéfices concrets",
    aiType: "benefits",
  },
  {
    number: 3,
    icon: "🚧",
    title: "Ce qui la retient (et ce qu'elle croit à tort)",
    consigne: "Entre le désir et le passage à l'acte, il y a des peurs, des doutes, et des idées reçues. Qu'est-ce qui la bloque ?",
    helpTitle: "💡 Comment faire ?",
    helpContent: `Sous-section A : Ses objections au moment d'acheter
- Que croit-elle devoir faire d'abord ? ('je n'ai pas le temps', 'c'est trop cher', 'ce n'est pas prioritaire')
- A-t-elle honte de son point de départ ou peur d'être jugée ?
- Se dit-elle qu'elle doit 'régler autre chose' avant ?

Sous-section B : Les clichés qu'elle a en tête
- Quelles fausses idées a-t-elle à propos de ton univers ?
- Ce qu'elle redoute parce qu'elle a entendu des généralités
- Ce qu'elle croit savoir mais qui est faux`,
    examples: `Exemples d'objections :
Mode : 'C'est trop cher pour moi' / 'Je ne suis pas sûre que ça m'aille'
Bien-être : 'Je vais encore abandonner' / 'Je n'ai pas la discipline'
Coaching : 'Je peux trouver ça gratuitement en ligne' / 'Ce n'est pas le bon moment'

Exemples de clichés :
Mode : 'La mode éthique c'est moche ou beige' / 'C'est forcément hors de prix'
Bien-être : 'Manger sain = peser tout et cuisiner H24' / 'Changer = plus de plaisir'`,
    aiButtonLabel: "✨ Approfondir ses freins et clichés",
    aiType: "barriers",
  },
  {
    number: 4,
    icon: "🎨",
    title: "Ce qui la fait s'arrêter sur Instagram",
    consigne: "Mets-toi dans sa peau. Elle scrolle. Qu'est-ce qui la fait s'arrêter ? Qu'est-ce qu'elle trouve beau, inspirant, rebutant ?",
    helpTitle: "💡 Comment faire ?",
    helpContent: `Imagine-toi à sa place et réponds :
- Quels visuels la font s'arrêter ?
- Quelles couleurs, matières, ambiances la touchent ?
- Qu'est-ce qu'elle sauvegarde dans ses collections Insta ?
- Les marques qu'elle aime (et pourquoi) ?
- Qu'est-ce qu'elle trouve 'too much' ou pas aligné ?`,
    aiButtonLabel: "✨ Déduire une direction visuelle",
    aiType: "visual",
  },
  {
    number: 5,
    icon: "🚀",
    title: "Utilise tout ça concrètement",
    consigne: "Bravo, tu as un portrait vivant de ta cliente. Maintenant, on transforme ça en actions.",
    helpTitle: "💡 Comment faire ?",
    helpContent: `Prends 10 minutes pour relire ce que tu as noté. Puis note 3 à 5 actions concrètes.

Exemples :
- Réécrire ma bio Instagram avec les mots de ma cliente
- Créer un post 'je te comprends' basé sur ses frustrations
- Adapter ma page de vente avec ses objections
- Organiser un atelier ou une collab`,
    aiButtonLabel: "✨ Générer un plan d'actions",
    aiType: "actions",
  },
];
