# Audit : les attentes qui paraissent plus longues qu'elles ne le sont

> 13/11/2026, lecture seule (aucun code modifié). Point de départ : le reel de
> /creer (téléphone rose vide et phrases qui tournent pendant 1 à 2 min), corrigé
> dans une autre session. **Le reel est exclu de cet audit.**
>
> Règle de tri (Laetitia) : d'abord les parties importantes (carrousel, idées,
> actualité, vidéo, création /creer) et ce dont se servent au moins 3 clientes en
> 60 jours. Usage tiré des relevés du 15 et du 17/10/2026
> (`~/Developer/GitHub/plan-simplicite-creation.md`, section 1.7).

## 1. Ce qui marche déjà bien (les modèles)

| Écran | Ce qu'on voit pendant l'attente | Où |
|---|---|---|
| Rédaction du carrousel | Les titres des slides prévus dès qu'ils sont prêts, puis les slides en brouillon (grisées) au fil de l'écriture, durée totale annoncée + chrono « Déjà X s » | `CarouselDraftPreview.tsx`, événements `outline` / `draft` de `carousel-ai`, `GenerationTimeHint.tsx` |
| « Trouver une idée » | Chaque idée apparaît dès qu'elle est prête (1re vers 50 s, 4e vers 60 s) | `content-coaching` avec `stream: true`, `src/lib/content-coaching-stream.ts` |
| Post Instagram et texte Pinterest de /creer | Le vrai texte s'écrit sous les yeux | `useStreamingInvoke`, `streamDefaultPostSSE` |
| Carrousel « photos brutes » | La liste réelle des slides avec leur état (fait / en cours / à venir) | `PhotoDumpProgress.tsx` |
| Studio visuel (images) | « Création en cours : compte environ 1 minute par image » | `StudioMessageList.tsx` |

Le point commun : **on montre ce qu'on sait déjà** (un plan, un brouillon, une
première idée) **et une durée honnête avec le temps écoulé**.

## 2. Recensement des attentes de plus de ~10 s (parties importantes)

| Écran / bouton | Fonction serveur | Durée réelle connue | Ce que l'écran montre | Verdict |
|---|---|---|---|---|
| Fin de l'onboarding : « mon diagnostic » | `deep-diagnostic` | Inconnue en chiffres. Budget : lecture du site jusqu'à 55 s + IA jusqu'à 90 s ; délai écran 120 s (sans source) ou 180 s (avec site/Instagram) | Phrases qui tournent puis restent figées sur la dernière, barre, astuces. **À 15 s : « Ça prend plus de temps que prévu », à 30 s : « C'est un peu long… je prépare un diagnostic simplifié »**. Aucune durée annoncée. | 🔴 à corriger |
| Coaching de la fiche de marque (chaque question) | `branding-coaching` (modèle le plus lent, délai écran 250 s) | Inconnue. Une question = une réponse complète de l'IA (question suivante + tout ce qui a été rangé dans la fiche) | Une roue + une phrase (« Je réfléchis à ma prochaine question… ») | 🟠 à mesurer d'abord |
| Carrousel : mise en forme des visuels | `carousel-visual` | ~25 s, ~50 s en rédaction la plus soignée (commentaire du code) ; jusqu'à 3 à 7 min pour beaucoup de photos (délais 180 / 300 / 420 s) | 4 rectangles qui pulsent, « 2/3 lots prêts » (vrai), barre, « compte une vingtaine de secondes » | 🟠 améliorable |
| /creer : stories | `creative-flow` (rédaction puis relecture) | ~50 s (`GenerationTimeHint.tsx`) | 3 rectangles gris, phrases qui tournent, barre simulée, « environ 1 minute. Déjà X s » | 🟠 même défaut que le reel |
| /creer : post LinkedIn, newsletter | `creative-flow` (rédaction, puis relecture qui reprend tout) | « Moins d'une minute », pire cas ~135 s | Lignes grises, phrases, la vraie étape « Relecture finale » s'affiche, barre. **Pas de texte en flux** (contrairement au post Instagram) | 🟠 améliorable |
| Carrousel photo / mixte : « D'abord le plan des slides » | `carousel-ai` (`structure_proposal`) | 55 à 72 s, jusqu'à 160 s (mesures des 09-10/10) | Phrases, barre, durée honnête + chrono, message si relance à 85 s | 🟡 honnête mais vide |
| Vidéo du Studio | `studio-video` (fournisseur Higgsfield) | Inconnue | « Génération en cours… » sans durée ni chrono | 🟡 |
| Réagir à une actualité | `newsjacking-ai` (180 s), puis `newsjacking-angles` | « 30 à 60 secondes », jusqu'à 2 min | Roue, étape, compteur de secondes, « jusqu'à 2 min, c'est normal » | 🟡 honnête mais vide |

Vus et non retenus (moins de 3 clientes en 60 jours, rien de perdu) : audits
Instagram et site, « Préparer ma semaine », recyclage, S'inspirer, brouillon
rapide du calendrier, épingles Pinterest, Coach IA.

## 3. Les pistes, par priorité

### 1. Le diagnostic de fin d'onboarding 🔴 (site seulement)

- **Qui** : toutes les inscrites (71 sur 77 finissent les questions). C'est la
  première impression de l'outil.
- **Aujourd'hui** : `src/components/onboarding/DiagnosticLoading.tsx`. Aucune
  durée annoncée. Les phrases s'arrêtent sur « Je prépare quelque chose de
  personnalisé… ». Dès 15 s, l'écran dit que c'est plus long que prévu, et dès
  30 s qu'un diagnostic simplifié se prépare, alors que l'IA met normalement
  plus longtemps que ça. La personne croit que ça plante au moment où tout va bien.
