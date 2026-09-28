# Carrousels photo : récit et lecture — 28 septembre 2026

## Contrat

Le parcours conserve ses étapes et ses modes. Le récit se prépare avec le sujet, les réponses et les photos déjà fournis. Les overlays participent à un texte continu : entrée, progression, aboutissement. Aucune confession, tension ou transformation obligatoire pour une audience générale.

- Longueur commune à la proposition et à la rédaction : structure confirmée, répartition manuelle, nombre demandé, puis matière disponible.
- Deux photos ne déclenchent plus un avant/après automatique.
- La structure confirmée prime sur les affectations du modèle. Les répétitions valides restent intactes ; seuls les index invalides sont réparés.
- Métadonnées de bibliothèque transportées séparément du contexte utilisateur, y compris lors de la reprise et de la rédaction sans nouvel envoi d'images. Ces métadonnées peuvent être inférées et ne prouvent aucun vécu.
- Les passages photo peuvent développer leurs liens et nuances. Le gabarit de prose utilise une surface locale opaque aux couleurs de la charte au-delà de 28 mots (kicker et détail compris), avec contraste calculé. Les textes restent natifs et éditables.
- La vision propose une position du texte préservant le sujet, transmise dans le plan confirmé. Ce conseil ne constitue pas une détection géométrique garantie des visages ou objets.
- Les répétitions ne provoquent plus de zoom automatique. L'éditeur propose « Voir toute la photo » et le déplacement du groupe de texte (haut/bas/centre), avec annulation et conservation dans le HTML exporté.
- Une légende courte ne déclenche plus de fausse alerte d'échec.

## Validation

Suites Vitest et Deno, typage TypeScript de l'app, typage Deno des deux fonctions modifiées, lint accessibilité, Knip et build. Les tests des handlers inspectent les prompts réellement envoyés, avec les services externes simulés.

Recette navigateur locale sur le véritable compositeur et le véritable éditeur : prose de service, charte claire/sombre, photo brute, photo intégrée et texte design ; vue 390 px ; retouches d'une slide ; export PNG et PPTX via les fonctions de production. PNG ouverts et textes natifs du PPTX inspectés. Ces fixtures ne prouvent pas une génération IA authentifiée. L'ouverture/édition native PowerPoint et la recette de génération en compte connecté sont à distinguer de ces contrôles.

Aucune migration. Déployer `carousel-ai` et `carousel-visual` puis le frontend. Les anciens contenus ne sont pas régénérés.
