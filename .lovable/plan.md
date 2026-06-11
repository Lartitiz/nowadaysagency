## Objectif

Ajouter un bouton **"Transformer en…"** à côté de `Copier` sur l'écran de résultat (`CreerStepResult`). Il ouvre une nouvelle session de création dans un **nouvel onglet**, pré-remplie avec le même brief (sujet, objectif, angle) mais ciblant un autre format. Le résultat actuel reste intact : c'est de la duplication adaptative, pas un remplacement.

## Pourquoi cette approche

- Tu as déjà un module `CreerTransformTab` (recycle / crosspost / inspire) pour transformer un contenu *quelconque*. Le nouveau bouton n'écrase pas ça : il sert un autre besoin — partir d'un contenu *qu'on vient de générer* pour le décliner sans ressaisir le brief.
- Le flow `CreerUnifie` lit déjà ces URL params : `format`, `canal`, `sujet`/`subject`, `objectif`/`objective`, `angle`, `mode`, `from` (lignes 98-110). Un nouvel onglet avec ces params boote propre, sans toucher au sessionStorage de l'onglet courant.
- Pas de nouvelle Edge Function. Pas de nouvel état partagé. Pas de risque de régression sur le résultat affiché.

## Fichiers impactés

1. `src/components/creer/CreerStepResult.tsx` — ajouter le menu Transformer.
2. `src/pages/CreerUnifie.tsx` — passer `ideaText`, `objective`, `editorialAngle` en props vers `CreerStepResult` (2 call sites lignes 2520 et 2617) + ajouter le support `autoStart` côté params.

Aucun autre fichier touché.

## Détail du menu

À placer dans le bloc "Actions secondaires" (lignes 451-459), juste après le bouton `Copier` (ordre visuel : Sauvegarder · Copier · **Transformer en…** · Télécharger · Changer d'angle).

```text
[ ↗ Transformer en ▼ ]
  ├─ 🎠 Carrousel Instagram
  ├─ 📸 Post Instagram
  ├─ 🎬 Reel
  ├─ 📱 Stories
  ├─ 💼 Post LinkedIn
  ├─ 📧 Newsletter
  ├─ 📌 Pinterest visuel
  └─ 📌 Pinterest photo
```

Règle : on **filtre le format courant** de la liste (on ne propose pas "Transformer un carousel en carousel"). Si le format courant est `carousel` avec sous-mode photo, on garde "Carrousel Instagram" hors menu et on propose les autres.

Au clic sur une entrée :

```ts
const params = new URLSearchParams({
  sujet: ideaText,
  objectif: objective || "",
  format: targetFormat,
  ...(editorialAngle ? { angle: editorialAngle } : {}),
  from: "transform",
});
window.open(`/creer?${params.toString()}`, "_blank", "noopener");
```

`from=transform` est juste un marqueur analytique (pas de logique nouvelle requise dans `CreerUnifie`, mais utile pour tracer plus tard).

## Comportement dans le nouvel onglet

Aucune modification de logique requise : `CreerUnifie` lit déjà `paramFormat`/`paramCanal`/`paramSujet`/`paramObjectif`/`paramAngle` et pré-remplit l'état (lignes 396-432). L'utilisatrice atterrit sur l'étape **Format** avec sujet et objectif déjà saisis, format pré-coché et angle pré-sélectionné si applicable. Elle clique "Continuer" et le flow normal prend la suite (questions de brief, structure review pour carousel, etc.).

On **n'auto-lance pas** la génération côté nouvel onglet : certains formats demandent des choix supplémentaires (sous-mode carousel texte/photo/mix, photos à uploader pour reel/story, etc.). Auto-skipper ces étapes mènerait à des résultats incohérents.

## Edge cases à gérer

1. **`ideaText` vide** (cas démo, ou résultat chargé depuis le calendrier) → désactiver le bouton avec tooltip "Disponible après une génération".
2. **`pinterest_inspiration` et `pinterest_photo` source** → ces formats ont des prérequis (capture d'écran, photo) que le nouvel onglet ne peut pas hériter. On les exclut du `format courant` mais on les garde dans les *cibles* possibles (l'utilisatrice complétera dans le nouvel onglet).
3. **Carousel photo (avec photos uploadées)** → on ne tente PAS de transférer les photos via URL. Si la cible est "Reel" ou "Story" qui peuvent les utiliser, l'utilisatrice ré-uploade dans le nouvel onglet. Acceptable pour un MVP.
4. **Mobile** → menu dropdown standard shadcn, déjà responsive comme "Changer d'angle".

## Validation

- Bouton "Transformer en…" visible dans la rangée Actions sur tous les formats.
- Clic sur "Newsletter" depuis un résultat carousel ouvre `/creer?sujet=...&objectif=...&format=newsletter&from=transform` dans un nouvel onglet.
- L'onglet d'origine n'est pas modifié (résultat carousel toujours affiché, sessionStorage intact).
- Le nouvel onglet affiche l'étape Format avec Newsletter pré-sélectionnée et le sujet/objectif pré-remplis.
- `tsc --noEmit --skipLibCheck` clean.

## Hors scope

- Persistance des photos uploadées entre onglets.
- Génération automatique au chargement (déclencherait sur des formats incomplets).
- Synchronisation cross-onglets si l'utilisatrice veut comparer côte à côte (les deux onglets sont indépendants, ce qui est exactement le comportement attendu pour de la duplication).
- Modifier `CreerTransformTab` (recycle/crosspost/inspire) — il garde son rôle pour les contenus externes.
