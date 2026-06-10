## Diagnostic

L'erreur "Failed to send a request to Edge Function" arrive systématiquement sur le scénario **LinkedIn + photos** après les questions. C'est un `FunctionsFetchError` côté SDK Supabase = la connexion HTTP s'est coupée avant que la fonction renvoie une réponse. En auditant `creative-flow`, le hook `useStreamingInvoke` et `invokeWithTimeout`, j'identifie **4 causes cumulées**.

### 1. La génération photo LinkedIn ne stream PAS (cause principale)
Dans `supabase/functions/creative-flow/index.ts` ligne 858, le SSE est explicitement désactivé dès que `body.photo_mode === true`. Sans streaming :
- Pas de keep-alive sur la connexion → l'infra (gateway Lovable Cloud + Deno edge) peut couper après ~60-150 s d'inactivité.
- Le client attend un seul gros JSON final → si le backend met 100 s+, le fetch tombe en `FunctionsFetchError` avant la fin.

### 2. LinkedIn photo = DEUX appels Anthropic en série
Toujours dans `creative-flow` :
- Appel #1 (ligne 1336) : vision multi-photos, `max_tokens=4096`, modèle Sonnet/Opus → 30 à 90 s avec 3-10 photos.
- Appel #2 (ligne 1373) : `applyCorrectionPass` LinkedIn obligatoire dès que le post fait ≥200 chars → +15 à 40 s.

Total wall-time régulier = **60-140 s**, parfois plus. Sans streaming pour tenir la socket, c'est exactement la fenêtre où la connexion casse.

### 3. La phase "follow-up" renvoie toutes les photos
Dans `src/hooks/use-content-generator.ts` ligne 642, l'appel `creative-flow step="follow-up"` en mode photo retransmet la totalité des base64 (jusqu'à 10 × ~250 KB) ET refait un appel vision. Résultat :
- Payload répété (latence réseau mobile).
- Deuxième vision facturée → ralentit toute la chaîne avant le "generate" final.

### 4. Timeout client incohérent
- `useStreamingInvoke` : 180 s (OK).
- `invokeWithTimeout` follow-up photo : 120 s (limite).
- Le timeout serveur Lovable Cloud est plus court que 180 s sur certains scénarios → le client n'a pas le temps de voir un AbortError "propre", il reçoit le `FunctionsFetchError` brut, mal mappé en UX ("Failed to send a request…").

---

## Plan de correction

### Étape 1 — Activer le streaming SSE pour photo_mode LinkedIn (fix principal)
Fichier : `supabase/functions/creative-flow/index.ts`

- Retirer la condition `!body.photo_mode` ligne 858 **uniquement pour LinkedIn photo** (les autres formats photo restent en JSON pour l'instant pour ne pas casser le parsing carousel).
- Lorsque streaming activé en photo LinkedIn :
  - Envoyer la requête vision Anthropic en mode `stream: true`.
  - Pipe les deltas vers le client via `createClientSSEStream`.
  - Émettre périodiquement (toutes les 10 s) un event SSE `heartbeat` pendant le pré-traitement vision pour tenir la socket.

### Étape 2 — Rendre la passe de correction LinkedIn non-bloquante en photo_mode
Même fichier, lignes 1362-1382.

- En photo_mode : appliquer la correction directement **dans le prompt** plutôt qu'en 2ᵉ passe (les règles anti-broetry sont déjà dans le bloc "RÈGLES CRITIQUES" ligne 1272). Supprime l'appel #2 → -15 à 40 s.
- En texte pur : on garde la 2ᵉ passe comme aujourd'hui.

### Étape 3 — Cesser de renvoyer les photos au step "follow-up"
Fichier : `src/hooks/use-content-generator.ts` ligne 620-678.

- Pour le follow-up, n'envoyer **que** le `photo_description` + les réponses déjà fournies (pas les base64). Le serveur (`creative-flow` step="follow-up") doit accepter ce mode "texte seul même si photo_mode=true" et générer les questions de relance à partir du texte.
- Côté serveur : ligne 1217, ajouter une garde "si photos vides en follow-up → bascule sur prompt texte".

### Étape 4 — UX d'erreur réseau plus claire
Fichier : `src/lib/invoke-with-timeout.ts` + `src/hooks/use-streaming-invoke.ts`.

- Détecter `FunctionsFetchError` pendant un appel photo et afficher un message explicite : "Génération longue — vérifie ta connexion et réessaie avec moins de photos." plutôt que le générique actuel.
- Aligner les timeouts : `useStreamingInvoke` à 150 s (cohérent avec la limite edge), `invokeWithTimeout` photo à 90 s puisque les photos ne servent plus au follow-up.

### Étape 5 — Garde-fou côté UI
Fichier : `src/components/creer/PhotoUploadZone.tsx` (déjà max 10).

- Pour LinkedIn photo, capper à **5 photos** (au lieu de 10) avec message : "LinkedIn photo : 5 max pour rester rapide." Réduit drastiquement la fenêtre de timeout.

---

## Détails techniques

- Pas de changement de schéma DB ni d'edge function supplémentaire.
- Pas de mode polling/jobs asynchrones (overkill pour gagner 30 s ; le streaming SSE suffit).
- La sécurité reste inchangée : pipeline auth + quota déjà appliqué en haut de `creative-flow`.
- Aucun impact sur les autres flux (Instagram carousel photo, newsletter, etc.) parce que les changements sont gardés derrière `contentType?.includes("linkedin") && photo_mode`.

## Critères de validation

1. Générer un post LinkedIn avec 3 photos → la réponse arrive en streaming, plus de `FunctionsFetchError`.
2. Générer avec 5 photos → reste sous 90 s perçues côté client.
3. Le follow-up post-questions ne déclenche plus de second appel vision (vérifiable dans les logs `creative-flow`).
4. Si la connexion casse vraiment, le toast affiche le message explicite, pas "Failed to send a request to Edge Function".
