

## Plan — Légende LinkedIn dans CarouselPhotoResult

### Périmètre — 5 fichiers

1. `src/pages/CreerUnifie.tsx` — propager `channel`
2. `src/components/creer/CreerStepResult.tsx` — accepter + propager `channel`
3. `src/components/creer/formatRenderers/CarouselPhotoResult.tsx` — UI LinkedIn + alerte régénération + log
4. `src/components/linkedin/LinkedInCaptionEditor.tsx` — **NEW** sous-composant partagé extrait de `LinkedInResult`
5. `supabase/functions/carousel-ai/index.ts` — durcissement prompt mix LinkedIn

---

### Action 1 — Propager `channel` jusqu'au renderer
- `CreerUnifie.tsx` : passer `channel={selectedChannel}` (`"linkedin" | "instagram"`) à `<CreerStepResult>`
- `CreerStepResult.tsx` : ajouter prop `channel`, la transmettre à `<CarouselPhotoResult>`
- `CarouselPhotoResult.tsx` : ajouter prop `channel?: "linkedin" | "instagram"` (default `"instagram"` → comportement actuel inchangé)

### Action 2 — Refacto en sous-composant `LinkedInCaptionEditor` (Proposition C validée)
**Nouveau fichier** `src/components/linkedin/LinkedInCaptionEditor.tsx` :
- Props : `hook, body, cta, hashtags` + handlers `onChange*`
- Affiche : 3 cards (Accroche / Corps / CTA) + zone hashtags
- Compteurs caractères live (Proposition A) avec couleur :
  - Accroche : sweet spot 100-210, rouge > 210, warning "LinkedIn tronque à ~210 car."
  - Corps : sweet spot 300-1200, ambre > 2500, rouge > 3000
  - CTA : info simple
  - Hashtags : message "3-5 max sur LinkedIn", warning si > 5
- Réutilise `CharacterCounter` de `src/components/linkedin/CharacterCounter.tsx`
- Note : `LinkedInResult.tsx` reste tel quel pour V1 (pas de refacto rétroactif, hors scope)

### Action 3 — Intégration dans `CarouselPhotoResult.tsx`
Dans le bloc Card "Légende" (lignes 444-495) :
- Si `channel === "linkedin"` → render `<LinkedInCaptionEditor {...captionFields} />`
- Sinon → garder l'UI Instagram actuelle strictement identique

### Action 4 — Alerte "Légende incomplète" (V1 minimale validée)
En haut du bloc Légende, si `caption.body.length < 50` OU `caption.body` vide :
- Encart ambre : `⚠ La légende n'a pas été générée correctement.`
- Bouton "Relancer la génération" qui réutilise le handler `onRetry` existant (pas de nouvelle Edge Function)

### Action 5 — Log caption vide (Proposition D validée)
Dans `CarouselPhotoResult.tsx`, `useEffect` au mount :
```ts
if (!caption?.body || caption.body.length < 50) {
  console.warn("[caption_missing]", { channel, slidesCount, hookOnly: !!caption?.hook });
}
```
Si `logUsage` accessible → ajouter flag `caption_missing: true`. Sinon juste console.warn (3 lignes).

### Action 6 — Durcissement prompt `carousel-ai` mix LinkedIn
Dans `supabase/functions/carousel-ai/index.ts` (bloc prompt mix LinkedIn ~ligne 1568-1576) :
- Ajouter exemple inline complet :
  ```
  EXEMPLE de caption COMPLÈTE (à adapter, JAMAIS laisser vide) :
  {
    "hook": "Ce chantier cache 3 appartements.",
    "body": "Quand on a démarré la rénovation...[~400 car narratif sensoriel]",
    "cta": "Tu rénoves bientôt ? Dis-moi où tu en es en commentaire.",
    "hashtags": ["#renovation", "#architecture", "#chantier", "#bordeaux"]
  }
  ```
- Pas de retry auto V1 (évite latence + coût)

---

### Validation
1. `tsc --noEmit --skipLibCheck` → 0 erreur
2. Carrousel LinkedIn mix : 3 blocs FR (Accroche/Corps/CTA) + compteurs + warning 210 + hashtags 3-5
3. Carrousel Instagram mix : strictement identique à aujourd'hui
4. Reproduction du bug : régénérer ce carrousel → body se remplit grâce à l'exemple inline
5. Si body toujours vide après régénération → alerte ambre + bouton relancer visible

### Hors scope
- Edge Function `caption-only` dédiée (V2)
- Refacto `LinkedInResult.tsx` pour utiliser `LinkedInCaptionEditor`
- Preview pixel-perfect du feed LinkedIn
- Retry auto côté Edge Function

