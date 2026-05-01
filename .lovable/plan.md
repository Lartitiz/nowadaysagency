# Plan — Refonte coach idées : 4 registres + filtre anti-déjà-vu

Périmètre strict : un seul fichier modifié — `supabase/functions/content-coaching/index.ts`. Aucun changement frontend (le composant `src/components/dashboard/ContentCoachingDialog.tsx` mappe déjà dynamiquement `result.ideas`, vérifié lignes 24, 218, 396-400 — il affichera 4 cards sans modification).

---

## (a) Ce que tu m'as demandé — à implémenter

### 1. Remplacement de la section "MÉTHODE" (lignes 290-300)

Suppression du système actuel "3 idées dans 3 catégories parmi A→F". Remplacement par 4 registres **obligatoires et ordonnés** :

- **Idée 1 — EXPERTISE PRATIQUE** : le "comment" du métier ancré terrain. Détail technique précis, savoir-faire, mécanique opérationnelle de l'activité de l'utilisatrice.
- **Idée 2 — CONVICTION / CONTRE-PIED** : opinion tranchée du métier qui dérange aussi les pairs du secteur (pas seulement l'audience). Voir la note spécifique dans le test de singularité.
- **Idée 3 — PERSPECTIVE ÉLARGIE** : regard sur le secteur, mécanisme nommé (biais cognitif, dynamique de marché), mise en tension culturelle/sociétale autour du métier.
- **Idée 4 — ANALOGIE INATTENDUE** : parallèle entre une mécanique du métier et un univers totalement différent (cuisine, sport, artisanat, mécanique, art, science, jeu d'échecs, etc.) qui fait voir le métier autrement.

Les **CREATIVE_SEEDS** et leur tirage `seed1`/`seed2` (lignes ~200-216) restent inchangés ; ils sont juste reformulés dans le prompt comme "contraintes créatives optionnelles à appliquer si pertinent à l'un des 4 registres".

### 2. Ajout du bloc "TEST DE SINGULARITÉ" (avant le TEST DE VALIDITÉ existant ligne 313)

Insertion d'un nouveau bloc encadré, à appliquer aux 4 idées :

> **TEST DE SINGULARITÉ — applique-le sur CHAQUE idée AVANT le test de validité**
>
> Si quelqu'un qui suit 5 comptes du même secteur sur Insta/LinkedIn aurait déjà vu cette idée formulée à peu près comme ça → invalide, recommence.
>
> Pour passer, l'idée doit avoir AU MOINS UN de ces caractères :
> - Un détail technique trop précis pour être générique
> - Un angle qu'aucun·e influenceur·euse du secteur ne prendrait (parce que ça ne flatte pas, parce que c'est trop nuancé pour Insta, parce que ça contredit la doxa du secteur lui-même)
> - Une formulation qui surprend par sa concrétude ou sa franchise
>
> **Note spécifique CONTRE-PIED (Idée 2)** : si le contre-pied dit "tout le monde fait X mal, en vrai il faut Y", c'est probablement déjà vu. Cherche un contre-pied qui dérange les pairs du secteur, pas un contre-pied qui flatte l'audience contre les pairs.

Le bloc TEST DE VALIDITÉ existant (lignes 313-321) reste **strictement intact**, juste après ce nouveau bloc.

### 3. Ajustement de l'instruction utilisateur (ligne 339)

Passage de `"Génère 3 idées..."` à `"Génère 4 idées (1 par registre dans l'ordre : expertise / contre-pied / perspective / analogie)..."`. Ajout du test de singularité dans la liste des règles, qui devient :

```
Applique successivement : (1) AUDIENCE vs UTILISATRICE, (2) RÈGLE DE VÉRITÉ,
(3) RÈGLE D'OR métier, (4) TEST DE SINGULARITÉ, (5) TEST DE VALIDITÉ.
```

### 4. `max_tokens` : 800 → 1200 (ligne 341)

Pour absorber la 4e idée + le test de singularité ajouté au prompt sans risque de troncature JSON.

### 5. Phrase conditionnelle (ligne 305)

- Version "sujet absent" : remplacer "Les 3 idées couvrent" par "Les 4 idées couvrent" et adapter la formulation pour qu'elle se combine naturellement avec la contrainte de 4 registres ordonnés (les registres priment, la diversité d'objectifs reste un bonus).
- Version "sujet présent" : remplacer "3 variations" par "4 variations" et préciser que les 4 idées sont 4 angles RADICALEMENT différents traitant le même sujet sous les 4 registres.

### 6. Mention "3 idées" résiduelle ligne 283

