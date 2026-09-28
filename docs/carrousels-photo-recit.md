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

## Design relié à la charte — 28 septembre 2026

Les huit gabarits photo utilisent les polices de titre/corps et les couleurs de rôle de la marque. `color_primary`, `color_secondary` et `border_radius` sont maintenant transmis au compositeur. Les passages développés, listes, chiffres, étapes et citations ont une surface locale opaque ; couleur de texte, titre et accent y sont vérifiés à 4,5:1. Les repères et invitations fournis utilisent la couleur primaire et ses contrastes. Pas de capitale espacée, d’italique ou de pastille universels ; graisse de titre explicite 400 et formes issues de la charte. Les points d’une liste sont conservés en entier.

Le nettoyage final des surtitres compare désormais aussi kicker, détail et attribution au contenu source, pour ne pas effacer des éléments éditoriaux fournis. Le modèle étape place numéro et titre sur une ligne. Le prompt mixte utilise le fond de marque et respecte les layouts confirmés même répétés. Les références visuelles uploadées et les consignes libres restent dans leurs parcours existants ; cette passe ne crée pas de moteur d’analyse Pinterest.

Export PNG/JPEG : le canvas de capture est créé dans le document de la slide, où ses polices sont chargées. Le canvas par défaut de html2canvas appartenait à la page React et pouvait remplacer une police uniquement chargée dans l’iframe par Georgia. Reproduction visuelle avant/après avec Space Grotesk. Attente explicite des polices des éléments de carrousel, comme pour les stories.

Recherche : hiérarchie et rythme éditorial dans « Art Talk » (Tabitha Meadows, Behance), espaces et diversité de cadrage dans la série Paper Moon. Les modèles commerciaux n’ont été ni téléchargés ni copiés. Pas de preuve de performance Instagram déduite de ces références. Validation : trois chartes, huit gabarits et photo brute sur fixtures ; PNG exportés. Une génération authentifiée et le rendu natif PPTX demeurent distincts.
