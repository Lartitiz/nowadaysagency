# Nettoyer les exemples codés en dur hors-sujet

## Le problème

Quand tu as écrit "décris tes photos en quelques mots", le placeholder affiche `Ex : 6 photos d'un soutien-gorge en dentelle ivoire, ambiance boudoir, lumière dorée`. C'est un exemple codé en dur qui ne tient pas compte de ton activité. Pareil pour d'autres champs : `chantier Acacias, J2 démolition`, `Mon tote bag en lin fait main`, etc.

Tant qu'on ne branche pas ces placeholders sur ton activité réelle (profile.activite), la règle saine c'est : **placeholders neutres et universels**, pas d'univers sectoriel imposé.

## Ce que je vais faire

### 1. Remplacer les placeholders sectoriels par des formulations neutres

| Fichier | Avant | Après (proposé) |
|---|---|---|
| `src/components/creer/PhotoUploadZone.tsx:418` | "6 photos d'un soutien-gorge en dentelle ivoire, ambiance boudoir, lumière dorée" | "Ex : 3 photos prises ce matin, ambiance lumineuse, ce que je voulais montrer en une phrase" |
| `src/components/creer/PhotoUploadZone.tsx:392` (contexte par photo) | "chantier Acacias, J2 démolition" | "Ex : le moment, le lieu ou le détail à retenir" |
| `src/components/creer/PhotoEditDialog.tsx:239` | "plage au coucher du soleil, bokeh chaleureux, ombre douce" | "Ex : ambiance, lumière, décor souhaité" |
| `src/pages/PinterestEpingles.tsx:107` | "Mon tote bag en lin fait main" | "Ex : le sujet de ton épingle (produit, conseil, inspiration…)" |
| `src/pages/PinterestTableaux.tsx:116` | "Bijoux artisanaux minimalistes" | "Ex : le thème de ton tableau" |
| `src/components/bio/BioGeneratorView.tsx:207` | "J'enseigne la com' en écoles de mode, j'ai cofondé un éco-lieu…" | "Ex : ce que tu fais, ce qui te rend unique, pour qui" |
| `src/components/prospection/DmGenerator.tsx:352` | "atelier Instagram, rebondir sur sa story d'hier…" | "Ex : l'intention du message (proposer un échange, rebondir sur un contenu…)" |

### 2. Garder tels quels (déjà neutres ou déjà personnalisés)

- `CreerStepIdea.tsx` : les exemples sont déjà indexés par activité (`deco_interieur`, etc.) → OK.
- `activity-examples.ts` : c'est le mécanisme propre qui adapte par métier → OK.
- `LandingPage.tsx` : la liste "bijoux, céramique, mode…" est une **énumération volontaire** pour montrer la diversité d'activités cibles → OK.
- Placeholders génériques type `Ex : photographe, coach, artisane…` : OK, c'est une liste neutre.

### 3. Hors scope (à traiter dans un autre passage si tu veux)

- `src/lib/content-structures.ts` (`exampleSubjects`) contient ~40 exemples de sujets codés en dur dont certains sont sectoriels ("colliers en velours", "tote bag en lin"). Ils ne s'affichent que dans certains modules de coaching contenu. Si tu veux je peux les neutraliser ou les rendre dynamiques dans un second passage, mais ça touche plus de surface.
- Les prompts internes côté edge functions (`newsjacking-ai` mentionne "lingerie" comme exemple pédagogique pour l'IA, pas visible utilisatrice) → à laisser, c'est de l'instruction pour le modèle.

## Fichiers modifiés

- `src/components/creer/PhotoUploadZone.tsx`
- `src/components/creer/PhotoEditDialog.tsx`
- `src/pages/PinterestEpingles.tsx`
- `src/pages/PinterestTableaux.tsx`
- `src/components/bio/BioGeneratorView.tsx`
- `src/components/prospection/DmGenerator.tsx`

Aucune migration, aucun changement de logique : uniquement des chaînes de placeholder.
