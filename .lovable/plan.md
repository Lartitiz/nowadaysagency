

## Plan : Personnaliser le placeholder selon l'activité de l'utilisatrice

### Problème
Le placeholder du textarea dans `CreerStepIdea.tsx` (ligne 49) est hardcodé avec "colliers en velours" — un exemple orienté bijoux/artisanat. Quand Auriana (marchande de biens) utilise l'outil, ça n'a aucun sens.

### Solution
Passer l'activité du profil en prop à `CreerStepIdea` et générer un placeholder contextuel.

### Modifications

**1. `src/components/creer/CreerStepIdea.tsx`**
- Ajouter une prop `activite?: string` à l'interface `Props`
- Créer un dictionnaire de placeholders par type d'activité (immobilier, coaching, bijoux, etc.) avec un fallback générique
- Remplacer le placeholder hardcodé (L.49) par la version dynamique

Exemple de dictionnaire :
```typescript
const PLACEHOLDERS: Record<string, string> = {
  immobilier: "Ex : je veux montrer un bien que je viens d'acquérir / je voudrais parler de pourquoi j'ai choisi le portage / j'ai envie de réagir à une actu immo...",
  coaching: "Ex : je veux partager une prise de conscience d'une cliente / je voudrais parler de pourquoi j'ai créé mon accompagnement / j'ai envie de réagir à un mythe du développement perso...",
  default: "Ex : je veux montrer un projet récent / je voudrais parler de pourquoi je fais ce métier / j'ai envie de réagir à une actu...",
};
```

**2. `src/pages/CreerUnifie.tsx`**
- Récupérer `activite` ou `type_activite` depuis le profil (probablement déjà dispo via un hook existant ou à fetcher)
- Passer `activite={activite}` à `<CreerStepIdea>`

**3. `src/lib/content-structures.ts`** (L.91)
- Optionnel : rendre les `exampleSubjects` aussi contextuels à terme, mais pas nécessaire pour ce fix

### Résultat
Auriana voit un placeholder parlant de biens immobiliers, portage, clauses suspensives. Une coach voit un placeholder parlant d'accompagnement. Fallback générique si activité inconnue.

