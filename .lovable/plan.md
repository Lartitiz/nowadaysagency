## Plan — Fix masquage cascade enfants (export PPTX hybride)

### (a) Demande utilisateur

**Fichier** : `src/lib/export-carousel-hybrid-pptx.ts` (bloc `<style>` dans `mountIframe`, ligne ~57)

**Modification unique** : étendre le sélecteur de masquage aux enfants.

```css
/* AVANT */
[data-pptx-hide="true"] {
  color: transparent !important;
  text-shadow: none !important;
  -webkit-text-fill-color: transparent !important;
}

/* APRÈS */
[data-pptx-hide="true"],
[data-pptx-hide="true"] * {
  color: transparent !important;
  text-shadow: none !important;
  -webkit-text-fill-color: transparent !important;
  background-clip: text !important;
  -webkit-background-clip: text !important;
}
```

Aucune autre logique touchée. Aucun autre fichier modifié.

### (b) Propositions d'amélioration (à valider/refuser individuellement)

J'ai relu `mountIframe` et identifié 3 cas de fuite résiduelle possibles. Chacun est indépendant et peut être validé séparément.

**Proposition #1 — Neutraliser les pseudo-éléments `::before` / `::after**`
Si un span enfant utilise `::before { content: "→"; color: #FB3D80; }` pour décorer, le contenu décoratif restera visible dans la rasterisation. Ajout proposé :

```css
[data-pptx-hide="true"]::before,
[data-pptx-hide="true"]::after,
[data-pptx-hide="true"] *::before,
[data-pptx-hide="true"] *::after {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  text-shadow: none !important;
}
```

Risque : nul (uniquement masquage de couleur, pas de `content: none`).

**Proposition #2 — Neutraliser les `background-image` de type gradient texte**
Pattern courant chez les designers : `background: linear-gradient(...); -webkit-background-clip: text; color: transparent;` pour un texte dégradé. Mon `background-clip: text !important` du fix principal force le clip mais le gradient reste appliqué au remplissage. Pour être sûr :

```css
[data-pptx-hide="true"],
[data-pptx-hide="true"] * {
  background-image: none !important;
}
```

Risque : faible. Limite : si un span enfant a un `background-image` décoratif (icône SVG inline en background), elle disparaîtra aussi. Acceptable car ces éléments doivent passer par la rasterisation initiale, pas être masqués.

**Proposition #3 — Ne pas toucher aux enfants `position: absolute` qui débordent**
Cas inverse : un enfant en `position: absolute` ancré dans un bloc body annoté pourrait être un élément décoratif (badge, sticker) qu'on veut garder visible. Le sélecteur `[data-pptx-hide="true"] *` les masquerait aussi.

**Recommandation** : ne RIEN faire de spécial pour ce cas tant qu'il n'est pas observé en production. Documenter le comportement dans un commentaire au-dessus du bloc CSS :

```ts
// NB: tous les descendants d'un bloc annoté sont masqués pour éviter le double-rendu.
// Si un descendant doit rester visible (badge, sticker), ne pas annoter le parent
// en data-pptx-editable — annoter chaque sous-bloc texte individuellement.
```

Risque : nul (pure documentation).

### Hors scope confirmé

Pinterest exports, export classique, export PNG, edge functions, logique d'extraction, addBlockToSlide, dispatcher de stratégie — tous intacts.

### Validation

- `tsc --noEmit` (lancé automatiquement par le harness Lovable, je ne le déclenche pas manuellement).
- Test visuel à ta charge : régénérer un carrousel avec span coloré inline et exporter PPTX hybride.

### Décisions à prendre avant exec

- Proposition #1 (pseudo-éléments) : ✅ / ❌
- Proposition #2 (background-image none) : ✅ / ❌
- Proposition #3 (commentaire doc) : ✅ / ❌

Réponds avec tes choix ou « approve » pour appliquer uniquement le fix demandé sans les propositions.

&nbsp;

✅ Validé pour exec, avec les 3 propositions intégrées :

- Proposition #1 (pseudo-éléments ::before / ::after) : ✅ APPROUVÉ

- Proposition #2 (background-image: none sur les blocs masqués) : ✅ APPROUVÉ

- Proposition #3 (commentaire de documentation) : ✅ APPROUVÉ

Tu peux passer en Exec sur cette base.