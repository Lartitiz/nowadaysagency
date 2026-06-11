# Analyse du dashboard `/dashboard` (AdaptiveHome)

## Le problème

Le hero actuel mélange deux niveaux d'information dans la même hiérarchie visuelle :

```
✨ TA PROCHAINE ÉTAPE       ← micro-header
Continue sur ta lancée      ← titre énorme (display 26-30px)
Tu publies, c'est déjà énorme. Le secret c'est la régularité…
[ Créer un contenu → ]      ← CTA
🤔 Je sais pas quoi poster ? · On en discute
```

Symptômes observés :

1. **Le titre ne dit pas ce qu'on va faire.** "Continue sur ta lancée" est une phrase d'encouragement, pas une action. L'œil cherche "qu'est-ce que je dois faire ?" et ne le trouve qu'en bas, dans le bouton.
2. **"Sur ta lancée" est une expression floue** et sonne un peu cliché coaching. Le sens ("tu as déjà publié, continue") n'est pas porté par les mots.
3. **Incohérence entre variantes.** Selon l'état (`use-guide-recommendation.ts`), le titre est parfois une action claire ("Crée ton prochain contenu", P5/P7) et parfois une métaphore floue ("Continue sur ta lancée", P6 / "Pose les bases de ta com'" / "Active ton compte"…). L'utilisatrice ne sait jamais à quoi s'attendre.
4. **Le CTA secondaire "Je sais pas quoi poster"** vient écraser visuellement le CTA principal — il est placé juste sous, avec un emoji qui attire l'œil.

## Principe directeur

L'appel à l'action principal du produit est **toujours le même : créer un contenu.** Le hero doit donc avoir un titre **stable, actionnable, identique d'une session à l'autre**. La recommandation contextuelle ("tu publies déjà, bravo" / "ton branding prend forme") devient une **sous-ligne motivationnelle**, pas le titre.

## Proposition

### 1. Restructurer la hiérarchie du hero

```
✨ ON CRÉE QUOI AUJOURD'HUI ?           ← eyebrow, stable
Ton prochain contenu                     ← titre stable, court, clair
Tu publies déjà, c'est énorme — on garde le rythme.
                                         ← sous-ligne = phrase contextuelle
                                           (ex-titre rétrogradé)
[ Créer un contenu →  ]   ← CTA primaire, plein, dominant
↘ 4-5 chips formats : Post · Carousel · Reel · LinkedIn · Article
                                         ← raccourcis directs (déjà dans
                                           /dashboard/complet, à reprendre ici)

──────────────────────────────────────
Pas d'idée ? Discutes-en avec ta coach →  ← lien tertiaire discret
```

Concrètement dans `src/pages/AdaptiveHome.tsx` (lignes ~248-310) :

- Titre du hero : valeur **fixe** (`"Ton prochain contenu"` ou `"On crée ton prochain contenu ?"`), plus `recommendation.title`.
- La sous-ligne reprend `recommendation.explanation` raccourcie (1 ligne, `line-clamp-1`).
- Ajouter une rangée de **chips de format** (comme sur `/dashboard/complet` lignes 446-465) qui pré-remplit le format dans `/creer`. Ça donne immédiatement quoi cliquer.
- Déplacer "Je sais pas quoi poster" **sous la séparation**, en lien plus discret (taille réduite, sans emoji proéminent), pour ne plus concurrencer le CTA.

### 2. Nettoyer la copy des recommandations

Dans `src/hooks/use-guide-recommendation.ts`, comme le titre n'est plus affiché en grand, on transforme l'objet pour qu'il porte uniquement la **phrase motivationnelle d'une ligne** (le `explanation` actuel, raccourci) et le **ctaLabel** stable. Suppression des titres flous type "Continue sur ta lancée", "Pose les bases", etc. — ils étaient le bug racine.

Nouvelle structure proposée :

```ts
{
  motivation: "Tu publies déjà, c'est énorme — on garde le rythme.",
  ctaLabel: "Créer un contenu",
  ctaRoute: "/creer",
  alternatives: [...]   // inchangé, sert aux mini-cards
}
```

Les 7 variantes de phase (P1-P7) gardent chacune leur `motivation` adaptée, mais plus de titre concurrent.

### 3. Cohérence avec `/dashboard/complet`

Le dashboard complet (`Dashboard.tsx`) a déjà la bonne hiérarchie : titre fixe "Créer un contenu" + chips formats. On aligne `/dashboard` (AdaptiveHome) sur le même pattern, pour que l'expérience soit la même entre les deux vues.

## Hors-scope

- Pas de changement sur les mini-cards (C), Coach Card (E), missions (D).
- Pas de refonte de couleurs / tokens — uniquement structure + copy du hero.
- La logique de recommandation (quelle phase, quels alternatives) reste intacte ; seul le rendu change.

## Fichiers touchés

- `src/pages/AdaptiveHome.tsx` — refonte du bloc hero (lignes ~248-310).
- `src/hooks/use-guide-recommendation.ts` — simplification des objets retournés (titre → motivation 1 ligne).
- Éventuellement `src/pages/ChatGuidePage.tsx` si une variante de titre y est réutilisée (à vérifier au moment de l'implémentation).
