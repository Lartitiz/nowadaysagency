# Plan — Alléger la sélection d'angle éditorial

## Contexte

Aujourd'hui, après avoir choisi un canal et un format, l'utilisatrice voit **8 cartes d'angle éditorial** (Décryptage expert, Storytelling pro, Étude de cas, Coulisses, Conseil contre-courant…) plus un bouton "L'outil choisit pour moi". C'est lourd : titre, sous-titre, gros bouton IA, section "Recommandées pour ton objectif", section "Autres approches", chaque carte avec emoji + titre + description longue.

Or, dans 95 % des cas, le bon angle peut être **inféré par l'IA** à partir de l'idée + l'objectif + l'identité de marque. Mais on veut garder un contrôle pour les expertes qui veulent forcer un ton précis (ex. "prise de position" sur un sujet sensible), et un filet de sécurité après génération.

## Ce que ça change pour l'utilisatrice

**Avant** (bloc qui prend ~600 px de hauteur) :
```text
Comment tu veux en parler ?
Chaque approche donne un ton et une structure différente…

[ ✨ L'outil choisit pour moi ]

📌 Recommandées pour ton objectif
[ Carte angle 1 ]
[ Carte angle 2 ]
[ Carte angle 3 ]

Autres approches
[ Carte angle 4 ]
[ Carte angle 5 ]
[ Carte angle 6 ]
[ Carte angle 7 ]
[ Carte angle 8 ]
```

**Après** (par défaut, ~80 px) :
```text
✨ L'IA va choisir l'angle parfait
   Selon ton idée, ton objectif et ta voix de marque.
   ▸ Choisir mon angle moi-même
```

Si elle clique sur "Choisir mon angle moi-même", les 8 cartes apparaissent (même UI qu'aujourd'hui, mais sans la section "📌 Recommandées" qui devient inutile puisqu'on délègue à l'IA — on liste juste les 8 angles dans l'ordre). Un bouton "Revenir au choix automatique" permet de replier.

**Sur l'écran résultat**, ajout d'un bouton discret à côté de "Régénérer" :
```text
[ 🔄 Régénérer ]   [ 🎨 Changer l'angle ▾ ]
```
Le menu déroulant liste les 8 angles. Clic = relance la génération avec ce nouvel angle (réutilise le `handleRegenerate` existant en surchargeant `editorialAngle`).

## Architecture (technique)

### Fichiers touchés

1. **`src/components/creer/CreerStepFormat.tsx`** (modif principale, lignes 606-639)
   - Nouvel état local `expandAngles: boolean` (default `false`).
   - Quand `showAngles && !expandAngles` → afficher la nouvelle carte compacte "L'IA va choisir l'angle parfait" + lien "Choisir mon angle moi-même".
   - Quand `expandAngles === true` → afficher les 8 cartes (sans la section "Recommandées pour ton objectif"), précédées d'un lien "← Revenir au choix automatique".
   - Le bouton compact appelle `handleNext()` directement (= comportement actuel "L'outil choisit pour moi").
   - Supprimer la mention "📌 Recommandées pour ton objectif" et fusionner `recommended` + `others` en une seule liste ordonnée (recommended d'abord pour garder l'ordre par pertinence, mais sans le label séparateur).
   - Mettre à jour le mini-recap (ligne 729-731) : `"angle à choisir (ou laisse l'IA décider)"` → `"l'IA choisira l'angle"`.

2. **`src/components/creer/CreerStepResult.tsx`**
   - Nouvelle prop optionnelle `onChangeAngle?: (angleId: string) => void` et `currentChannel?: string` (pour piocher la bonne liste d'angles : Instagram/post → `EDITORIAL_ANGLES`, LinkedIn → `LINKEDIN_EDITORIAL_ANGLES`, Pinterest → `PINTEREST_EDITORIAL_ANGLES`).
   - À côté du bouton "Régénérer" déjà câblé, ajout d'un `DropdownMenu` shadcn avec 8 items + un item "✨ Laisser l'IA choisir" (= passe `null`).
   - Si `onChangeAngle` n'est pas fourni, le bouton ne s'affiche pas (rétro-compat sécurisée pour les autres usages du composant).

3. **`src/pages/CreerUnifie.tsx`**
   - Nouveau handler `handleChangeAngle(newAngle: string | null)` qui :
     1. `setEditorialAngle(newAngle)`
     2. Appelle `handleRegenerate()` (déjà existant, ligne 2412)
   - Passé en prop à `<CreerStepResult onChangeAngle={handleChangeAngle} currentChannel={selectedChannel} />`.

### Logique IA (backend)

**Aucun changement nécessaire côté Edge Functions.** La logique "si pas d'angle → l'IA choisit" existe déjà dans `carousel-ai`, `linkedin-ai` et `creative-flow` (lignes 174, 195, 238, 260 de `carousel-ai/index.ts` : `${body.editorial_angle ? \`Angle éditorial : \${body.editorial_angle}\` : "L'IA choisit le meilleur angle."}`).

**On ne touche pas non plus au prompt IA pour "renforcer" le choix d'angle.** L'utilisatrice a explicitement choisi de tout déléguer à l'IA sans biais d'objectif. Le prompt actuel suffit : il connaît l'idée, l'objectif, l'identité de marque, et il choisit librement.

### Logique "objectif → angles recommandés"

La fonction `getAnglesForType(contentType, objective)` continue d'exister (utilisée pour ordonner les cartes quand l'utilisatrice déplie). Mais elle ne sert plus à filtrer ou prioriser côté IA — l'IA choisit librement. La constante `OBJECTIVE_RECOMMENDATIONS` reste en place pour ne rien casser, mais devient purement un détail d'affichage (ordre par défaut dans la liste dépliée).

## Périmètre confirmé

- ✅ **Tous les formats** : carrousel Instagram/LinkedIn, post photo, story, reel, post LinkedIn, newsletter, Pinterest, Pinterest visuel. Tout passe par le même `CreerStepFormat.tsx` → un seul changement couvre tout.
- ✅ **Filet post-génération** : bouton "Changer l'angle" sur l'écran résultat.
- ❌ **Pas touché** : Pinterest inspiration (pas de sélecteur d'angle, on uploade une capture).

## Hors-scope (pour rester focus)

- Refonte des cartes d'angle elles-mêmes (descriptions, emojis, libellés).
- Modification des prompts Edge Functions pour mieux choisir l'angle.
- Refonte de la logique `OBJECTIVE_RECOMMENDATIONS`.
- Ajout d'un mode "ton" (Équilibré/Tranché/Narratif) — c'était une alternative explorée puis écartée.

## Risques / points de vigilance

- **Régression Pinterest** : sur `pinterest_visual`, l'angle pilote le `pin_type` (cf. `CreerUnifie.tsx` ligne 815 : `editorialAngle || "infographie"`). Si l'utilisatrice ne déplie pas, l'IA passe `null` → fallback sur `"infographie"`. À vérifier que ce fallback est acceptable, sinon forcer le dépliage automatique pour Pinterest visuel.
- **Mode Lancement** : `editorialAngle === "lancement"` active un mode spécial (`isLaunchMode`, ligne 2221). Ce mode est déclenché par un autre chemin (séries de lancement) et ne passe pas par la sélection manuelle ici → pas de régression attendue, mais à reconfirmer en testant.
- **Persistance** : le store sessionStorage (`use-flow-persistence`) sérialise déjà `editorialAngle`. Le changement post-génération via `handleChangeAngle` doit déclencher la sauvegarde — c'est automatique car `editorialAngle` est dans les deps du `useEffect` de persistance (ligne 366).
