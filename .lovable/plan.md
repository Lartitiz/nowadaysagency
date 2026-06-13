## Objectif
Ajouter un timestamp et un TTL (30 min) à la clé sessionStorage `audit_recommendation` pour éviter qu'une recommandation "périmée" réapparaisse indéfiniment pendant une session.

## Fichiers impactés
1. `src/components/plan/AuditRecommendationsSection.tsx`
2. `src/pages/BrandingAuditPage.tsx`
3. `src/components/AuditRecommendationBanner.tsx`

## Détails techniques

### Écriture du timestamp (3 endroits)
À chaque `sessionStorage.setItem("audit_recommendation", ...)`, ajouter un champ `ts: Date.now()` à l'objet JSON stocké :
- `AuditRecommendationsSection.tsx` ligne 88
- `BrandingAuditPage.tsx` ligne 540 (dans `navigateWithContext`)

### Lecture + validation TTL
Dans `AuditRecommendationBanner.tsx` :
- Lire `ts` depuis l'objet parsé.
- Si `ts` absent ou `Date.now() - ts > 30 * 60 * 1000` :
  - `sessionStorage.removeItem("audit_recommendation")`
  - `setRecommendation(null)`
  - Ne pas afficher la bannière.
- Sinon, afficher normalement.
- Le dismiss manuel (bouton X) reste inchangé.

## Ce qui ne bouge PAS
- Design de la bannière (classes Tailwind, rendu conditionnel).
- Navigation vers les modules (`navigateToModule`, `navigateWithContext`) — seul l'objet stocké gagne un champ `ts`.
- Routes et query params (`?from=audit&rec_id=`).

## Validation
- `npx tsc --noEmit --skipLibCheck` → 0 erreur.
- Test manuel : cliquer une reco → bannière s'affiche. Forcer un `ts` ancien (ou attendre > 30 min) → bannière ne s'affiche plus et la clé est supprimée.

## Proposition (optionnel)
Le seuil de 30 min correspond à la durée d'une session de travail sur un audit. Si tu préfères un autre seuil (ex: 15 min pour un contexte plus volatile, ou 1h pour laisser trainer un peu), dis-le.