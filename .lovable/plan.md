

## Plan : Brancher carousel-ai sur le module correction-pass

### Points d'insertion identifiés

Le fichier a **4 endroits** où du contenu final est généré et retourné :

1. **L.141-161** — Mode `express_full` + `mix` (avec photos) → `content` déclaré en `let` ✓
2. **L.150-161** — Mode `express_full` + `mix` (sans photos) → même variable `content`
3. **L.167-208** — Mode `express_full` + `photo` → `content` déclaré en `let` ✓
4. **L.398-408** — Chemin partagé (hooks, slides, express_full standard, MAIS AUSSI suggest_topics, suggest_angles, deepening_questions) → `content` déclaré en `const` → passer en `let`

### Modifications

**Import (L.11, après les imports existants) :**
```typescript
import { applyCorrectionPass } from "../_shared/correction-pass.ts";
```

**Point 1 — Mix carousel (L.157, avant `await logUsage`) :**
Ajouter le bloc correction entre la génération et le return (L.158-161).

**Point 2 — Photo carousel (L.204, avant `await logUsage`) :**
Même bloc correction avant le return (L.205-208).

**Point 3 — Chemin partagé (L.398-408) :**
- Changer `const content` en `let content` (L.398)
- Ajouter le bloc correction APRÈS L.403 mais UNIQUEMENT si `type` est `hooks`, `slides` ou `express_full` (pas pour suggest_topics, suggest_angles, deepening_questions)

### Bloc correction (identique aux 3 points) :
```typescript
// Apply correction pass
if (type === "express_full" || type === "slides" || type === "hooks") {
  try {
    const correctionFormat = body.channel === "linkedin" ? "linkedin" : "carousel";
    const corrected = await applyCorrectionPass(content, correctionFormat, {
      enabled: true,
      skipIfShorterThan: 300,
      logger: (msg) => console.log(msg),
    });
    if (corrected && corrected !== content) {
      content = corrected;
    }
  } catch (correctionError) {
    console.error("Correction pass failed in carousel-ai:", correctionError);
  }
}
```

Pour les points 1 et 2 (mix/photo), le guard `if (type === ...)` n'est pas nécessaire car on est déjà dans `express_full`, mais on le simplifie en gardant juste le try/catch.

### Fichier modifié
- `supabase/functions/carousel-ai/index.ts` — 1 import + 3 blocs correction

### Vérifications
- `grep -c "applyCorrectionPass"` → 4 (1 import + 3 appels)
- `grep -c "correction-pass"` → 1 (import)

