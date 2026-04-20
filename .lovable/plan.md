

## Diagnostic

**Problème 1 — "Quel objectif ?" alourdit le parcours**
L'écran `CreerStepIdea` demande à choisir parmi 7+ objectifs (chips) avant même d'avoir cliqué Suivant. C'est :
- Optionnel mais visuellement aussi grand que le champ idée → friction cognitive
- Redondant avec ce que l'IA peut déduire de l'idée + des questions ciblées de l'étape suivante
- Peu utilisé en pratique (on a déjà l'angle éditorial à l'étape format)

**Problème 2 — L'onglet "Transformer" passe inaperçu**
La barre `Tabs` ("✨ Créer / 🔄 Transformer") existe ligne 2075-2079 mais :
- Elle est noyée sous `BrandingStatusBanner` + (parfois) `SubPageHeader` + (parfois) `LowCreditsBanner` → on scrolle déjà avant de la voir
- Visuellement elle ressemble à un sous-élément, pas à un choix de mode
- Une fois dans le flow (step ≠ idea), la tab reste là mais on l'oublie

## Fix proposé — 2 fichiers

### 1. `src/components/creer/CreerStepIdea.tsx` — alléger
- **Retirer le bloc "Quel objectif ? (optionnel)"** (lignes 123-143) et le state `objective` associé
- Simplifier la signature : `onNext(idea: string)` au lieu de `onNext(idea, objective?)`
- Retirer prop `initialObjective`
- L'objectif sera déduit par l'IA à partir de l'idée + questions de l'étape Questions (déjà en place)

### 2. `src/pages/CreerUnifie.tsx` — adapter l'appelant + rendre l'onglet Transformer plus visible

**A. Adapter l'appel à `CreerStepIdea`**
- Mettre à jour `handleIdeaNext(idea)` (sans paramètre objective)
- Conserver `objective` en state pour les autres flows (coaching, recyclage) qui le passent encore explicitement
- Si la valeur n'arrive plus de l'idea step, elle reste `undefined` → backend gère déjà ce cas

**B. Rendre la séparation Créer / Transformer plus claire**
- Remonter les `Tabs` au-dessus de `BrandingStatusBanner` pour qu'elles soient le **premier élément visible** sous le header
- Style plus marqué : bordure douce, fond légèrement contrasté, hauteur un peu plus grande (`h-11` au lieu de défaut), labels plus parlants :
  - `✨ Partir de zéro` (au lieu de "Créer")
  - `🔄 Transformer un contenu existant` (au lieu de "Transformer")
- Sur viewport mobile : conserver les emojis seuls + label court si overflow

### Comportement préservé
- Coaching dialog continue d'envoyer un objectif explicite (via `handleCoachingSelect`)
- Recyclage / crosspost / inspire restent intouchés
- `OBJECTIVE_RECOMMENDATIONS` reste utilisé en interne pour les recommandations de format

## Validation
1. `tsc --noEmit --skipLibCheck` → 0 erreur
2. Écran idée : 1 textarea + 3 boutons (Aide-moi, Surfer sur l'actu, Partir de photos) + Suivant. Plus de bloc objectif.
3. Tabs Créer/Transformer visibles **immédiatement** en haut, labels plus explicites
4. Flow coaching → l'objectif sélectionné dans le dialog est toujours pris en compte côté format

## Hors scope
- Refonte complète du header / banners
- Suppression de `OBJECTIVE_RECOMMENDATIONS` (encore utile en interne)
- Modification du flow Transformer lui-même

