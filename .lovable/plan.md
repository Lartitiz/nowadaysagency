## Diagnostic

Les derniers logs montrent que Perplexity a bien ramené **6 actus chaudes** en mode scoop, mais l'utilisatrice n'en voit qu'une (le rapport sur les dérives des influenceurs — un sujet qui colle parfaitement à son combat "marketing de la manipulation"). Cannes 2026 et l'affaire Patrick Bruel n'apparaissent pas. Trois causes additionnées :

1. **Perplexity exclut explicitement les "drames intimes" et "violences personnelles"** dans son prompt scoop. Or l'affaire Bruel = accusations publiques contre une personnalité = MeToo. Le système le range dans "fait divers tragique" et le jette à la source.
2. **Pas de quota de diversité catégorielle** côté Perplexity : la requête est très ouverte ("polémique virale, chiffre choc, déclaration publique…") mais sans imposer 1 actu par grande catégorie, Sonar tend à ramener 6 sujets du même registre (rapports/scandales systémiques) — ce qui matche bien le profil de la personne mais rate Cannes (culture/événement en cours) et les MeToo (scandale personnalité).
3. **Biais niche encore présent en scoop** : on passe `intentVibeHints` + `customWords` dans `universKeywords`, et le bloc `scoopBlock` de Claude continue d'imposer un pont vers le profil. Du coup, même quand Perplexity ramène Cannes ou Bruel, Claude les rejette à la curation s'il ne sait pas écrire de pont littéral vers "l'Assistant Com'".

## Plan

Tout reste backend, deux fichiers.

### 1. `supabase/functions/_shared/perplexity.ts` — prompt scoop refondé

- **Réécrire la section "INTERDIT STRICT"** pour autoriser explicitement :
  - Accusations / mises en cause publiques de personnalités connues (témoignages MeToo nommés, enquêtes journalistiques sur figures publiques, mises en examen médiatisées)
  - Grands événements culturels en cours (festivals, cérémonies, sorties film/album marquantes, retours/scandales sur tapis rouge)
  - Polémiques de prise de parole publique (interviews, plateaux, posts viraux d'une personnalité)
  
  Ne garder en exclusion stricte que : faits divers locaux anonymes, drames intimes sans dimension publique, propagande partisane (élections/partis nommés), webinaires/inscriptions, marketing pur.

- **Ajouter un quota de diversité explicite** dans le user prompt : demander à Sonar de renvoyer **6 actus, idéalement 1 par catégorie** parmi (a) scandale/accusation visant une personnalité publique, (b) événement culturel en cours (festival, cérémonie, sortie marquante), (c) polémique société/débat viral, (d) chiffre/rapport/enquête choc, (e) déclaration publique qui fait réagir, (f) affaire judiciaire/économique grand public. "Ne renvoie jamais 3 sujets du même registre."

- **Bumper `max_tokens`** à 2800 en mode scoop pour laisser la place aux 6 actus + résumés.

### 2. `supabase/functions/newsjacking-ai/index.ts` — découpler scoop du profil

- **Couper totalement le biais niche en scoop** : passer `universKeywords: []` (au lieu de `[...intentVibeHints, customWords]`) et garder `niche: undefined`. Les hints scoop sont déjà dans le prompt Perplexity, pas besoin de les rebiaiser.

- **Relâcher la curation Claude dans `scoopBlock`** :
  - Remplacer "force_pont fort à 1/3 minimum" par "moyen acceptable partout, fort optionnel — la priorité est le test 'oh wow', pas la force du pont".
  - Ajouter une règle explicite : "Tu DOIS conserver au moins 4 des actus pré-sourcées si elles passent le test 'oh wow', même si tu ne vois pas de pont littéral vers le profil. Pour ces actus, le champ pertinence devient simplement une PISTE D'ANGLE ouverte (1 phrase qui suggère sur quoi la personne pourrait rebondir), sans citer son métier ni sa cible."
  - Ajouter dans les exemples de "pistes d'angle scoop" valides : "réagir comme citoyenne", "partager son ressenti de spectatrice", "ouvrir le débat sans prendre position pro/contre" — pour dégonfler l'obligation de pont métier.

- **Désactiver l'anti-méta-réseaux-sociaux en scoop** : la règle d'exclusion "Meta/Instagram/TikTok/…" du `macroBlock` ne doit pas s'appliquer si scoopMode est seul actif (sinon on perd des affaires type "TikTok ban", "Meta licencie" qui sont du vrai grand public).

### 3. Vérification

- Tester "Actu choc à rebondir" sur le compte demo.
- Vérifier que la liste affichée contient au moins 1 sujet culture/événement (Cannes, sortie, festival) ET 1 scandale personnalité, en plus des sujets profil-aligned.
- Logs `newsjacking-ai` : on doit voir 6 actus Perplexity, dont la majorité survit à la curation Claude.

## Fichiers touchés

- `supabase/functions/_shared/perplexity.ts` (prompt scoop refondé, quota catégoriel, max_tokens)
- `supabase/functions/newsjacking-ai/index.ts` (universKeywords vidé en scoop, `scoopBlock` relâché, exclusion méta-RS désactivée en scoop pur)

Aucun changement DB, aucun changement UI.
