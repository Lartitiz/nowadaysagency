

## Bug : la légende LinkedIn d'un carrousel mixte (avec photos) ne contient que l'accroche

### Diagnostic complet

C'est un **trou dans le flow** côté front, prévu côté back mais jamais implémenté.

**Côté edge function `carousel-ai`** (`buildMixCarouselPrompt`, ligne 1564) :
> "Pour LinkedIn mix : la légende (caption) est OPTIONNELLE — concentre-toi à 100% sur la qualité des slides PDF. **Si tu inclus une caption, ne la bâcle pas, sinon laisse-la vide (elle sera générée par un appel dédié)**."

L'IA suit l'instruction : sur LinkedIn + carrousel mix, elle renvoie une caption vide ou minimale (juste un hook éventuellement). Le prompt suppose qu'**un appel dédié** à `linkedin-ai` action `caption-for-carousel` viendra ensuite remplir hook/body/CTA/hashtags.

**Côté front (`CreerUnifie.tsx` + `use-content-generator.ts`)** : cet appel dédié **n'existe pas**. Après la réponse de `carousel-ai`, on affiche directement le résultat avec le caption vide. Conséquence visible :
- Hook éventuel rempli (parfois), corps vide, CTA vide, hashtags vide.
- Le bouton "Régénérer la légende" prévu dans `CarouselPhotoResult.tsx` (ligne 541) est du **code mort** : `onRegenerateCaption` n'est jamais passé depuis `CreerStepResult` → `CreerUnifie`.
- L'action `caption-for-carousel` existe pourtant côté back (`linkedin-ai/index.ts` ligne 183) avec un prompt dédié strict (hook 210 car., body 800-1500 car., CTA, 3-5 hashtags).

**À noter** : ce bug ne touche QUE le canal LinkedIn + carrousel mix (et potentiellement photo si jamais l'IA choisit de bâcler). Sur Instagram, le prompt impose une caption complète obligatoire → ça marche.

### Solution

Brancher l'appel dédié manquant. Trois pièces à mettre en place :

#### 1. Auto-générer la légende LinkedIn juste après la génération du carrousel mix/photo

Dans `CreerUnifie.tsx`, juste après que `carousel-ai` retourne le résultat pour le canal LinkedIn ET un carrousel `mix` ou `photo`, déclencher en arrière-plan un appel à `linkedin-ai` action `caption-for-carousel` avec :
- `subject` (le sujet du carrousel)
- `chosen_angle` (depuis `result.raw.chosen_angle`)
- `slides_summary` (concat des `overlay_text` + `title`/`body` des slides, max ~1500 char)
- `editorial_angle`, `objective`

Quand la réponse arrive : merger `{ hook, body, cta, hashtags }` dans `result.raw.caption` et déclencher un `setResult` pour rafraîchir le composant.

#### 2. Loader visible pendant la génération de la légende

- Ajouter un state `captionLoading: boolean` dans `CreerUnifie.tsx`.
- Le passer à `<CreerStepResult captionLoading={...} />` (la prop existe déjà).
- L'éditeur `LinkedInCaptionEditor` affiche déjà son skeleton "✍️ Rédaction de la légende LinkedIn…" quand `loading={true}` — on l'utilise tel quel.

#### 3. Brancher le bouton "Régénérer la légende"

- Créer `handleRegenerateLinkedInCaption()` dans `CreerUnifie.tsx` qui rappelle `caption-for-carousel` à la demande.
- Le passer en prop `onRegenerateCaption` à `CreerStepResult` puis à `CarouselPhotoResult` (les deux signatures existent déjà).

#### 4. Sauvegarde calendrier : reconstruire `caption.fullText` après merge

`CarouselPhotoResult` recompose `fullText` à partir de hook/body/cta/hashtags via `composeFullText` — c'est déjà géré, rien à modifier.

### Fichiers touchés

| Fichier | Changement |
|---|---|
| `src/pages/CreerUnifie.tsx` | Ajout state `captionLoading`, fonction `regenerateLinkedInCarouselCaption()`, hook auto-trigger après carousel-ai LinkedIn mix/photo, props `captionLoading` + `onRegenerateCaption` passées à `CreerStepResult` |

Aucun autre fichier touché : `CreerStepResult`, `CarouselPhotoResult`, `LinkedInCaptionEditor` ont déjà toute la plomberie en place (props, états, UI). C'est purement le **branchement manquant** dans la page.

### Pourquoi pas une autre approche

- **Forcer carousel-ai à générer la caption complète pour LinkedIn mix** : possible mais on perd la qualité éditoriale du prompt LinkedIn dédié (anti-broetry, règles strictes 210 car. hook, hashtags pro). Le découplage actuel est volontaire et meilleur — il manque juste le branchement.
- **Régénérer manuellement à chaque fois** : trop friction utilisateur. L'auto-trigger après génération est attendu par l'UX existant ("Légende manquante ? Régénérer" est un fallback, pas le flow principal).

### Validation

1. Créer un carrousel mix sur LinkedIn avec 3 photos → après la fin de génération, le skeleton "✍️ Rédaction de la légende LinkedIn…" apparaît, puis hook + body (800-1500 car.) + CTA + 3-5 hashtags se remplissent automatiquement.
2. Si la première caption ne plaît pas → cliquer "Régénérer la légende" → nouveau body/CTA/hashtags.
3. Le `fullText` injecté dans le calendrier (sauvegarde) contient bien hook + body + CTA + hashtags.
4. Pas de régression Instagram : la caption est toujours complète directement depuis carousel-ai.
5. Pas de régression carrousel texte LinkedIn (sans photos) : ce flow passe par un autre prompt (`buildExpressFullPrompt` avec `isLinkedIn`) qui n'a pas le shortcut "caption optionnelle" → on n'y touche pas.

### Risques

Faibles. L'edge function `caption-for-carousel` existe et est testée. Le composant `LinkedInCaptionEditor` a déjà son état loading prêt. C'est un branchement front pur, pas de migration BDD, pas de nouveau prompt.

