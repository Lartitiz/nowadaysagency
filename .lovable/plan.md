## (a) Ce que tu demandes — implémentation des filtres repliés

### 1. State local
Ajouter `const [filtersOpen, setFiltersOpen] = useState(false);` dans `IdeasPage.tsx`.

### 2. Ligne visible (sticky)
Sur la ligne Statut existante (l. 296-301) :
- **Gauche** : les chips Statut ("Tout" + 5 statuts) — **strictement inchangés**
- **Droite** : le sélecteur de tri (déplacé depuis la ligne Type) + le bouton "Filtres"
- Le sélecteur et le bouton s'alignent à droite de la ligne via `flex justify-between` ou `ml-auto gap-2`

### 3. Bouton "Filtres"
- Icône `SlidersHorizontal` (lucide-react)
- Label : `"Filtres"` si 0 actif, sinon `"Filtres · N"`
- Compteur : nombre de filtres parmi Objectif / Canal / Type qui ne sont pas sur `"all"`
- Toggle : `onClick={() => setFiltersOpen(v => !v)}`
- Style : chip-like (`rounded-lg`, `border`, `px-2 py-1`, `text-[11px]`) ou `Button` variant outline, selon cohérence visuelle

### 4. Panneau dépliable
Utiliser le composant `Collapsible` déjà présent (`src/components/ui/collapsible.tsx`, Radix UI natif) :
- `<Collapsible open={filtersOpen}>`
- `<CollapsibleContent>` contient les 3 groupes de chips actuels :
  - Ligne Objectif (l. 304-308)
  - Ligne Canal (l. 310-316)
  - Ligne Type (l. 319-323)
- Les chips et leur logique sont strictement inchangées — seul l'emballage change
- Ajouter un lien/bouton "Réinitialiser" dans le panneau :
  - `onClick={() => { setObjectifFilter("all"); setCanalFilter("all"); setTypeFilter("all"); }}`
  - Ne touche pas `statusFilter` ni `sort`

### 5. Layout sticky
Le conteneur sticky (l. 294) garde son `className` et son `z-30`. La structure interne devient :
```
sticky container
  ├── ligne visible : Statut (gauche) + tri + bouton Filtres (droite)
  └── CollapsibleContent
        ├── ligne Objectif
        ├── ligne Canal
        ├── ligne Type
        └── Réinitialiser
```

### 6. Invariants
- `filtered` useMemo : inchangé
- `STATUS_OPTIONS`, `OBJECTIF_OPTIONS`, `CANAL_OPTIONS`, `TYPE_OPTIONS`, `SORT_OPTIONS` : inchangés
- `FilterChip` : inchangé
- States de filtre : conservés, seul leur emplacement d'affichage change
- Rendu des cartes, Dialog de détail, handlers : inchangés

---

## (b) Proposition d'amélioration — animation propre

Le projet a déjà `<Collapsible>` (shadcn / Radix UI) à `src/components/ui/collapsible.tsx`. Je te propose de l'utiliser plutôt qu'une logique maison `filtersOpen && ...` :
- Avantage : animation d'ouverture/fermeture douce native (hauteur CSS animée), accessibilité clavier (Enter/Espace sur le trigger), état `data-state="open|closed"` pour styling.
- Inconvénient : aucun, c'est un wrapper léger autour de Radix.

Alternative si tu préfères éviter Collapsible : un simple `filtersOpen && <div className="animate-in slide-in-from-top-2 ...">` avec Tailwind `animate-in` — plus léger mais moins accessible.

**Ma recommandation : utiliser le `Collapsible` déjà présent.**

---

## Validation prévue
- `npx tsc --noEmit --skipLibCheck` → 0 erreur
- Au chargement : seule la ligne Statut + tri + "Filtres" est visible
- Clic "Filtres" → panneau s'ouvre avec Objectif/Canal/Type + "Réinitialiser"
- Sélectionner un Objectif, fermer le panneau → compteur "Filtres · 1" reste visible, filtre actif
- "Réinitialiser" remet les 3 filtres sur "all", panneau reste ouvert (ou se ferme — au choix, je laisserai ouvert par simplicité)

## Hors scope
- Badges redondants sur les cartes (chantier C)
- Toute modification du chantier A (cartes)
