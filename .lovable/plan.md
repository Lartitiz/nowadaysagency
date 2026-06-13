## Fix

In `src/pages/CreerUnifie.tsx`, within `handlePhotosNext` (lines 631-645), **remove** lines 637-638:

```typescript
    setNewsjackingContext(null);
    setNewsjackingSuggestedFormat(null);
```

## Why

These two resets were unconditionally clearing any newsjacking context that the user had just selected via an article angle. Since `handlePhotosNext` is called from the "Partir de photos" entry point, preserving the context allows the photo carousel flow to remain anchored to the chosen actu.

When there is no upstream actu, these states are already `null`; removing the reset is a no-op and does not affect non-newsjacking journeys.

## Unchanged

- `handleIdeaNext` keeps its `setNewsjackingContext(null)` — reparting from a raw idea should still clear the actu.
- The `onBack` callback at line 2556 keeps its `setNewsjackingContext(null)` — stepping back to idea resets legitimately.
- All other state resets in `handlePhotosNext` remain (`setSelectedFormat(null)`, `setEditorialAngle(null)`, etc.).
- No other files touched.

## Validation

- `npx tsc --noEmit --skipLibCheck` must pass.
- Manual test A: article → angle → "Partir de photos" → carousel photo uses the actu.
- Manual test B: direct "Partir de photos" without actu → normal generation, no ghost context.
- Manual test C: article → angle → photo carousel (without photo entry point) → unchanged.
