## Plan : Étapes 3, 4 et 5 — Correction multi-photos (suite)

### Étape 3 — Timeout questions en mode photo

**Fichier** : `src/hooks/use-content-generator.ts` (ligne ~577)
**Changement** : augmenter le timeout de l'appel `invokeWithTimeout("creative-flow", {...}, photoModeCF ? 90000 : 60000)` à `photoModeCF ? 180000 : 60000`.
**Pourquoi** : avec jusqu'à 10 photos encodées base64, le payload est lourd et l'edge function peut dépasser 90s.

### Étape 4 — Propager les photos au step follow-up

**Fichier** : `src/hooks/use-content-generator.ts` (lignes ~632-640, fonction `generateFollowUp`)
**Changement** : ajouter les champs `photo_mode`, `photos` et `photo_description` dans le body de l'appel `invokeWithTimeout("creative-flow", { step: "follow-up", ... })`, en les récupérant des params passés à la fonction (qui doit recevoir `photos`, `photoMode`, `photoDescription` en plus de l'existant).
**Pourquoi** : le follow-up peut poser des questions sur les photos 2, 3, etc. si elles sont transmises.

### Étape 5 — Prompt méta "décris, n'invente pas" dans le backend

**Fichier** : `supabase/functions/creative-flow/index.ts`
**Changement** : dans la section du prompt qui gère `photo_mode === true`, ajouter une instruction explicite du type :

> "Tu dois décrire fidèlement ce que tu vois sur les photos. Ne raconte pas d'histoires, ne fantasme pas sur des éléments absents. Si une photo ne te donne pas d'informations exploitables, dis-le."  ici, je mettrais aussi peut-être une analyse qui peut être un peu méta, par exemple sociologique, philosophique, quelque chose qui ne serait pas une histoire inventée. Qu'en penses-tu    
> **Pourquoi** : empêcher le modèle d'halluciner des contextes ou histoires qui n'existent pas dans les images.

---

**Risque** : très faible — modifications ciblées, alignées avec le fix précédent. **Test** : générer un post LinkedIn depuis 3-4 photos et vérifier que les questions et le texte final restent factuels.