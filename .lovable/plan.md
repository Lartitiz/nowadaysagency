

## Diagnostic : pourquoi la card "Légende" est vide

### Ce que j'ai trouvé

La card **est bien rendue** (lignes 422-473 de `CarouselPhotoResult.tsx`) — sans condition. Si tu la vois "vide", c'est que les 4 textareas (Hook / Body / CTA / Hashtags) n'ont pas de contenu.

État actuel :
```ts
const [caption, setCaption] = useState<any>(r?.caption || {});
```
→ Si l'IA ne renvoie pas `caption` dans son JSON (ou la renvoie vide), les champs sont vides.

### Cause probable

Dans `buildMixCarouselPrompt` (`carousel-ai/index.ts` lignes 1491-1496), la section **═══ LÉGENDE ═══** liste les règles éditoriales mais :
1. N'est pas mise en évidence comme **obligatoire dans le JSON**
2. Vient **après** une longue section "RÈGLES DE COMPOSITION" + "RÈGLES SPÉCIFIQUES MIX"
3. Le bloc "VÉRIFICATION FINALE" (ligne 1499) ne mentionne **pas** la caption

Avec un long prompt, l'IA Gemini omet régulièrement la `caption` ou la renvoie incomplète sur les générations mix. Symptôme classique constaté.

### Bug secondaire

Dans `CarouselPhotoResult.tsx` ligne 175 :
```ts
const prevSignature = useRef(JSON.stringify((r?.slides || []).map((s: any) => s.slide_number)));
```
→ Le `useEffect` ligne 177 ne resync `caption` que si la **signature des slides** change. Si l'utilisateur régénère et obtient le **même nombre de slides** mais avec une caption différente, **la caption locale n'est pas remise à jour**. Bug potentiel mais pas la cause principale.

---

## Plan : 3 corrections

### 1. Renforcer l'obligation de `caption` dans le prompt mix
`supabase/functions/carousel-ai/index.ts` :
- Ajouter dans la section "VÉRIFICATION FINALE" une ligne explicite : `Le bloc "caption" complet (hook, body, cta, hashtags) est OBLIGATOIRE dans le JSON.`
- Déplacer la section ═══ LÉGENDE ═══ juste avant le schéma JSON pour qu'elle soit la dernière chose lue par l'IA
- Renommer en ═══ LÉGENDE (OBLIGATOIRE DANS LE JSON) ═══

### 2. Fallback caption côté front
`CarouselPhotoResult.tsx` : si `r?.caption` est absente ou vide, **générer un fallback minimal** à partir du contenu des slides :
- Hook = `slides[0].overlay_text || slides[0].title || ""` 
- Body = vide (laisser l'utilisateur écrire)
- CTA = ""
- Hashtags = []

L'utilisateur verra au moins une amorce et comprendra que c'est éditable, plutôt qu'une card vide qui semble cassée.

### 3. Fix bug de signature
`CarouselPhotoResult.tsx` ligne 175-186 : inclure la caption dans la signature de resync :
```ts
const prevSignature = useRef(JSON.stringify({
  slides: (r?.slides || []).map((s: any) => s.slide_number),
  captionHash: JSON.stringify(r?.caption || {}),
}));
```
→ La caption est correctement resync à chaque vraie nouvelle génération.

### 4. Toast d'avertissement (optionnel)
Dans `CreerUnifie.tsx` après réception du résultat carrousel : si `r.caption` est manquante/vide, log console + toast doux : "L'IA a oublié la légende, tu peux l'écrire à la main 🌸"

### Fichiers modifiés
- `supabase/functions/carousel-ai/index.ts` (renforcer prompt, ~10 lignes)
- `src/components/creer/formatRenderers/CarouselPhotoResult.tsx` (fallback + signature, ~15 lignes)
- `src/pages/CreerUnifie.tsx` (toast warning, ~5 lignes)

### Risque
Très faible. Pas de changement structurel, juste des garde-fous.

