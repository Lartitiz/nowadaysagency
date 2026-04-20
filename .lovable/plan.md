

## Sauvegarder une actu pour plus tard depuis le panel Newsjacking

### Ce que tu veux

Quand une actu te plaît mais que tu n'as pas le temps de créer le contenu maintenant, pouvoir la **mettre de côté** pour la retrouver facilement plus tard. Pas la jeter (`Pas pour moi`), pas générer les angles tout de suite, juste la **bookmarker**.

### Comment ça marche (UX)

Sur chaque carte d'actu, en plus des boutons existants (`Voir les angles`, `Pas pour moi`), un nouveau bouton **`📌 Sauvegarder`** :

- Clic → l'actu (titre + résumé + source + axe + ton + pertinence) est enregistrée dans **Mes idées** (table `saved_ideas` qu'on a déjà)
- Toast confirmation : *"📌 Sauvegardée dans Mes idées"* avec un lien *"Voir"* qui ouvre `/idees`
- Le bouton se transforme en **`✓ Sauvegardée`** (état désactivé) pour éviter les doublons dans la même session
- L'actu **reste visible** dans la liste (contrairement à `Pas pour moi`) — tu peux toujours générer les angles ensuite si l'envie vient

### Comment on retrouve l'actu sauvegardée

Page **Mes idées** (déjà existante, `/idees`) — l'actu apparaît comme une carte avec :
- Titre = titre de l'actu (préfixé `📰`)
- Tag/angle = `actualité` + l'axe (ex. `science`, `économie`)
- Source = champ source de l'actu
- Notes = résumé + pertinence + lien source si dispo
- `source_module: "newsjacking"` → permet de filtrer plus tard
- `format: "actu"` (nouveau) → distingue d'une vraie idée de contenu

Quand tu rouvres l'idée plus tard depuis Mes idées (composant `IdeaDetailSheet`), tu vois l'actu, et un bouton **"Créer un contenu à partir de cette actu"** te renvoie vers `/creer` avec le sujet pré-rempli (réutilise la prop `onSelect` de NewsjackingPanel).

### Architecture technique

**Aucune migration DB** — la table `saved_ideas` a déjà tous les champs nécessaires :
- `titre` ← `actu.titre`
- `notes` ← résumé + pertinence + source URL
- `source_module` ← `"newsjacking"`
- `canal` ← `"instagram"` par défaut (l'actu n'a pas encore de canal)
- `format` ← `"actu"` (nouvelle valeur, libre car `string`)
- `angle` ← l'axe (`economie_argent`, `science_decouverte`…)
- `content_data` (JSON) ← l'objet `actu` complet pour pouvoir régénérer les angles plus tard
- `status` ← `"to_explore"` (déjà utilisé)
- `user_id` + `workspace_id` (isolation)

**Modifs `src/components/creer/NewsjackingPanel.tsx`** :
- Ajouter état `savedIdx: Set<number>` (les actus sauvegardées dans la session)
- Ajouter handler `handleSaveActu(idx, actu)` qui insère dans `saved_ideas` via supabase + toast
- Ajouter bouton `Bookmark` (lucide-react) à côté de `Pas pour moi`, désactivé si déjà dans `savedIdx`
- Toast Sonner avec action "Voir" → `navigate("/idees")`
- ~+40 lignes

**Modifs `src/components/calendar/IdeaDetailSheet.tsx`** (léger) :
- Si `idea.source_module === "newsjacking"` et `idea.format === "actu"` :
  - Afficher un bandeau spécial *"📰 Actualité sauvegardée"*
  - Afficher le bouton **"Créer un contenu à partir de cette actu"** qui navigue vers `/creer?subject=...&context=...` (les params seront lus côté `CreerUnifie.tsx` si déjà supporté, sinon via state navigation)
- Pas de refonte, juste un bloc conditionnel ~20 lignes

### Fichiers modifiés

| Fichier | Action |
|---|---|
| `src/components/creer/NewsjackingPanel.tsx` | Bouton "Sauvegarder" + handler insert + état local + toast |
| `src/components/calendar/IdeaDetailSheet.tsx` | Bandeau "Actualité" + bouton "Créer un contenu" si `source_module === "newsjacking"` |

### Hors scope

- Pas de nouvelle table (réutilise `saved_ideas`)
- Pas de migration
- Pas de filtre dédié "Actus sauvegardées" dans `/idees` (les actus apparaissent dans la liste générale, taggées `📰`) — peut être ajouté ensuite si besoin
- La génération des angles depuis une actu sauvegardée passera par le bouton "Créer un contenu" qui re-route vers `/creer` (pas de re-fetch d'angles depuis Mes idées dans cette phase)

### Validation

1. Sur `/creer` → Newsjacking, cliquer **Sauvegarder** sur 2 actus → toast OK, bouton devient `✓ Sauvegardée`
2. Aller sur `/idees` → les 2 actus apparaissent en haut (tri par date desc), avec emoji 📰 dans le titre
3. Ouvrir une actu sauvegardée → voir le bandeau "Actualité" + bouton "Créer un contenu"
4. Cliquer "Créer un contenu" → arrive sur `/creer` avec le sujet de l'actu pré-rempli
5. Rafraîchir le panel newsjacking → les boutons `✓ Sauvegardée` reviennent à l'état initial (état session uniquement, c'est OK : si on relance, on a de nouvelles actus)

### Risque

Très faible. Pas de DB, pas de logique IA, juste 1 insert + 1 bouton + 1 bandeau conditionnel. Réutilise des patterns existants (`SaveToIdeasDialog`, `IdeaDetailSheet`).

