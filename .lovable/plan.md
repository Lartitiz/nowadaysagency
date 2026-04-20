

## Diagnostic — Pourquoi "Passer les questions" ne fait rien

**La vraie cause = build cassé.** L'app ne tourne pas réellement, donc **AUCUN** bouton ne répond, pas seulement "Passer les questions".

L'erreur de build :
```
src/pages/CreerUnifie.tsx(2119,17): Property 'initialPhotos' does not exist on type 'IntrinsicAttributes & Props'.
```

J'ai vérifié `CreerStepFormat.tsx` : malgré ce qu'indiquait le résumé du tour précédent, **les modifs n'ont jamais été appliquées à ce fichier** :
- Le type `Props` (ligne 37-44) ne contient PAS `initialPhotos` ni `initialPhotoDescription`
- La destructuration ligne 46 ne les reçoit pas
- Aucune trace de `hasUserChangedFormat` ou `initialPhotos` (grep = 0 match)

Donc `CreerUnifie.tsx` (ligne 2119) passe des props qui n'existent pas → erreur TS → app ne compile pas → preview vide ou figée → clics sans effet.

## Fix — 1 seul fichier

`src/components/creer/CreerStepFormat.tsx` : appliquer les changements oubliés du tour précédent.

**Étape 1 — Étendre `Props`**
```ts
interface Props {
  idea: string;
  objective?: string;
  initialFormat?: string;
  suggestedFormat?: string;
  initialPhotos?: PhotoItem[];           // NEW
  initialPhotoDescription?: string;       // NEW
  onNext: (...);
  onBack: () => void;
}
```

**Étape 2 — Destructurer + initialiser les states avec**
```ts
export default function CreerStepFormat({ idea, objective, initialFormat, suggestedFormat, initialPhotos, initialPhotoDescription, onNext, onBack }: Props) {
  // ...
  const [uploadedPhotos, setUploadedPhotos] = useState<PhotoItem[]>(initialPhotos ?? []);
  const [photoDescription, setPhotoDescription] = useState(initialPhotoDescription ?? "");
  const [postPhoto, setPostPhoto] = useState<PhotoItem[]>(initialPhotos ?? []);
  const [postPhotoDescription, setPostPhotoDescription] = useState(initialPhotoDescription ?? "");
  const hasUserChangedFormat = useRef(false);
```

**Étape 3 — Pré-sélection auto au 1er format choisi quand photos pré-chargées**
Dans `handleFormatSelect` : si c'est la 1re sélection ET `initialPhotos.length > 0` :
- format `carousel` → `setCarouselSubMode("mix")`
- format `post` → `setPhotoMode(true)`
Marquer `hasUserChangedFormat.current = true` pour les sélections suivantes.

**Étape 4 — Préserver le reset existant** sur les choix manuels suivants (comportement actuel inchangé si `initialPhotos` est undefined ou que l'utilisateur·ice change de format).

## Validation
1. `tsc --noEmit --skipLibCheck` → 0 erreur
2. Le bouton "Passer les questions" redevient cliquable (avec tous les autres) une fois le build vert
3. Scénario "Partir de photos" → format → photos pré-remplies dans CreerStepFormat
4. Scénario classique sans photos initiales → comportement strictement identique

## Hors scope
- Tout le reste du flow (déjà fonctionnel sur le papier, juste bloqué par cette erreur de compilation)

