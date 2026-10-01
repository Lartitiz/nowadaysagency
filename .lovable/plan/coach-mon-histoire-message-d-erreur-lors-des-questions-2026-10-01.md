# Coach « Mon histoire » : message d'erreur lors des questions

## Ce que j'ai déjà constaté (lecture seule)
- Les journaux serveur du coach montrent des appels « Mon histoire » à 11:13:54, 11:14:09 et 11:16:43 UTC (2 à 4 messages), avec un appel à l'IA lancé à chaque fois.
- Aucun journal d'erreur côté serveur : ni « parse failed », ni « truncated », ni « branding-coaching error ». Le serveur semble donc avoir répondu normalement, ou s'être arrêté sans rien écrire.
- Le message d'erreur vient donc probablement de l'écran du coach : réponse jugée « incomplète » ou « inattendue », échec de la sauvegarde de la réponse, ou délai dépassé. Ce n'est pas encore prouvé.

## Étapes
1. **Reproduire en tant que toi** dans l'aperçu, section Mon histoire, onglet coaching. Relever le message exact affiché, la réponse brute du serveur (code + forme, sans lire ton contenu) et l'erreur dans la console.
2. **Identifier la cause** parmi :
   - réponse serveur 200 mais sans question (jugée « incomplète ») ;
   - erreur à la sauvegarde de la question/session après la réponse ;
   - refus du fournisseur IA (plafond Anthropic, paramètre refusé par le modèle Opus) non journalisé ;
   - version déployée du coach différente de main.
3. **Corriger chirurgicalement** uniquement la cause confirmée (un seul fichier si possible), sans toucher aux autres sections, au quota (checkQuota avant / logUsage après) ni aux autres fonctions.
4. **Ajouter un journal technique** (sans contenu) sur les chemins d'échec silencieux du coach, pour qu'un futur incident soit lisible.
5. **Vérifier** : refaire 2 questions de suite dans Mon histoire, puis une question dans Mon client·e idéal·e pour s'assurer qu'il n'y a pas de régression.

## Détails techniques
- Fichiers concernés : `src/components/branding/BrandingCoachingFlow.tsx` (askAI, persistResponse), `src/lib/branding-coaching-response.ts`, `supabase/functions/branding-coaching/index.ts` (appel `callAnthropicWithMeta`, temperature 0.7, outil forcé `poser_question`).
- Si un correctif serveur est nécessaire : redéployer uniquement `branding-coaching`. Pas de migration, secret, quota ni paiement.
