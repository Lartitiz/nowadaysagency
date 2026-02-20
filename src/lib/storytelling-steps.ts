export interface StorytellingStep {
  number: number;
  icon: string;
  title: string;
  consigne: string;
  helpTitle: string;
  helpContent: string;
  examples?: string;
  examplesTitle?: string;
  placeholder: string;
  textareaHeight: string;
  aiButtonLabel: string;
  aiStepContext: string;
  // For step 3 and 5: comparison blocks
  comparison?: { bad: string; good: string };
  // For step 6: special behavior
  isGenerateStep?: boolean;
  // For step 7: polish step
  isPolishStep?: boolean;
  // For step 8: pitch step
  isPitchStep?: boolean;
}

export const STORYTELLING_STEPS: StorytellingStep[] = [
  {
    number: 1,
    icon: "🔥",
    title: "Raconte comment tout a commencé",
    consigne: "Parle comme si tu racontais ton histoire à une amie proche. Laisse venir ce qui vient, sans filtre, sans chercher à bien faire.",
    helpTitle: "💡 Comment faire ?",
    helpContent: "Tu peux raconter :\n• Ce qui t'a mis·e en mouvement\n• L'étincelle, la galère, le déclic\n• Ce que tu ressentais à ce moment-là\n• Ce qui te faisait kiffer (ou flipper)",
    examples: "⏱️ 3 à 5 minutes max. L'objectif : te reconnecter à ta source, à ton 'pourquoi'.",
    placeholder: "Il y a quelques années, j'étais...",
    textareaHeight: "min-h-[200px]",
    aiButtonLabel: "✨ Améliorer avec l'IA",
    aiStepContext: "L'utilisatrice raconte les origines de son projet, le déclic qui l'a lancée.",
  },
  {
    number: 2,
    icon: "📍",
    title: "Trouve ton lieu",
    consigne: "Trouve dans ton souvenir un lieu précis et une action. C'est ce qui rend ton histoire visible.",
    helpTitle: "💡 Pourquoi c'est important ?",
    helpContent: "Dire 'j'étais perdue', c'est flou. Mais dire 'j'étais dans la cuisine, les mains encore mouillées' : là, on voit. Et donc on ressent.",
    examples: "Tu peux t'inspirer de cette structure :\n👉 'Il y a [X temps], j'étais [lieu précis] en train de [action].'\n\nExemples :\n• Il y a deux semaines, j'étais assise sur mon canapé, en train d'allaiter mon bébé de 3 mois.\n• C'était en 2017. Je me rappelle être devant la porte de ma première salle de classe, le cœur qui tambourine.\n• Il y a quelques mois, j'étais dans le train entre Paris et Lyon, mon carnet de notes sur les genoux.\n\n🌀 Ton histoire n'est pas figée en une seule image. Tu peux en avoir plusieurs.",
    placeholder: "Il y a [X temps], j'étais [lieu] en train de [action]...",
    textareaHeight: "min-h-[150px]",
    aiButtonLabel: "✨ Rendre la scène plus visuelle",
    aiStepContext: "L'utilisatrice ancre son histoire dans un lieu et une action précis.",
  },
  {
    number: 3,
    icon: "🎬",
    title: "Montre l'action",
    consigne: "Un bon storytelling ne commence pas par 'j'ai décidé de…' mais par une scène vivante, précise, concrète.",
    helpTitle: "💡 Comment faire ?",
    helpContent: "Réponds à ces 3 questions :\n• Où étais-tu ? (lieu précis)\n• Que faisais-tu ? (action visible, geste, mouvement)\n• Qu'est-ce que tu ressentais ou entendais dans ta tête ?",
    comparison: {
      bad: "❌ Exemple flou :\n'J'ai décidé de me lancer en freelance car je voulais être indépendante.'\n→ C'est plat. On ne voit rien.",
      good: "✅ Exemple incarné :\n'Je me revois, assise dans ce bureau en open space, mon café froid à la main, à fixer mon écran. J'avais encore 37 mails à traiter avant 18h, et une petite voix me soufflait : Tu ne tiendras pas 10 ans comme ça.'\n→ Là on voit la scène. On est avec toi.",
    },
    placeholder: "Je me revois, [lieu], en train de [action]...",
    textareaHeight: "min-h-[150px]",
    aiButtonLabel: "✨ Rendre l'action plus concrète",
    aiStepContext: "L'utilisatrice écrit une scène d'action concrète et visuelle.",
  },
  {
    number: 4,
    icon: "💭",
    title: "Fais parler tes pensées",
    consigne: "Les pensées rendent ton storytelling plus humain. Elles permettent au lecteur de se connecter directement à ton ressenti.",
    helpTitle: "💡 Comment faire ?",
    helpContent: "Choisis un moment où tu as ressenti du stress, du doute ou de l'excitation. Décris la scène en 1-2 phrases, puis ajoute une pensée brute, comme si on était dans ta tête.\n\nFormat simple :\n👉 Je [ce que je fais]. Et là, une voix dans ma tête me dit : '[ta pensée]'.",
    examples: "Je m'apprête à cliquer sur 'publier'. Mon doigt tremble. Et dans ma tête, ça tourne en boucle : 'C'est nul. Personne ne va aimer.'",
    placeholder: "Et là, dans ma tête, je me dis...",
    textareaHeight: "min-h-[150px]",
    aiButtonLabel: "✨ Rendre les pensées plus vivantes",
    aiStepContext: "L'utilisatrice exprime ses pensées intérieures et monologue intérieur.",
  },
  {
    number: 5,
    icon: "💓",
    title: "Montre l'émotion dans le corps",
    consigne: "On ne veut pas juste savoir que tu avais peur. On veut le voir, le ressentir avec toi.",
    helpTitle: "💡 Comment faire ?",
    helpContent: "Comment tes émotions se manifestaient physiquement ?\n• Ton ventre était noué ?\n• Tes mains moites ?\n• Tu respirais fort ?\n• Tu tremblais ?\n• Tu souriais sans t'en rendre compte ?",
    comparison: {
      bad: "❌ Exemple plat :\n'J'étais frustrée par la fast fashion, alors j'ai décidé de créer ma propre marque éthique.'",
      good: "✅ Exemple incarné :\n'Je suis dans la cabine d'essayage d'une grande enseigne. La robe me serre à la taille, le tissu gratte. Je me regarde dans le miroir. Mon ventre se noue, j'ai une boule dans la gorge. En sortant, j'ai su que je ne pouvais plus consommer comme ça.'",
    },
    placeholder: "Dans mon corps, je sentais...",
    textareaHeight: "min-h-[150px]",
    aiButtonLabel: "✨ Incarner davantage l'émotion",
    aiStepContext: "L'utilisatrice décrit les manifestations physiques de ses émotions.",
  },
  {
    number: 6,
    icon: "🎬",
    title: "Structure ton histoire",
    consigne: "Maintenant, on assemble tout. L'IA va prendre tes réponses des étapes 1 à 5 et rédiger ton storytelling complet en suivant la structure narrative.",
    helpTitle: "💡 La structure classique",
    helpContent: "1. Situation classique : ta vie avant le déclic\n2. Élément perturbateur : ce qui vient tout bousculer\n3. Mission : le chemin que tu décides de prendre\n4. Nouveaux défis : ce que tu n'avais pas anticipé\n5. Le moment de doute : quand tout semble perdu\n6. Le déclic : la solution apparaît\n7. Transformation : plus rien n'est comme avant",
    placeholder: "Mon storytelling...",
    textareaHeight: "min-h-[400px]",
    aiButtonLabel: "✨ Générer mon storytelling",
    aiStepContext: "Génération du storytelling complet à partir des 5 étapes précédentes.",
    isGenerateStep: true,
  },
  {
    number: 7,
    icon: "✏️",
    title: "Relis et améliore",
    consigne: "Relis ton storytelling. Ajuste les mots pour qu'ils sonnent vraiment comme toi. C'est le moment de polir.",
    helpTitle: "💡 Conseils",
    helpContent: "Lis-le à voix haute : si ça sonne faux, réécris. Si tu te reconnais, c'est bon.\n\nCe storytelling va devenir ta banque d'histoires. Tu vas pouvoir :\n• Le recycler dans tes posts Instagram\n• L'utiliser dans tes emails\n• Le mettre sur ta page 'À propos'\n• Le raconter en live, en podcast, en interview",
    placeholder: "Mon storytelling...",
    textareaHeight: "min-h-[400px]",
    aiButtonLabel: "✨ Améliorer la fluidité",
    aiStepContext: "L'utilisatrice peaufine son storytelling complet.",
    isPolishStep: true,
  },
  {
    number: 8,
    icon: "🎤",
    title: "Transforme-le en pitch",
    consigne: "Ton storytelling est prêt. Maintenant, on le transforme en pitch : quelques phrases qui résument ton histoire, ton offre, ta mission. Prêt à copier-coller partout.",
    helpTitle: "💡 Un bon pitch, c'est quoi ?",
    helpContent: "Un bon pitch, c'est 3 éléments :\n• Une accroche émotionnelle (un moment de ton histoire)\n• Ce que tu proposes aujourd'hui, pour qui, et pourquoi ça compte\n• Une phrase finale qui incarne ta mission",
    placeholder: "",
    textareaHeight: "min-h-[150px]",
    aiButtonLabel: "✨ Générer mon pitch",
    aiStepContext: "Génération du pitch à partir du storytelling.",
    isPitchStep: true,
  },
];

export const STEP_DB_FIELDS: Record<number, string> = {
  1: "step_1_raw",
  2: "step_2_location",
  3: "step_3_action",
  4: "step_4_thoughts",
  5: "step_5_emotions",
  6: "step_6_full_story",
  7: "step_7_polished",
};
