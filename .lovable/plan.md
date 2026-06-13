## Contexte métier

Quand une utilisatrice uploade ses photos pour un carrousel "photo" / "mix" puis change d'onglet, le retour provoque un remount : les photos (en state React mémoire uniquement) sont perdues, le step est rétrogradé à "format" via `safeStep`, et elle doit tout recommencer. Le hook `use-flow-persistence` ne connaît pas les champs photo.

Objectif : retrouver photos, carouselSubMode et photoDescription au retour d'onglet.

## (a) Demandé — Implémentation

### Fichier 1 : `src/hooks/use-flow-persistence.ts`

1. Étendre l'interface `FlowState` avec deux champs légers :
   - `carouselSubMode?: "text" | "photo" | "mix" | "pure_photo" | null`
   - `photoDescription?: string`

2. Ajouter trois nouvelles fonctions exportées pour les photos (clé séparée `creer_flow_photos`) :

```ts
const PHOTOS_KEY = "creer_flow_photos";

export function savePhotos(photos: any[]) {
  try {
    const payload = (photos || []).slice(0, 10).map(p => ({
      base64: p.base64, mimeType: p.mimeType, context: p.context,
    }));
    sessionStorage.setItem(PHOTOS_KEY, JSON.stringify({ photos: payload, ts: Date.now() }));
  } catch (e) {
    console.warn("[use-flow-persistence] savePhotos failed (storage quota?)", e);
  }
}

export function loadPhotos(): any[] {
  try {
    const raw = sessionStorage.getItem(PHOTOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed?.ts && Date.now() - parsed.ts > MAX_AGE_MS) {
      sessionStorage.removeItem(PHOTOS_KEY);
      return [];
    }
    return Array.isArray(parsed?.photos) ? parsed.photos : [];
  } catch { return []; }
}

export function clearPhotos() {
  try { sessionStorage.removeItem(PHOTOS_KEY); } catch {}
}
```

3. Étendre `clearFlowState()` pour appeler `clearPhotos()` (un seul reset = nettoyage total).

### Fichier 2 : `src/pages/CreerUnifie.tsx`

1. **Import** : ajouter `savePhotos, loadPhotos, clearPhotos` à l'import existant ligne 48.

2. **Initialisation des states photo** (lignes 162-173) — lire depuis la persistance :
   - `carouselSubMode` : initialiser depuis `ps?.carouselSubMode ?? null`
   - `uploadedPhotos` : initialiser depuis `shouldRestore ? loadPhotos() : []`
   - `generatedWithPhotos` : idem (snapshot identique au mount)
   - `photoDescription` : initialiser depuis `ps?.photoDescription ?? ""`

3. **safeStep** (ligne 136-145) — fix critique : ne pas rétrograder à "format" si on revient du retour d'onglet sur un step contenant des photos. Adapter :
   ```ts
   const safeStep = (() => {
     if (!ps?.step) return "idea";
     if (ps.step === "result" && ps.result) return "result";
     if (ps.step === "edit" && ps.editContent) return "edit";
     // Si flow photo/mix avec photos retrouvées, garder le step en cours (questions, structure_review)
     if (["questions", "structure_review", "inspiration_proposals"].includes(ps.step)) {
       const isPhotoFlow = ps.carouselSubMode === "photo" || ps.carouselSubMode === "mix" || ps.carouselSubMode === "pure_photo";
       if (isPhotoFlow && loadPhotos().length > 0) return ps.step as Step;
       return ps.selectedFormat ? "format" : "idea";
     }
     if (["result", "edit"].includes(ps.step)) {
       return ps.selectedFormat ? "format" : "idea";
     }
     return ps.step as Step;
   })();
   ```

4. **saveFlowState effect** (lignes 351-373) — ajouter `carouselSubMode` et `photoDescription` au payload et aux deps de l'effet.

5. **Persistance des photos** — étendre l'effet existant (lignes 536-540) :
   ```ts
   useEffect(() => {
     if (uploadedPhotos.length > 0) {
       setGeneratedWithPhotos((prev) => (prev.length === uploadedPhotos.length ? prev : uploadedPhotos));
       if (carouselSubMode === "photo" || carouselSubMode === "mix" || carouselSubMode === "pure_photo") {
         savePhotos(uploadedPhotos);
       }
     }
   }, [uploadedPhotos, carouselSubMode]);
   ```

6. **Reset** — `clearFlowState()` appelle déjà `clearPhotos()` (via étape 3 du fichier 1), donc tous les sites de reset existants (~ligne 1502, ~1771, ~2049, useEffect "fresh start" ~ligne 203) sont couverts automatiquement. Aucune modif supplémentaire.

## Ce qui NE DOIT PAS bouger

- `handleGenerateVisuals` (logique snapshot/dialog/downgrade explicite) : intact.
- Pattern quota (checkQuota / logUsage) : intact.
- Mapping slides (photo_full / photo_integrated / text_only) : intact.
- Edge Functions (carousel-ai, carousel-visual) : intact (bug 100% frontend).
- Autres formats (reels, stories, posts, LinkedIn, Pinterest, newsletter) : intact.
- Mode démo Auriana : intact.
- Champs existants de `FlowState` : ne rien retirer.

## Critères de validation

1. `npx tsc --noEmit --skipLibCheck` passe.
2. Test manuel : carrousel "mix", upload 3 photos + sujet, avancer jusqu'à "questions", changer d'onglet 10s, revenir → 3 photos toujours là, `carouselSubMode` = "mix", step préservé.
3. Test manuel : "nouvelle création" → photos effacées (clé `creer_flow_photos` purgée).
4. Test poids : 10 grosses photos → au pire un `console.warn` "savePhotos failed", aucune erreur bloquante (les autres clés de persistance restent valides grâce à la séparation).

## (b) Propositions d'amélioration (signalées, non implémentées)

1. **IndexedDB pour les photos** : sessionStorage plafonne à ~5-10 MB selon le navigateur. 10 photos base64 (~3 MB chacune compressées en JPEG) = risque de quota dépassé en mode "warn silencieux". IndexedDB (via idb-keyval, ~600 octets ajoutés) permettrait 50 MB+ sans risque. Migration low-risk car l'API photo serait isolée derrière `savePhotos/loadPhotos`.

2. **Compression amont** : avant `setUploadedPhotos`, passer chaque photo dans un `canvas` 1080px max + quality 0.8 avant base64. Diviserait le poids par 3–5 et résoudrait le problème sans changer le storage backend. Plus simple qu'IndexedDB.

3. **Persistance unifiée des photos pour `photoMode`** (post photo hors carrousel) : même bug latent, déclaré hors scope par toi mais la mécanique `savePhotos/loadPhotos` serait réutilisable directement.

## Hors scope (plans séparés à venir)

- Persistance des photos pour `photoMode` hors carrousel.
- Bug "Sauvegarder en idée" qui ne persiste que les carrousels.
- Migration IndexedDB systématique.