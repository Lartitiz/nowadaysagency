

## Plan : Correction pass JSON-aware pour carrousels

### Diagnostic

Les 4 patterns IA identifiés (formule "X sans Y = Z", abus de TU, CTA générique, récitation du sujet) passent pour 3 raisons cumulées :

1. **Prompt trop long** (~33k chars) → les règles stylistiques sont noyées et ignorées par le modèle
2. **Correction pass désactivée** → le filet de sécurité qui aurait attrapé ces patterns est commenté
3. **La correction pass actuelle casse le JSON** → elle traite le JSON comme du texte libre

### Solution

Créer une fonction `applyCorrectionPassCarousel()` dans `_shared/correction-pass.ts` qui :

1. **Parse le JSON** du carrousel pour extraire les champs textuels (title, body, caption)
2. **Concatène les textes** en un bloc annoté (ex: `[SLIDE 1 - TITLE] La créativité sans clarté...`)
3. **Envoie ce bloc texte** au prompt de correction carousel existant
4. **Re-parse la réponse** et réinjecte les textes corrigés dans la structure JSON originale

### Fichiers modifiés

**1. `supabase/functions/_shared/correction-pass.ts`**

Ajouter une fonction exportée `applyCorrectionPassCarousel(jsonContent: string, options)` :

```text
Entrée : JSON string du carrousel complet
  ↓
Parse JSON → extraire slides[].title + slides[].body + caption
  ↓
Construire bloc texte annoté :
  "[SLIDE 1 - HOOK] La créativité sans clarté, c'est du bruit"
  "[SLIDE 2 - TITLE] On glorifie l'originalité"
  "[SLIDE 2 - BODY] Partout, on entend : sois créative..."
  ...
  "[CAPTION] ..."
  ↓
Appel Anthropic avec prompt correction carousel (température 0.3)
  ↓
Re-parse la réponse annotée → réinjecter dans le JSON original
  ↓
Sortie : JSON string corrigé avec structure intacte
```

Le prompt de correction sera adapté pour :
- Recevoir du texte annoté par marqueurs `[SLIDE N - TYPE]`
- Retourner le même format annoté (pas du JSON)
- Appliquer toutes les règles existantes (anti-TU, anti-formule, CTA, etc.)

**2. `supabase/functions/carousel-ai/index.ts`**

- Importer `applyCorrectionPassCarousel`
- Réactiver les 3 blocs de correction commentés en utilisant la nouvelle fonction au lieu de `applyCorrectionPass`
- La nouvelle fonction gère le JSON en interne → pas de risque de casser la structure

### Renforcement du prompt principal (bonus)

Dans le prompt système carousel (L.498-502), remonter la règle anti-TU plus haut dans le prompt et la rendre plus visible avec un encadré :

```
══ VÉRIFICATION OBLIGATOIRE AVANT RETOUR ══
□ Combien de slides utilisent "tu" comme sujet ? Si > 2 → RÉÉCRIS en JE/NOUS
□ Slide 1 contient "X sans Y, c'est Z" ? → RÉÉCRIS avec un fait concret
□ Dernière slide = "Et toi, ..." ? → question SPÉCIFIQUE au sujet
```

### Résultat attendu

- Les textes des slides sont corrigés (anti-TU, formules, CTA)
- La structure JSON reste intacte (clés, visual_schema, hashtags, etc.)
- Fallback : si la correction échoue, le contenu original est retourné tel quel

### Vérifications

- `grep -c "applyCorrectionPassCarousel"` dans carousel-ai → 3 (réactivation des 3 blocs)
- Test : générer un carrousel et vérifier dans les logs `[correction-pass:carousel]` STARTED + DONE
- Vérifier que le JSON retourné est parsable et contient toutes les slides