`PAS DE SUJET → propose 3 idées concrètes et surprenantes` → `propose 4 idées concrètes et surprenantes`.

---

## Ce qui NE BOUGE PAS (verrouillé)

- Toutes les sections du système prompt en amont de "MÉTHODE" : RÈGLE DE VÉRITÉ, AUDIENCE vs UTILISATRICE, ALIGNEMENT D'ÉCHELLE, EXIGENCE DE PROFONDEUR, CONTEXTE BRANDING, PILIERS, DATE, HISTORIQUE, DEMANDE, RÈGLE D'OR ANCRAGE MÉTIER, RÈGLE ANTI-TU, ROUTES.
- `CREATIVE_SEEDS` (lignes 200-216) et tirage `seed1`/`seed2`.
- `formatBlock` spécifiques par format (lignes 219-226).
- Bloc TEST DE VALIDITÉ existant (lignes 313-321).
- Structure JSON de sortie (champs `subject`, `angle`, `objective_tag`, `why_it_works`, `recommended_format`, `redirect_route`). Seul `ideas` passe de 3 à 4 entrées.
- Modèle `getModelForAction("coaching")` (= Opus), temperature 0.8.
- Toute la logique aval : parsing JSON 3 niveaux (jsonrepair inclus), backwards compatibility (`recommended_subject` / `subject_alternatives` / `quick_brief`), `logUsage`.
- Toutes les requêtes DB et le bloc auth/CORS/rate-limit/quota.

Aucune autre Edge Function modifiée. Aucun fichier frontend modifié.

---

## Critères de validation

1. `npx tsc --noEmit --skipLibCheck` passe sans erreur.
2. **Test compte démo Auriana (marchande de biens)** : ouvrir "Aide-moi à trouver une idée" dans `/creer`, choisir objectif + Insta carrousel → vérifier 4 cards, 4 registres visiblement différents, au moins une analogie reconnaissable (parallèle inter-univers), pas de contre-pied "déjà vu" du secteur.
3. **Test compte démo Léa (photographe)** : même procédure, vérifier la diversité des 4 registres et la singularité de chacun.
4. Logs Edge Function : pas de fallback `jsonrepair` qui se déclenche (pas de troncature liée au passage à 1200 tokens).

---

## (b) Mes propositions d'amélioration — à valider/refuser séparément

### P1 — Ajouter `register` au schéma JSON de sortie (recommandé)

Ajouter un champ `register: "expertise" | "contre-pied" | "perspective" | "analogie"` dans chaque objet `ideas[i]`. Coût : 1 ligne dans le JSON example du prompt + une mention dans l'instruction. Bénéfice : (1) garantit que le LLM tient l'ordre/registre demandé (auto-vérification), (2) permet plus tard un codage couleur ou un tri par registre côté UI sans re-parser. Aucun impact frontend immédiat (champ ignoré si absent du type).

### P2 — Log structuré du registre généré (faible coût, gros bénéfice debug)

Si P1 est validé : ajouter un `console.log("content-coaching registers:", result.ideas?.map(i => i.register))` juste avant le `logUsage`. Permet de monitorer en prod si Opus respecte bien la contrainte des 4 registres distincts. Aucun coût utilisateur.

### P3 — Garde-fou côté serveur si moins de 4 idées renvoyées

Si Opus renvoie moins de 4 idées (rare mais possible avec un sujet contraignant + historique chargé), le frontend affichera silencieusement 2 ou 3 cards. Proposition : si `result.ideas.length < 4` après parsing, on log un `console.warn` (sans bloquer la réponse). Permet de détecter en prod un drift du modèle sans impacter l'UX. ~3 lignes.

### P4 — Renforcer la diversité vs `recentPosts` (optionnel, plus risqué)

L'historique injecté (`calendarPosts` + `generatedContent`) est déjà cité "NE PAS REPROPOSER". On pourrait pousser plus loin : "et même les ANGLES déjà couverts (expertise / contre-pied / etc.) sont à éviter en priorité". Risque : si l'historique contient déjà 1 contre-pied, Opus pourrait skipper le registre 2 alors qu'on le demande explicitement. **Mon avis : à NE PAS faire pour cette itération**, on verra après prod si l'anti-répétition pose vraiment problème.

---

## Hors scope (rappel — plans séparés à venir)

- Injection de la matière `content_briefs` dans le prompt
- Alignement sur les 4 véhicules d'EMBEDDED_EDUCATION
- Rattachement de chaque idée à un pilier éditorial
- Mode "Surprise" (canal+format auto)
- Refonte UI des cards (codes couleur par registre)
- Audit `calendar-coaching`
