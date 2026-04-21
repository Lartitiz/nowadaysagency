

## Bug : "PowerPoint éditable" absent du menu Télécharger sur le calendrier

### Diagnostic

Dans `CalendarPostPreview.tsx` ligne 171, le handler PPTX éditable est conditionné à `visualHtml`. Mais sur les posts du calendrier déjà générés, on stocke les **PNG rendus** (`visual_urls` dans Storage) — pas le `visualHtml` source. Résultat : `onPptxEditable = undefined` → l'option disparaît silencieusement.

C'est attendu techniquement (le moteur hybride a besoin du HTML pour capturer le fond + injecter le texte natif), mais c'est incohérent côté UX : on a promis "2 options identiques partout".

### Vérification rapide

Avant de coder, je vérifie d'où viennent `visualUrls` et `visualHtml` côté calendrier (depuis quelle table / quelle requête), pour confirmer si on peut récupérer le HTML d'origine quand seules les URLs sont en BDD. Il y a 3 cas possibles :

- **Cas A** : le HTML est aussi stocké en BDD à côté des URLs → bug pur de transmission de prop. Fix : passer `visualHtml` au composant en plus de `visualUrls`. **Trivial.**
- **Cas B** : le HTML n'est PAS stocké, seulement les PNG → on ne peut pas générer d'éditable. Deux options à arbitrer (voir plus bas).
- **Cas C** : le HTML est récupérable via une nouvelle requête (ex. table `posts_visuals` avec colonne `html`) → fix moyen, on fetch à la volée si l'utilisateur clique.

### Solution selon le cas

**Si Cas A** (HTML déjà disponible) :
- Passer `visualHtml` à `CalendarPostPreview` partout où il est disponible.
- Garder `visualUrls` pour l'affichage (plus rapide), utiliser `visualHtml` pour les exports.
- L'option éditable réapparaît automatiquement.

**Si Cas B** (HTML non stocké) — deux choix utilisateur :
1. **Stocker le HTML aussi** lors de la génération initiale (migration : ajouter colonne `visual_html jsonb` sur la table concernée). Coût : un peu de BDD en plus, mais c'est la voie propre.
2. **Cacher proprement l'option** côté calendrier en affichant une note discrète ("PowerPoint éditable disponible depuis l'atelier") — moins satisfaisant mais zéro travail.

**Si Cas C** (HTML fetchable séparément) :
- Lazy-fetch au clic : on récupère le HTML uniquement quand l'utilisateur clique sur "PowerPoint éditable".
- Loader pendant le fetch + génération.

### Étapes

1. Tracer la source de `visualUrls` vs `visualHtml` côté calendrier (quel composant parent passe ces props, quelle requête les charge, quelle table BDD les stocke).
2. Identifier le cas (A/B/C).
3. Appliquer le fix correspondant.

### Fichiers potentiellement touchés

| Fichier | Changement probable |
|---|---|
| `src/components/calendar/CalendarPostPreview.tsx` | Logique d'activation de `onPptxEditable` selon le cas |
| Composant parent du calendrier qui passe les props | Transmission du `visualHtml` si Cas A |
| Hook/requête qui charge les visuels du post | Inclure `visual_html` dans le SELECT si Cas A/C |
| Migration SQL | Si Cas B option 1, ajout colonne `visual_html` |

### Question pour toi

Avant que je propose le fix définitif, j'ai besoin de savoir : **les posts du calendrier que tu télécharges aujourd'hui ont été générés AVANT ou APRÈS le passage au système de stockage PNG côté serveur ?**

- Si tous tes posts récents sont en PNG-Storage uniquement → on est probablement en Cas B et il faudra décider entre stocker le HTML aussi (recommandé) ou cacher l'option proprement.
- Si certains posts ont encore le HTML en BDD → c'est juste un bug de prop, fix en 5 min.

Dis-moi et j'enchaîne avec le plan d'exécution exact.

