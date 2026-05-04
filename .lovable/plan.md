
# Audit "Création d'idées de contenu" + plan d'amélioration "waouh"

## 1. État des lieux — comment les idées sont générées aujourd'hui

L'utilisatrice a **3 entrées** pour démarrer une création :

```text
/creer
 ├── Tape un sujet (champ libre) ──▶ creative-flow step="angles" (3 angles éditoriaux)
 ├── "Pas d'idée ? Laisse-toi guider" ──▶ content-coaching (4 idées)
 └── "Surfer sur l'actu" ──▶ newsjacking-ai
```

### Ce qui marche déjà très bien
- `content-coaching` impose **4 registres ordonnés** (expertise / contre-pied / perspective / analogie) → bonne armature anti-monotonie.
- Règles strictes : RÈGLE DE VÉRITÉ (zéro chiffre inventé), AUDIENCE vs UTILISATRICE, alignement d'échelle (pas Hermès si solopreneuse), TEST DE SINGULARITÉ, anti-listicle.
- Mémoire anti-répétition : historique des 8 derniers `calendar_posts` + 8 derniers `generated_carousels` injecté dans le prompt.
- `EDITORIAL_ANGLES_REFERENCE` : 14 angles avec structures par format, très solide.
- `CREATIVE_SEEDS` aléatoires (12 variantes) injectées 2 à la fois pour forcer la variété entre sessions.

### Ce qui plafonne aujourd'hui (limites observées dans les prompts)

**A. Les 4 registres sont rigides et **prévisibles** une fois qu'on en a vu 2-3 séries**
Toujours dans le même ordre, toujours les mêmes 4 angles. Une utilisatrice qui demande 3 sessions d'idées voit 12 idées qui suivent toutes le même squelette mental.

