

## Diagnostic

Aujourd'hui, dans le carrousel mixte LinkedIn (`CarouselPhotoResult` + `LinkedInCaptionEditor`), la légende est générée **dans le même appel** que les slides via `carousel-ai` :
- Un seul gros prompt à Claude Sonnet doit produire JSON slides + JSON `caption{hook, body, cta, hashtags}`.
- Quand le modèle se concentre sur les slides (mix LinkedIn = lourd : photos + arc narratif + slides PDF), il **oublie ou tronque le bloc `caption.body`** → l'éditeur LinkedIn s'ouvre vide → l'utilisateur·ice ne voit "rien charger".

À côté, `linkedin-ai` (action `improve-post` notamment) sait parfaitement produire un post LinkedIn complet (hook 210 car., body 1300-1900 car., CTA, 0-2 hashtags, ton pro). Cette logique est déjà éprouvée et rapide (1 seul prompt focalisé).

**Idée du fix** : décorréler. Le carrousel mixte LinkedIn ne s'occupe plus que des slides PDF. La légende est générée par un appel séparé à `linkedin-ai` avec une nouvelle action dédiée `caption-for-carousel`.

## Architecture proposée

```text
[CreerUnifie] 
   ├─> carousel-ai (mix, channel=linkedin) → SLIDES uniquement
   └─> linkedin-ai (action: caption-for-carousel) → CAPTION LinkedIn
            (en parallèle ou en cascade)
```

Bénéfices :
- **Fiabilité** : 2 prompts focalisés > 1 prompt obèse
- **Cohérence LinkedIn** : la caption hérite des règles `LINKEDIN_PRINCIPLES_COMPACT`, `ANTI_BROETRY_LINKEDIN`, `EMBEDDED_EDUCATION` déjà utilisées pour les posts sans visuel
- **Vitesse perçue** : on peut afficher les slides dès qu'elles arrivent, puis hydrater la caption juste après
- **Régénération indépendante** : un bouton "Régénérer la légende seule" devient possible (pas tout le carrousel)

## Périmètre — 4 fichiers

### 1. `supabase/functions/linkedin-ai/index.ts` — nouvelle action
- Ajouter `action: "caption-for-carousel"`
- Inputs : `subject`, `chosen_angle`, `slides_summary` (titres + body courts des slides), `editorial_angle`, `objective`, `workspace_id`
- Prompt : `LINKEDIN_PRINCIPLES_COMPACT + ANTI_BROETRY_LINKEDIN + EMBEDDED_EDUCATION + context utilisateur` → sortie JSON strict :
  ```json
  { "hook": "...", "body": "...", "cta": "...", "hashtags": ["...", "..."] }
  ```
- Règles LinkedIn appliquées : hook ≤ 210 car., body 800-1500 car. (sweet spot LinkedIn pour carrousel = un peu plus court que post seul car la valeur est dans le PDF), 3-5 hashtags, ton pro chaleureux, pas de `—`, écriture inclusive.
- Catégorie quota : `content`

### 2. `supabase/functions/carousel-ai/index.ts` — alléger pour LinkedIn mix
- Quand `isLinkedIn && carousel_type === "mix"` : retirer le bloc `═══ LÉGENDE LINKEDIN ═══` du prompt et marquer `caption` comme **optionnel** dans le JSON attendu.
- Le modèle se concentre sur les slides PDF (qui sont la valeur du format).
- Côté retour : si la caption est absente, c'est OK (le front la récupèrera via `linkedin-ai`).
- Instagram mix : **inchangé** (continue à générer caption dans le même appel — ça marche bien pour Insta).

### 3. `src/pages/CreerUnifie.tsx` — orchestrer le 2ᵉ appel
- Après que `carousel-ai express_full` retourne pour `channel === "linkedin"` + `carouselSubMode === "mix"` :
  - Lancer `invokeWithTimeout("linkedin-ai", { action: "caption-for-carousel", ... }, 60000)` avec un résumé compact des slides.
  - Pendant l'attente, passer un état `captionLoading=true` au renderer.
  - Quand la caption arrive, fusionner dans `result.raw.caption` et `notify` au parent.
- Si l'appel `linkedin-ai` échoue : fallback gracieux = caption vide + alerte ambre (déjà présente) avec bouton "Réessayer la légende".

### 4. `src/components/creer/formatRenderers/CarouselPhotoResult.tsx` — UI
- Nouvelle prop `captionLoading?: boolean` et `onRegenerateCaption?: () => void`.
- Si `channel === "linkedin"` et `captionLoading` → afficher dans `LinkedInCaptionEditor` un skeleton (3 cards grisées + spinner discret + texte "✍️ Rédaction de la légende LinkedIn…").
- Quand `captionLoading=false` et caption vide → l'alerte ambre existante affiche un nouveau bouton "Régénérer uniquement la légende" (en plus de "Relancer la génération" complète).
- Instagram : strictement inchangé.

### Bonus mineur — `LinkedInCaptionEditor.tsx`
- Ajouter prop optionnelle `loading?: boolean` qui remplace les 4 cards par des skeletons (3 lignes grises animate-pulse). Aucun changement de logique pour les autres usages.

## Validation manuelle

1. `tsc --noEmit --skipLibCheck` → 0 erreur
2. Carrousel mix **LinkedIn** : slides s'affichent → skeleton caption ~3-5s → caption complète apparaît (hook + body 800-1500 car. + CTA + 3-5 hashtags)
3. Carrousel mix **Instagram** : comportement strictement identique à aujourd'hui (caption dans le même appel)
4. Si `linkedin-ai` timeout : bouton "Régénérer la légende" visible et fonctionnel
5. Compteurs `LinkedInCaptionEditor` (210 car. hook, sweet spot 300-1200 body, 3-5 hashtags) cohérents avec ce que le nouveau prompt produit

## Hors scope
- Streaming token-par-token de la caption
- Cache des captions générées (réutilisation entre régénérations)
- Refacto `LinkedInResult.tsx` pour utiliser `LinkedInCaptionEditor` (déjà noté dans plan précédent)
- Découplage similaire pour `reel`, `story`, `newsletter` (à voir plus tard si symptôme similaire)

