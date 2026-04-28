## Objectif
Faire en sorte que la carte « Lancer un audit » du dashboard permette réellement de choisir entre **audit Instagram** et **audit site web**, au lieu d’envoyer automatiquement vers Instagram.

## Ce que je vais modifier
1. Remplacer le routage direct de la mini-carte d’audit sur la page d’accueil par une ouverture de sélection.
2. Ajouter une petite fenêtre de choix avec 2 options claires :
   - Instagram
   - Site web
3. Rediriger chaque option vers la bonne page existante :
   - `/instagram/audit`
   - `/site/audit`
4. Garder le reste du comportement du dashboard intact, sans toucher aux autres CTA qui sont volontairement spécifiques à Instagram ou LinkedIn.

## Détails d’implémentation
- Fichier principal concerné : `src/pages/AdaptiveHome.tsx`
- Approche :
  - introduire un état local pour ouvrir/fermer un `Dialog`
  - remplacer la route statique de la carte audit par une action spéciale du type `__choose_audit__`
  - faire passer cette action par `handleNavigate()`
  - utiliser les composants UI déjà présents dans le projet pour rester cohérent visuellement
- Le contenu de la sélection sera sobre et explicite, pour éviter toute ambiguïté entre la promesse du texte et l’action réelle.

## Ce que je ne vais pas changer
- Les pages d’audit elles-mêmes
- Les audits LinkedIn
- Les recommandations intelligentes du dashboard qui pointent déjà explicitement vers un audit précis
- La sidebar, qui a déjà des entrées séparées par espace

## Résultat attendu
Quand on clique sur « Lancer un audit » depuis la carte du dashboard, une sélection s’ouvre et l’utilisateur choisit le type d’audit avant d’être redirigé.

## Détail technique
Flux visé :

```text
Dashboard mini-card
  -> ouverture d’une modal
    -> clic sur Instagram -> /instagram/audit
    -> clic sur Site web -> /site/audit
```

Je vérifierai que :
- la carte n’envoie plus directement vers Instagram
- les deux options naviguent correctement
- aucun autre CTA du dashboard n’est impacté