**B. Pas d'ancrage à la matière vivante de l'utilisatrice**
Le prompt utilise `activite`, `cible`, `mission`, `piliers`, `voice` — mais **pas** :
- ses **personas** (table `personas`) avec frustrations / désirs / objections détaillés
- ses **storytellings sauvegardés** (anecdotes vécues, déclics, galères) → matière première narrative
- ses **offres** détaillées (transformations, prix, blocages clients)
- ses **commentaires / DM reçus** (s'il y en a) → vrai langage de la cible
→ Les idées restent intelligentes mais "abstraites", pas branchées sur des **scènes vécues**.

**C. Pas de "tension dramatique" obligatoire**
Le prompt demande "un mécanisme nommable", "une tension précise" — mais ce sont des options ("au moins 1 sur 3"). Conséquence : beaucoup d'idées restent au niveau "concept intéressant" sans **conflit interne** ni **enjeu personnel** identifiable.

**D. Les 14 angles éditoriaux ne sont jamais **mixés** intentionnellement**
Le système choisit UN angle. Or les idées les plus marquantes naissent souvent d'**intersections inattendues** (ex : Build in public × Mythe à déconstruire = "Le mois où mes prix ont baissé alors que j'augmentais ma valeur perçue").

**E. Pas de "lentille" provocante en option**
Aucun mécanisme pour proposer des angles déclarés provocants, contrariants, ou "pensée latérale". L'utilisatrice ne peut pas demander "pousse plus loin" ou "fais-moi peur, donne-moi le truc que personne n'osera poster".

**F. Pas de profondeur **temporelle****
Aucune idée ne s'ancre sur "où est l'utilisatrice MAINTENANT dans son parcours" (lancement en cours, saison creuse, pivot, fatigue). Les idées sont génériques "atemporelles".

**G. Pas d'exemples de "wow ideas"**
Le prompt dit "trouve THE idée" mais ne montre **aucun exemple concret** d'idée wow. Les LLM bénéficient énormément de few-shot — surtout sur du jugement éditorial.

---

## 2. Plan d'amélioration — 6 chantiers

### Chantier 1 — Enrichir le contexte de génération avec la matière vivante
**Fichier** : `supabase/functions/content-coaching/index.ts`

Ajouter en parallèle des fetchs existants :
- 2-3 personas actifs (`personas` table) → frustrations, désirs, objections, vocabulaire
- 3-5 storytellings sauvegardés (`storytelling_briefs` ou équivalent) → anecdotes réelles utilisables
- 1-2 offres principales (`offers` ou `brand_profile.offer`) → transformations promises
- Phase utilisateur (`use-user-phase`) → pré-lancement / lancement / post-lancement / cruise

Injecter dans le prompt sous un nouveau bloc :
```text
══ MATIÈRE VIVANTE DE L'UTILISATRICE ══
Personas : [...]  Storytellings disponibles : [titres + 1 ligne chacun]
Offre principale : [titre + transformation]  Phase actuelle : [...]
RÈGLE : au moins 2 idées sur 4 doivent s'ancrer dans cette matière
(citer un persona précis OU rebondir sur une anecdote OU servir l'offre).
```

### Chantier 2 — Banque de "lentilles narratives" interchangeables
**Fichier** : `supabase/functions/content-coaching/index.ts` + nouveau bloc dans `_shared/copywriting-prompts.ts`

Remplacer la liste fixe `4 registres ordonnés` par un **pool de 10-12 lentilles** parmi lesquelles 4 sont **tirées au sort par session** :

```text
LENTILLES DISPONIBLES (pool) :
- EXPERTISE PRATIQUE — geste métier précis
- CONTRE-PIED INTRA-MÉTIER — qui dérange les pairs
- PERSPECTIVE ÉLARGIE — mécanisme nommé
- ANALOGIE INATTENDUE — autre univers qui éclaire
- CONFESSION COÛTEUSE — ce que ça lui a vraiment coûté
- OBSERVATION SILENCIEUSE — ce qu'elle remarque mais que personne ne dit
- MICRO-SCÈNE — moment de 30 secondes précis et sensoriel
- QUESTION TABOUE — question que la cible se pose mais n'ose pas
- ARCHIVE / RETOUR EN ARRIÈRE — comparaison avec un état passé
- INVERSION — et si on faisait exactement l'inverse de ce qu'on fait ?
- RÉVÉLATION DE COULISSES — ce qui se passe avant/après l'image polie
- INTERSECTION D'ANGLES — combinaison de 2 angles éditoriaux du référentiel
```

Tirer 4 lentilles différentes par appel (graine basée sur la date + user_id pour éviter la pure aléa qui désoriente, mais varier sur 7 jours).

### Chantier 3 — Profondeur obligatoire (3 niveaux à valider par idée)
**Fichier** : `content-coaching/index.ts` (prompt)

Renforcer le TEST DE PROFONDEUR en le rendant **obligatoire et tri-axial** (au lieu de "au moins un sur trois") :

```text
Chaque idée DOIT cocher EXPLICITEMENT (en interne) ces 3 cases avant d'être validée :
1. TENSION : conflit / paradoxe / dilemme nommé en 1 phrase
2. ENJEU PERSONNEL : ce que ça change pour la lectrice si elle adopte / refuse l'idée
3. PREUVE D'ANCRAGE : un détail concret (chiffre sourçable, scène précise, observation terrain)
   → si 1 case non-cochable, l'idée est invalide, reformule.
```

Ne pas **afficher** les 3 cases dans le JSON utilisateur — juste les imposer en chain-of-thought silencieux.

### Chantier 4 — Mode "Pousse plus loin" / "Sors des sentiers battus"
**Fichiers** : `ContentCoachingDialog.tsx` + `content-coaching/index.ts`

Dans le résultat (4 idées), ajouter un **bouton secondaire** "🔥 Pousse plus loin" qui relance avec un paramètre `intensity: "bold"`.

Côté prompt, activer un bloc supplémentaire :
```text
MODE PROVOC ACTIVÉ :
- Les 4 idées doivent contenir un élément qui "fait peur à publier" pour la moyenne des solopreneuses
- Au moins 1 idée doit contredire frontalement une opinion mainstream du secteur
- Au moins 1 idée doit assumer une vulnérabilité (échec, doute, prix payé)
- Au moins 1 idée doit prendre position sur un sujet politique/éthique du métier
- Toujours dans les limites de ETHICAL_GUARDRAILS (pas de manipulation, pas de honte forcée)
```

### Chantier 5 — Few-shot d'idées "wow" calibrées
**Fichier** : `_shared/copywriting-prompts.ts` (nouveau bloc `WOW_IDEA_EXAMPLES`)

Ajouter 6-8 exemples d'idées waouh, chacun annoté :
```text
EXEMPLE (céramiste, cible : femmes 30-45 sensibles à l'artisanat)
Idée tiède (à éviter) : "3 erreurs quand on choisit sa vaisselle"
Idée waouh : "Le bol qui m'a fait pleurer à 2h du mat — pourquoi je ne fais
plus de pièces 'parfaites'"
Pourquoi ça marche : tension émotionnelle nommée + scène précise + position
métier qui dérange (rejet de la perfection comme valeur), ancrée dans un
vécu plausible.
```

Couvrir 6 secteurs (artisanat, coaching, conseil, immobilier, bien-être, mode) pour que le LLM puisse extrapoler.

### Chantier 6 — UI : afficher la "carte d'identité" de chaque idée
**Fichier** : `ContentCoachingDialog.tsx`

Aujourd'hui chaque idée affiche : subject + angle + why_it_works. Ajouter visuellement :
- Un **tag "lentille"** coloré (couleur cohérente par lentille)
- Le **niveau d'audace** (🌱 Sûr / 🔥 Risqué / 💥 Provoc) basé sur un nouveau champ `boldness: "safe"|"bold"|"provoc"`
- Un mini-bouton **"Réécris en plus radical"** par idée (relance ciblée 1 idée seulement)

Côté prompt, ajouter ces deux champs au schéma JSON de sortie :
```json
{
  "subject": "...", "angle": "...", "lens": "MICRO-SCÈNE",
  "boldness": "bold", "objective_tag": "...", "why_it_works": "..."
}
```

---

## 3. Détails techniques

**Ordre de mise en œuvre suggéré (du plus impactant au moins risqué) :**
1. Chantier 3 (profondeur 3-axes) — gain immédiat sur toutes les idées, modif de prompt seul
2. Chantier 5 (few-shot wow) — gain immédiat, prompt seul
3. Chantier 2 (lentilles tournantes) — gros gain de variété, prompt seul
4. Chantier 1 (matière vivante) — nécessite des fetchs supplémentaires (vérifier RLS / workspace owner)
5. Chantier 4 (pousse plus loin) — backend + 1 bouton frontend
6. Chantier 6 (UI carte d'identité) — frontend + extension du schéma JSON

**Risques** :
- Chantier 1 : si `personas` ou `storytelling_briefs` sont vides, fallback obligatoire vers comportement actuel (déjà géré pour profile sparse).
- Chantier 4 : ETHICAL_GUARDRAILS doit primer — ajouter un re-check explicite avant retour.
- Chantier 5 : risque de pastiche si exemples trop spécifiques → exemples doivent rester archétypaux.

**Pas touché** : `creative-flow` step="angles" (3 angles à partir d'un sujet déjà choisi) — il fonctionne bien, on peut éventuellement lui appliquer Chantier 5 plus tard si tu veux.

**Métriques à suivre après déploiement** : taux de "Régénérer" sur les idées (devrait baisser), taux de passage idée → format → génération (devrait monter), feedback qualitatif utilisatrice.

---

## Hors scope (à reprendre si besoin)
- Refonte de `creative-flow` step="angles" (les 3 angles) — bon état actuel
- Newsjacking — flow séparé, audit dédié si tu veux
- IdeasPage (la liste des idées sauvegardées) — UX uniquement, pas génération
