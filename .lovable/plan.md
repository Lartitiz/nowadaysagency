# Audit des stats Instagram

## Ce que j'ai trouvé

### 🔴 Bug confirmé : le taux d'engagement est faux

Deux problèmes dans `InstagramStats.tsx` + `StatsForm.tsx` + `StatsCharts.tsx` :

**1. Mauvaise formule.** Aujourd'hui : `interactions / reach × 100`.
- C'est un mix bizarre : `interactions` compte les actions totales (likes + commentaires + saves + partages, donc plusieurs par personne), pendant que `reach` compte des comptes uniques. Le ratio peut dépasser 100% et ne veut pas dire grand-chose.
- La convention Instagram propre c'est : `accounts_engaged / reach` (taux d'engagement par portée) — et tu as déjà le champ `accounts_engaged` dans le formulaire, on ne l'utilise nulle part dans le KPI.

**2. Moyenne des moyennes.** Sur une période (3 mois, 6 mois), le KPI fait la moyenne des % mensuels — un mois à 50 de reach pèse autant qu'un mois à 50 000. Il faut une moyenne pondérée : `Σ accounts_engaged / Σ reach`.

### 🟠 Autres trucs à nettoyer

- **CA et clients partout** : carte KPI "💰 CA", chart "CA et clients", lignes "CA" + "Clients" dans la table de comparaison, étapes "Clients" dans le funnel. À retirer de la vue Instagram.
- **Funnel** : la dernière étape "Clients/Achat/Projet" mélange business et social → à raccourcir à un funnel purement Instagram → site.
- **"Followers en +"** : la donnée est saisie mais n'apparaît dans aucun graphique de tendance.
- **Stats sous-exploitées** : `profile_visits`, `website_clicks`, `accounts_engaged`, `followers_engaged`, `views` existent mais on n'a aucun graphique dessus.

## Ce que je propose de faire

### 1. Corriger le taux d'engagement

- Formule : `accounts_engaged / reach × 100` (fallback `interactions / reach` si `accounts_engaged` vide pour ne pas casser l'historique).
- Sur une période : moyenne pondérée `Σ engaged / Σ reach`, pas la moyenne des %.
- Petit label "?" sur la carte qui explique la formule en clair.
- Bonus : afficher aussi le **taux d'engagement par abonné·es** (`interactions / followers`) en sous-ligne — c'est la métrique que beaucoup d'outils externes utilisent, ça évite la confusion.

### 2. Retirer toute la partie CA / clients

- KPI card "CA" → retirée (on passe à 3 cartes, ou on en ajoute une nouvelle, voir §3).
- Chart "CA et clients" → supprimé.
- Lignes "CA" + "Clients" dans la table de comparaison → supprimées.
- Funnel : on garde Reach → Visites profil → Clics site → Pages vente (ou Inscrits email). Plus de "Clients signés".
- Le formulaire de saisie garde les champs business (utile pour la page Lancement / pour l'IA), mais la vue Instagram ne les affiche plus.

### 3. Nouvelles visualisations (à valider avec toi)

Propositions, dis-moi lesquelles tu gardes :

- **A. Carte KPI "Croissance nette"** : `followers_gained − followers_lost` du mois, avec mini-tendance. Remplace la carte CA.
- **B. Graphique "Acquisition de followers"** : barres mensuelles `+gained / −lost` avec ligne de croissance nette. Très lisible pour voir les bons/mauvais mois.
- **C. Graphique "Du contenu au profil"** : ligne combo `Reach`, `Profile visits`, `Website clicks` sur la même période → on voit le taux de conversion descendre étape par étape.
- **D. Graphique "Qualité de l'audience"** : taux d'engagement (%) + % de followers qui interagissent, sur la durée.
- **E. Mini-comparatif "Ce mois vs mois précédent"** : 4-6 petites stats avec flèches, en haut, en plus des KPI (lecture express).

Mon recommandé : **A + B + C + D**. E si tu veux un coup d'œil "qu'est-ce qui a bougé ce mois".

## Détails techniques

Fichiers touchés :
- `src/components/stats/stats-types.ts` — `DashboardKPIs` : retirer `totalRevenue`/`changeRevenue`, ajouter `netGrowth`/`changeNetGrowth` + `engagementByFollowers`.
- `src/pages/InstagramStats.tsx` — recalcul `dashboardKPIs` (moyenne pondérée, nouvelle formule, growth), `chartData` (ajouter `gained`, `lost`, `net`, `profile_visits`, `website_clicks`).
- `src/components/stats/StatsOverview.tsx` — remplacer carte CA par Croissance nette, ajouter tooltip formule sur Engagement.
- `src/components/stats/StatsCharts.tsx` — supprimer chart `RevenueChart`, ajouter "Acquisition followers" + "Du contenu au profil", retirer lignes CA/Clients de `ComparisonTable`, retirer étape Clients du `FunnelChart`.
- `src/components/stats/StatsForm.tsx` — mettre à jour le `ComputedField` "Taux d'engagement" pour matcher la nouvelle formule + ajouter "Taux d'engagement par abonnés".
- `src/components/stats/RevenueChart.tsx` — supprimé (plus utilisé côté Instagram).

Pas de migration DB. Le schéma `monthly_stats` reste identique : on cache juste l'usage CA dans la vue stats Instagram.

## Questions avant que je code

1. Tu valides la nouvelle formule du taux d'engagement (`accounts_engaged / reach` pondéré sur la période) ?
2. Pour les nouveaux graphiques : je pars sur A + B + C + D, ou tu veux ajuster ?
3. Le formulaire de saisie : je laisse les champs CA/clients (utiles à l'IA et à la page Lancement) ou je les retire aussi ?
