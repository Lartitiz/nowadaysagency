// Déplacé à l'identique depuis _shared/format-briefs.ts (lot 1 du découpage, 14/10/2026,
// docs/robustesse/gros-fichiers.md fiche 10). format-briefs.ts le réexporte.

export function carouselBrief(): string {
  return `FORMAT : CARROUSEL INSTAGRAM (8 slides minimum)

══ AVANT D'ÉCRIRE : LE CARROUSEL N'EST PAS UNE LISTE ══

Le piège n°1 des carrousels IA : transformer un sujet en "5 conseils" ou "7 erreurs" où chaque slide est un tip numéroté. Ce format est mort. L'algorithme le catégorise comme générique, le lecteur le scrolle.

Un bon carrousel raconte un MOUVEMENT : situation → tension → compréhension → ouverture.
Chaque slide fait AVANCER ce mouvement. Pas "Conseil 1... Conseil 2..." mais "Voilà ce qui se passe... Voilà pourquoi... Voilà ce que ça change...".

AVANT DE RÉDIGER, identifie :

1. QUEL EST L'ARC NARRATIF ?
   - Récit d'expérience → situation de départ → ce qui s'est passé → ce que ça a révélé
   - Déconstruction → croyance répandue → pourquoi elle existe → pourquoi elle est fausse → ce qui est vrai
   - Coulisses/process → le résultat visible → ce qu'on ne voit pas derrière → les choix et les galères → la leçon
   - Prise de position → constat terrain → pourquoi ça pose problème → ce que ça devrait être → invitation

2. QUEL EST LE HOOK VISUEL (Slide 1) ?
   Pas un titre ("5 erreurs de..."). Une PHRASE qui crée une tension, une curiosité, un décalage.
   ❌ "5 erreurs de communication à éviter"
   ❌ "Comment créer du contenu qui engage"
   ✅ "J'ai perdu ma meilleure cliente en mars."
   ✅ "Tout le monde te dit de poster tous les jours. C'est probablement le pire conseil."
   ✅ "Ce que j'aurais aimé savoir avant de lancer mon premier carrousel."

3. OÙ EST LA PROFONDEUR ?
   Au moins 2 slides doivent contenir un DÉTAIL CONCRET : un chiffre, un cas client, une phrase entendue, un avant/après mesurable. C'est ce qui fait la différence entre un carrousel "tips qu'on a déjà lus 100 fois" et un carrousel "elle sait de quoi elle parle".

══ RÈGLES DE RÉDACTION ══

STRUCTURE DES SLIDES :
- Slide 1 (couverture) : une accroche de 4 à 10 mots qui crée la tension, plus au besoin un sous-titre de 12 mots maximum. Rien d'autre. PAS de titre-étiquette.
- Slide 2 : deuxième accroche, compréhensible sans la slide 1 (Instagram peut ouvrir le carrousel directement dessus).
- Slides 3-7 : chacune a un RÔLE dans l'arc narratif (pas un numéro de conseil).
  Chaque slide = 2-4 phrases qui DÉVELOPPENT le point. Pas un header + une ligne.
- Slide finale : punchline mémorable qui OUVRE (pas qui résume) + CTA léger.
- TOTAL : 1500-3000 caractères de contenu textuel (slides + caption).

SLIDE DE PROFONDEUR (obligatoire) :
Au moins 1 slide doit être un "zoom" : UN point creusé avec un exemple terrain, un cas réel, ou une analyse fine.

INTERDITS :
- Numéroter les conseils ("Conseil 1", "Erreur n°2", "Astuce 3")
- Slides d'une seule phrase ou d'un seul mot
- Toutes les slides de la même longueur (varier le rythme)
- Slide qui reformule la précédente
- Punchlines isolées style broetry

Formate le contenu avec des marqueurs clairs :
📌 SLIDE 1 : [contenu]
📌 SLIDE 2 : [contenu]
etc.
Après les slides, ajoute :
📝 CAPTION : [hook différent de slide 1 + corps + CTA + hashtags]`;
}
