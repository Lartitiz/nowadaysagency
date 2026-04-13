

## Plan : Créer le module mutualisé de correction

### Ce qui est fait
Création d'un nouveau fichier `supabase/functions/_shared/correction-pass.ts` avec le contenu exact fourni dans le prompt.

### Contenu du fichier
- Import de `callAnthropicSimple` et `getModelForAction` depuis `./anthropic.ts`
- Type `CorrectionFormat` (6 formats : linkedin, carousel, newsletter, instagram_caption, reel, stories)
- Interface `CorrectionOptions` (skipIfShorterThan, enabled, logger)
- Constante `CORRECTION_PROMPTS` : un prompt de correction par format, tous structurés avec TEST FONDAMENTAL + CORRECTIONS OBLIGATOIRES + RÈGLES ABSOLUES + AUTO-VÉRIFICATION
- Fonction exportée `applyCorrectionPass(content, format, options)` qui appelle Anthropic avec température 0.3 et fallback sur le contenu original en cas d'erreur

### Fichier créé
- `supabase/functions/_shared/correction-pass.ts` — nouveau fichier, contenu exact du prompt

### Vérifications post-création
- `npx tsc --noEmit --skipLibCheck` → 0 erreur
- `grep -c "export async function applyCorrectionPass"` → 1
- `grep -c "CORRECTION_PROMPTS"` → au moins 2