- **Piste la plus légère** :
  1. annoncer une durée honnête dès le départ, avec le temps écoulé (même
     composant que /creer) ;
  2. retirer les deux messages d'alarme, et n'en garder qu'un, vers 2 min ;
  3. afficher tout de suite ce qu'on sait déjà : un récapitulatif de ses
     réponses (activité, objectif, canaux, site ou Instagram à lire), puis
     cocher « site lu » quand c'est vrai.
- **Avant** : mesurer la vraie durée sur un parcours compte neuf (avec et sans
  site), pour écrire le bon chiffre.
- **Déploiement** : site seulement (publier dans Lovable), zéro demande à l'agent.

### 2. Les stories, le post LinkedIn et la newsletter de /creer 🟠 (fonction serveur)

- **Qui** : l'ensemble des textes de /creer, 42 créations par 5 clientes en
  60 jours, post Instagram compris (qui s'écrit déjà en flux). La part des
  seules stories, LinkedIn et newsletter n'est pas comptée : à relever avant.
- **Aujourd'hui** : rectangles ou lignes gris et phrases qui tournent pendant
  ~1 min. Le serveur a pourtant un texte complet dès la fin de la rédaction,
  avant la relecture qualité : on le garde caché.
- **Piste** : la même que pour le reel. Envoyer le brouillon dès que la
  rédaction est finie (événement `draft`), l'afficher grisé pendant la relecture
  (« Je relis ton texte »), puis le remplacer par la version finale.
- **Déploiement** : `creative-flow` à redéployer, donc une demande Lovable.
  **À grouper avec le reel** dans la même demande (même fonction serveur, et
  une seule demande par session).

### 3. La mise en forme des visuels du carrousel 🟠 (fonction serveur)

- **Qui** : 11 mises en forme par 8 clientes. Le carrousel est le format le plus créé.
- **Aujourd'hui** : le serveur dessine les slides par lots et dit déjà « 2/3 lots
  prêts », mais les slides finies restent cachées jusqu'au dernier lot.
- **Piste** : envoyer le dessin de chaque lot dès qu'il est prêt et l'afficher à
  la place des rectangles gris. Avec beaucoup de photos (jusqu'à 7 min), c'est
  là que ça change le plus.
- **Déploiement** : `carousel-visual` à redéployer, donc une demande Lovable.

### 4. Le coaching de la fiche de marque 🟠 (mesurer d'abord)

- **Qui** : 95 passages par 13 clientes, l'outil le plus utilisé après /creer.
- **Aujourd'hui** : entre deux questions, une roue et une phrase. La durée
  n'est connue nulle part. Chaque question passe par le modèle le plus lent,
  qui renvoie aussi tout ce qu'il a rangé dans la fiche.
- **Piste** : d'abord mesurer (quelques réponses sur le compte test). Si c'est
  plus de 10 s : montrer tout de suite ce qu'on sait (sa réponse cochée dans
  la liste des sujets couverts), puis faire arriver la question en flux avant
  le rangement dans la fiche (serveur).
- **Déploiement** : mesure sans code. Correctif léger = site seulement ;
  question en flux = `branding-coaching`, donc une demande Lovable.

### 5. Le plan du carrousel photo ou mixte 🟡 (site, puis serveur)

- **Qui** : ~5 clientes (3 carrousels photo, 2 mixtes).
- **Aujourd'hui** : honnête (« environ une minute », chrono), mais rien à voir
  pendant 1 à 2 min.
- **Piste** : site seulement, montrer ses photos en vignettes avec le sujet
  (« Voici ce que je regarde »), sans fausse coche photo par photo. Plus tard,
  côté serveur, envoyer les titres du plan dès qu'ils sont prêts (le même
  événement `outline` existe déjà pour la rédaction).

### 6. La vidéo du Studio 🟡 (site seulement)

- **Qui** : peu de clientes (3 vidéos par mois en Premium), mais c'est une
  partie importante.
- **Aujourd'hui** : « Génération en cours… », sans durée ni temps écoulé.
- **Piste** : annoncer une durée, montrer le temps écoulé et dire que le clip
  l'attendra dans sa bibliothèque si elle quitte la page (c'est déjà vrai). Il
  faut d'abord relever une durée réelle sur un clip d'essai déjà payé.

### 7. Réagir à une actualité 🟡 (fonction serveur)

- **Qui** : 0 cliente en 60 jours, mais c'est une partie importante.
- **Aujourd'hui** : honnête (étape, secondes, « jusqu'à 2 min »).
- **Piste** : afficher chaque actualité dès qu'elle est trouvée, comme les
  idées en flux. `newsjacking-ai` à redéployer. À garder pour plus tard, tant
  que personne ne s'en sert.

## 4. Les routines l'auraient-elles vu ?

Non. La visite du matin vérifie que les écrans marchent, pas combien de temps
ils font attendre, et PostHog (`content_generation_timing`) est presque vide.
Seule la durée des carrousels est gardée en base (bilan du lundi). Sonde
possible (à proposer, ne pas ajouter sans accord) : une ligne au bilan du
lundi avec la durée médiane du diagnostic et des textes, à partir de ce qui
est déjà enregistré, si une durée y est gardée. Sinon, rien.

## 5. Angles morts

- Les durées du diagnostic, du coaching de la fiche et de la vidéo ne sont
  écrites nulle part : les chiffres de ce rapport sont des délais maximums,
  pas des mesures.
- Sur téléphone, les rectangles gris prennent tout l'écran : l'attente y paraît
  encore plus vide.
