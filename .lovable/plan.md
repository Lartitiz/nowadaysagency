# Stopper les inventions du post LinkedIn en mode photo

## Diagnostic (cause racine)

Dans `supabase/functions/creative-flow/index.ts` lignes 1254-1307, la branche `generate` en mode photo construit le prompt avec **uniquement** :
- les images
- `formatBrief` (texte générique du format)
- `body.photo_description` (description globale)
- `modeInstr` (avant/après ou série)

→ **Les `answers` de l'étape questions ne sont JAMAIS injectées** dans ce prompt. Le modèle ne voit donc que les photos + le sujet, sans la matière concrète fournie par l'utilisatrice. Résultat : Claude comble en inventant prénoms, scènes, chiffres, citations.

À l'inverse, la branche `generate` non-photo (ligne 395) injecte bien un `answersBlock`.

Secondaire : aucune garde explicite "n'invente pas" n'est présente dans le prompt vision.

## Correctif (1 fichier)

### `supabase/functions/creative-flow/index.ts` lignes 1296-1299

Avant le bloc texte final, construire un `answersBlock` à partir de `body.answers` (déjà déstructuré en haut du fichier) :

```ts
const answersBlock = (answers && answers.length > 0)
  ? answers.map((a: any, i: number) =>
      `Q${i + 1} : "${a.question}"\n→ "${a.answer}"`
    ).join("\n\n")
  : "";
```

Puis l'injecter dans le `text` final, avec une **garde anti-fabrication** explicite :

```
${formatBrief}
${body.photo_description ? `\nDescription globale de l'utilisatrice : "${body.photo_description}"` : ""}
${answersBlock ? `\n\n══ RÉPONSES DE L'UTILISATRICE (matière SOURCE — utilise-les) ══\n${answersBlock}` : ""}
${modeInstr}

══ RÈGLE ANTI-FABRICATION (CRITIQUE) ══
- N'invente AUCUN détail non vérifiable : prénom, chiffre, citation, lieu, date, nom de client/projet, sentiment précis, dialogue.
- Tu peux UNIQUEMENT utiliser : (1) ce que tu VOIS sur les photos, (2) la description globale, (3) les réponses ci-dessus.
- Si une info manque pour étoffer, reste sur du registre méta / observation / réflexion plutôt que d'inventer une anecdote.
- Préfère "on voit", "il y a", "ça raconte", "ce que ça dit de…" à "ce jour-là, Marie m'a dit…" si la scène n'est pas dans les réponses.
- Si l'utilisatrice n'a pas donné d'anecdote précise, fais un post RÉFLEXIF / méta sur ce que les photos évoquent, pas un récit fictif.

⚠️ INTERDICTION ABSOLUE de recopier un exemple textuel. Génère du contenu ORIGINAL ancré dans CES image(s), CE sujet, ET les réponses fournies.

Réponds UNIQUEMENT en JSON :
${jsonShape}
```

### Bonus : pass de correction LinkedIn

Si `supabase/functions/_shared/correction-pass.ts` est appliquée au mode photo LinkedIn, ajouter une règle "détecte les prénoms / chiffres / citations qui n'apparaissent ni dans les réponses ni dans la description → les retirer ou les remplacer par du méta". À vérifier en lisant le fichier ; si la passe n'est pas branchée sur le mode photo, on n'y touche pas dans ce ticket.

## Hors scope

- Pas de changement frontend (les `answers` sont déjà envoyées via `streamBody.answers` dans `use-content-generator.ts` ligne 722)
- Pas de changement à l'étape `questions` (déjà ancrée vision)
- Pas de migration DB, pas de Zod (`answers` déjà accepté)
- Pas de changement de modèle Claude

## Test après correction

1. Créer un contenu → Partir de photos → 3-4 photos → Post LinkedIn
2. Répondre aux questions avec des phrases courtes / vagues
3. Vérifier que le post généré :
   - ne contient AUCUN prénom inventé qui n'est ni dans les réponses ni visible sur la photo
   - ne contient AUCUN chiffre / citation / scène fictive
   - bascule en ton méta-réflexif si les réponses sont pauvres, au lieu d'inventer un récit
4. Tester avec des réponses riches → le post doit reprendre fidèlement la matière fournie
