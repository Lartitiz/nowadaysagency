// Contrat des attributs HTML `data-*` des slides de carrousel (lot E1
// « robustesse », 14/10/2026 ; voir docs/creation-contenu/CARTE.md).
//
// Le HTML d'une slide passe de main en main : le serveur l'écrit
// (carousel-visual, carousel-ai et leurs modules _shared), l'éditeur visuel le
// lit et le retouche (src/lib/carousel-editor.ts, CarouselEditor.tsx), puis les
// exports PNG / PPTX le relisent. Ce qui relie ces trois mondes, ce sont des
// étiquettes invisibles (« ceci est le titre », « ceci est la photo 2 »,
// « ceci devient un bloc texte natif dans PowerPoint »). Renommer une étiquette
// d'un seul côté ne fait aucune erreur visible : l'éditeur, l'export et les
// contrôles qualité cessent simplement de fonctionner, y compris sur les
// carrousels déjà enregistrés.
//
// Ce fichier est la liste officielle. src/test/carousel-dom-contract.test.ts
// relit le code et échoue si :
//   - un attribut est utilisé sans être déclaré ici ;
//   - un attribut PARTAGÉ n'est plus écrit par le serveur ou plus lu par le front ;
//   - un attribut réservé à un côté apparaît de l'autre ;
//   - une valeur de data-slide-text n'est pas dans la liste.
// Ajouter ou renommer un attribut = le faire ici ET des deux côtés, et garder
// l'ancien nom lisible tant que des carrousels enregistrés le portent.

export interface DomAttribute {
  /** À quoi il sert, en une phrase. */
  role: string;
  /** Valeurs possibles quand elles sont fermées. */
  values?: readonly string[];
}

/** Écrits par le serveur, lus par l'éditeur ou les exports : le cœur du contrat. */
export const SHARED_ATTRIBUTES = {
  "data-slide-text": {
    role: "Élément qui contient directement un texte source de la slide ; l'éditeur y réécrit les retouches et les recopie dans les données.",
    values: ["title", "body", "overlay", "cta"],
  },
  "data-slide-cta": { role: "Enveloppe du bouton d'appel à l'action de la dernière slide (modifiable ou retirable d'un bloc)." },
  "data-slide-page": { role: "Pagination « 2/7 » : exclue des contrôles de taille de texte." },
  "data-decorative": { role: "Élément décoratif sans texte source (chiffre dupliqué, ornement)." },
  "data-pptx-editable": { role: "Bloc texte exporté comme zone de texte native dans PowerPoint / Canva (title, body, caption, overlay…)." },
  "data-pptx-shape": { role: "Forme exportée comme forme native (fond, carte, pastille, trait…)." },
  "data-pptx-photo": { role: "Emplacement de photo n° N, pour l'export et le remplacement de photo." },
  "data-injected-scrim": { role: "Voile de lisibilité posé sur une photo." },
  "data-mix-text": { role: "Bloc texte d'une slide de carrousel mixte (texte + photo)." },
  "data-photo-format": { role: "Format éditorial d'une slide photo (étapes, liste…)." },
  "data-photo-style": { role: "Style de texte sur photo (verre, colonne…)." },
  "data-photo-text-layout": { role: "Disposition du texte sur une slide photo." },
  "data-photo-column-text": { role: "Colonne de texte du style « colonne »." },
  "data-photo-reading-panel": { role: "Panneau de lecture derrière le texte d'une slide photo." },
  "data-photo-glass": { role: "Cadre « verre » derrière le texte d'une slide photo." },
  "data-photo-glass-blur": { role: "Couche de flou du cadre « verre »." },
  "data-photo-editorial-text": { role: "Texte éditorial sur photo (découpé en parties mises en valeur)." },
  "data-photo-editorial-veil": { role: "Voile du traitement éditorial (opacité réglable dans l'éditeur)." },
  "data-photo-emphasis": { role: "Phrase mise en valeur dans un texte éditorial sur photo." },
  "data-photo-text-part": { role: "Partie d'un texte éditorial découpé." },
} as const satisfies Record<string, DomAttribute>;

/** Propres au serveur (rendu, garde-fous, télémétrie) : le front ne doit pas en dépendre. */
export const SERVER_ONLY_ATTRIBUTES = {
  "data-carousel-layout": { role: "Mise en page choisie (télémétrie, mémoire de disposition)." },
  "data-cover": { role: "Slide de couverture." },
  "data-design-version": { role: "Version du moteur de mise en page." },
  "data-format-block": { role: "Bloc d'un schéma de format (garde-fou de texte inventé)." },
  "data-mix-schema": { role: "Schéma dessiné d'une slide mixte." },
  "data-photo-editorial-surface": { role: "Surface du traitement éditorial sur photo." },
  "data-photo-step": { role: "Étape numérotée d'un format photo." },
  "data-photo-step-label": { role: "Libellé d'une étape numérotée." },
  "data-text-block": { role: "Bloc texte du plan de design." },
} as const satisfies Record<string, DomAttribute>;

/** Propres au front (éditeur, exports, écrans) : le serveur ne les écrit jamais. */
export const FRONT_ONLY_ATTRIBUTES = {
  "data-editor-id": { role: "Identifiant d'un élément éditable, posé par l'éditeur." },
  "data-editor-locked": { role: "Élément verrouillé dans l'éditeur." },
  "data-editor-shape": { role: "Forme éditable reconnue par l'éditeur." },
  "data-editor-photo": { role: "Photo éditable reconnue par l'éditeur." },
  "data-editor-photo-empty": { role: "Cadre photo vide." },
  "data-editor-free": { role: "Copie libre (Dupliquer) : ne réécrit pas le texte source." },
  "data-editor-hidden": { role: "Calque masqué." },
  "data-editor-new": { role: "Élément ajouté par l'éditeur (Ajouter)." },
  "data-editor-copy": { role: "Élément collé." },
  "data-editor-display": { role: "Affichage d'origine d'un calque masqué." },
  "data-editor-unwrapped": { role: "Cadre retiré (le texte reste)." },
  "data-emphasis-color": { role: "Couleur d'un mot mis en valeur dans l'éditeur." },
  "data-photo-filter": { role: "Filtre de retouche photo posé par l'éditeur." },
  "data-schema-fit": { role: "Ajustement d'un schéma au texte (front)." },
  "data-schema-fit-key": { role: "Clé de l'ajustement d'un schéma." },
  "data-pptx-hide": { role: "Élément déjà capturé par l'export PPTX (posé pendant l'export)." },
  "data-pptx-photo-hide": { role: "Photo masquée pendant l'export PPTX." },
  "data-pptx-shape-hide": { role: "Forme masquée pendant l'export PPTX." },
  "data-story-mode": { role: "Rendu PNG d'une story." },
  "data-story-pptx": { role: "Export PPTX d'une story." },
  "data-story-rasterized-pill": { role: "Pastille de story rendue en image." },
  "data-placeholder": { role: "Texte d'invite d'un champ vide (écran de résultat)." },
  "data-canvas-sticky": { role: "Interface de l'éditeur : zone de dessin fixe." },
  "data-font-preview": { role: "Interface de l'éditeur : aperçu de police." },
  "data-handle": { role: "Interface de l'éditeur : poignée de redimensionnement." },
  "data-thumb": { role: "Interface de l'éditeur : vignette de slide." },
  "data-testid": { role: "Repère pour les tests." },
} as const satisfies Record<string, DomAttribute>;

export const SLIDE_TEXT_FIELDS = SHARED_ATTRIBUTES["data-slide-text"].values;
