# Fix : photos perdues entre "Partir de photos" → LinkedIn

## Le problème (confirmé par ton screenshot + ton message)

Tu uploades 4 photos via **"Partir de photos"** → la zone affiche bien **4 / 10**. Tu cliques sur **Post LinkedIn** → il n'en reste qu'**1 / 10** dans la zone.

Deux bugs dans le code actuel :

### Bug 1 — `postPhoto` initialisé à 1 seule photo
`src/components/creer/CreerStepFormat.tsx` ligne 85 :
```ts
const [postPhoto, setPostPhoto] = useState<PhotoItem[]>(
  initialPhotos?.slice(0, 1) ?? []   // ← garde 1 photo, peu importe le format
);
```
Cet état est défini **avant** que le format soit choisi, donc on ne sait pas encore si c'est LinkedIn (10) ou Instagram (1). On tronque à 1 par défaut.

### Bug 2 — `PhotoUploadZone` ne se resynchronise jamais
`src/components/creer/PhotoUploadZone.tsx` ligne 97-100 :
```ts
useEffect(() => {
  if (initialPhotos) setPhotos(initialPhotos);
}, []); // mount only
```
Quand `handleFormatSelect("linkedin")` met à jour `postPhoto` avec les 10 photos (ligne 153), la zone est déjà montée avec son ancien état (1 photo) et **ne se met pas à jour**.

## Correctifs

1. **`CreerStepFormat.tsx` ligne 84-86** — initialiser `postPhoto` avec **toutes** les `initialPhotos` (pas `.slice(0,1)`). Le `handleFormatSelect` slicera correctement selon le format choisi (10 pour LinkedIn, 1 pour Instagram).

2. **`PhotoUploadZone.tsx` ligne 97-100** — remplacer le sync mount-only par un sync qui réagit aux changements d'identité (référence) de `initialPhotos` :
   ```ts
   useEffect(() => {
     if (initialPhotos) setPhotos(initialPhotos);
   }, [initialPhotos]);
   ```
   Comme `CreerStepFormat` passe `postPhoto` (qui est un état React stable tant qu'il ne change pas), pas de risque de boucle.

3. **Garde-fou** : ajouter un `useEffect` dans `CreerStepFormat` qui, quand `selectedFormat === "linkedin"` ET `initialPhotos.length > postPhoto.length`, recharge `postPhoto = initialPhotos.slice(0, 10)`. Ça couvre le cas où le format est déjà sélectionné avant que les photos n'arrivent (timing).

## Vérification

Après le fix, je teste via `browser--navigate_to_sandbox` + `browser--act` sur `/creer` :
- Entrer via "Partir de photos" avec 4 images
- Sélectionner LinkedIn → la zone doit afficher **4 / 10**
- Cliquer Suivant → vérifier dans les logs réseau que le payload `photos[]` contient bien 4 entrées

## Hors scope

- Pas de changement de la limite (déjà à 10).
- Pas de changement du prompt edge function (déjà adapté pour 3+ photos).
- Pas de re-publication automatique — tu pourras republier quand ce sera validé en preview.
