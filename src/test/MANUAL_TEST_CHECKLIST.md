# ✅ Checklist de Test Manuel — Parcours Critiques

> **Dernière mise à jour :** 2026-02-26
>
> Cocher chaque item après vérification. Ajouter la date et les initiales du testeur.

---

## 1. Authentification

**Prérequis :** accès à une boîte mail de test (ex: mailtrap, yopmail ou adresse réelle).

- [ ] Inscription avec email + mot de passe → email de confirmation reçu
- [ ] Clic sur le lien de confirmation → compte activé
- [ ] Connexion avec email existant → redirection vers dashboard
- [ ] Connexion avec mauvais mot de passe → message d'erreur clair
- [ ] Déconnexion → retour à la page de login, session détruite
- [ ] Mot de passe oublié → email reçu → lien `/reset-password` fonctionnel
- [ ] Nouveau mot de passe enregistré → connexion OK avec le nouveau

---

## 2. Onboarding

**Prérequis :** créer un nouveau compte (ou supprimer le profil existant pour relancer l'onboarding).

- [ ] Nouveau compte → redirigé automatiquement vers l'onboarding
- [ ] Toutes les étapes se complètent sans erreur
- [ ] Les données saisies (activité, cible, offres) sont bien sauvegardées en BDD
- [ ] Retour arrière entre les étapes → données pré-remplies
- [ ] Fin de l'onboarding → redirection vers le dashboard

---

## 3. Branding

**Prérequis :** onboarding terminé, profil de marque initialisé.

- [ ] Accès à la page `/branding` sans erreur
- [ ] Compléter une section storytelling → progression mise à jour dans la sidebar
- [ ] Compléter une section persona → progression mise à jour
- [ ] Le score de complétion branding se met à jour en temps réel (sans reload)
- [ ] Les données persistent après rechargement de la page
- [ ] Le coaching IA (questions/réponses) fonctionne dans chaque section

---

## 4. Première génération IA

**Prérequis :** profil branding partiellement rempli, quota disponible.

- [ ] Générer un contenu Instagram (post) via l'atelier
- [ ] Le quota se décrémente correctement (vérifier l'affichage + BDD `ai_usage`)
- [ ] Le contenu généré (accroche, corps, CTA, hashtags) s'affiche correctement
- [ ] Bouton « Copier » fonctionne (texte dans le presse-papier)
- [ ] Régénérer le contenu → nouveau résultat différent

---

## 5. Audit Instagram

**Prérequis :** quota audit disponible, un nom d'utilisateur Instagram réel à tester.

- [ ] Lancer un audit depuis `/audit`
- [ ] Le loader s'affiche pendant le traitement
- [ ] Le score global s'affiche (0-100)
- [ ] Les sections détaillées (bio, contenu, visuel…) ont chacune un score
- [ ] Les recommandations sont pertinentes et affichent des liens d'action
- [ ] Le quota audit se décrémente

---

## 6. Upgrade / Abonnement

**Prérequis :** compte Stripe en mode test, cartes de test Stripe (`4242 4242 4242 4242`).

- [ ] Cliquer sur « Passer au plan Outil » → redirection vers Stripe Checkout
- [ ] Compléter le checkout Stripe (carte test) → retour sur l'app (`/success` ou équivalent)
- [ ] Le plan est mis à jour dans le profil utilisateur (vérifier `subscriptions` en BDD)
- [ ] Les quotas augmentent après upgrade (vérifier l'affichage des limites)
- [ ] Accès au portail client Stripe (gestion abonnement) → fonctionne
- [ ] Annulation d'abonnement via le portail → plan revient à `free`

---

## 7. Workspace (multi-clients)

**Prérequis :** compte coach avec plan studio ou now_pilot.

- [ ] Créer un nouveau workspace depuis le sélecteur
- [ ] Le workspace apparaît dans la liste
- [ ] Switcher entre workspaces → les données changent (branding, calendrier, contacts)
- [ ] Les données sont bien isolées par workspace (pas de fuite entre clients)
- [ ] Les quotas IA sont comptabilisés par workspace (pas par utilisateur global)
- [ ] Supprimer un workspace → confirmation demandée, données nettoyées

---

## 8. Edge Cases

**Prérequis :** compte free avec quota presque épuisé.

- [ ] Utilisateur free qui atteint sa limite → message d'erreur clair avec mention du plan supérieur
- [ ] Utilisateur free sur fonctionnalité réservée (suggestion, import) → message « disponible à partir du plan Outil »
- [ ] Perte de connexion pendant une génération → gestion d'erreur propre (toast, pas de crash)
- [ ] Double-clic rapide sur un bouton de génération → un seul appel API (vérifier `ai_usage`)
- [ ] Token expiré → redirection vers login (pas d'écran blanc)
- [ ] URL invalide → page 404 ou redirection propre
- [ ] Champs vides dans le branding → la génération IA gère gracieusement (pas de crash)

---

## Notes générales

| Environnement | Valeur |
|---|---|
| URL de test | `https://id-preview--a4b43f6d-b429-4097-99e1-6c1be647a50f.lovable.app` |
| Stripe mode | **Test** (clés `sk_test_...` / `pk_test_...`) |
| Carte test Stripe | `4242 4242 4242 4242` — exp: date future — CVC: n'importe quel chiffre |
| Carte refusée | `4000 0000 0000 0002` |

> **Fréquence recommandée :** exécuter cette checklist avant chaque mise en production et après tout changement sur l'authentification, le billing ou les edge functions.
