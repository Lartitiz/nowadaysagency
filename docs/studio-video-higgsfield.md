# Studio vidéo — contrat Higgsfield vérifié le 28 septembre 2026

## Route retenue et paramètres

La V1 utilise uniquement `bytedance/seedance-2.5/image-to-video`, par `POST https://api.higgsfield.ai/bytedance/seedance-2.5/image-to-video`. `image_url` est obligatoire. `prompt` est facultatif côté fournisseur mais obligatoire dans le Studio pour produire un plan compréhensible. `duration` accepte 4–30 secondes chez Higgsfield ; la V1 borne les clips à 4–10 secondes pour limiter le coût et la taille du fichier. `resolution` accepte `480p` ou `720p`. La V1 fixe `output_format=mp4` et `generate_audio=false` afin de conserver la piste voix du Reel au montage. L'image de fin optionnelle n'est pas exposée. La route image-to-video ne documente **pas** `aspect_ratio` ni `bitrate_mode` dans son tableau de paramètres, même si un exemple de page montre ce dernier : le Studio ne les envoie pas. Les contrôles « Elements », identité persistante et réglages du site ne sont pas promis par cette route.

Source : [référence du modèle](https://open.higgsfield.ai/models/bytedance/seedance-2.5/image-to-video/api-reference).

## Authentification, médias et devis

La clé API est `KEY_ID:KEY_SECRET`, uniquement côté serveur dans `HIGGSFIELD_API_KEY`. Les appels portent `Authorization: Key KEY_ID:KEY_SECRET`. Les images du Studio et de la photothèque sont privées : le serveur télécharge l'image autorisée depuis Storage, demande une URL d'envoi à Higgsfield (`POST /files/generate-upload-url`), puis envoie les octets au lien signé sans y transmettre la clé API. Cette opération est annoncée avant le clic « Vérifier le prix ». Le serveur appelle ensuite `POST /estimate/bytedance/seedance-2.5/image-to-video` avec exactement les paramètres prévus pour la génération. Le devis authentifié (`credits`, `usd`) fait foi ; la génération garde un plafond mensuel serveur et réserve le devis avant le POST payant.

Sources : [authentification](https://docs.higgsfield.ai/docs/authentication), [envoi de fichiers](https://docs.higgsfield.ai/docs/concepts/file-uploads), [devis et facturation](https://docs.higgsfield.ai/docs/concepts/billing-and-retention).

Le catalogue public indique à titre de repère **0,144 $/s en 480p** et **jusqu'à 0,3236 $/s en 720p** au tarif affiché. Un clip de cinq secondes représente donc environ **0,72 $** en 480p ou **1,62 $** en 720p ; quatre clips de cinq secondes au plus **2,88 $** ou **6,47 $** respectivement, hors stockage/transfert et éventuelle variation du devis du compte. Il faut lire le devis du compte avant de confirmer un plafond d'essai. Aucun achat ou essai payant n'est inclus dans cette intégration.

Source : [page Seedance 2.5 et tarif](https://open.higgsfield.ai/models/bytedance/seedance-2.5/image-to-video).

## Suivi, conservation et erreurs

Le POST renvoie `request_id` et `status_url`. La requête passe par `queued`, `in_progress`, puis `completed`, `failed`, `nsfw` ou `canceled`. Le serveur conserve l'identifiant immédiatement et interroge `GET /requests/{id}/status`. Il fournit aussi un `hf_webhook` à jeton aléatoire par tâche : le callback est rapproché par un GET fournisseur authentifié, car la documentation ne décrit pas de signature du webhook. Cela permet d'archiver le résultat même si l'utilisatrice ferme l'onglet. `completed.video.url` est recopié dans le bucket privé `studio-video` et servi par une URL signée renouvelable. Higgsfield garantit ses fichiers au moins sept jours, pas une conservation permanente. Le clip du Studio est indépendant d'un Reel. Une génération peut être reprise après fermeture par la liste des tâches ; le suivi n'envoie jamais un second POST. Si la réponse du POST ou son enregistrement est perdue, la tâche reste `submitting_uncertain` et son devis réservé jusqu'au callback ou à un rapprochement manuel avec l'historique Higgsfield.

Sources : [cycle des requêtes](https://docs.higgsfield.ai/docs/concepts/requests), [statut](https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status), [polling](https://docs.higgsfield.ai/docs/concepts/polling), [webhooks](https://docs.higgsfield.ai/docs/how-to/webhooks), [rétention](https://docs.higgsfield.ai/docs/concepts/billing-and-retention).

Les erreurs 401/403/404/422 demandent une correction de configuration, de solde, d'accès ou de paramètres. 400 peut aussi indiquer la limite de concurrence ; 423/503 un modèle temporairement indisponible. `failed` et `nsfw` ne sont pas facturés selon la documentation, et une annulation réussie en file d'attente est remboursée. Les échecs 5xx ou réseau du **GET** peuvent être retentés ; un POST dont la réponse est incertaine ne doit jamais l'être automatiquement, car Higgsfield ne propose pas de clé d'idempotence. `X-Correlation-ID` et `request_id` sont conservés pour le support. Le fournisseur peut restreindre la concurrence selon le compte.

Sources : [erreurs et reprises](https://docs.higgsfield.ai/docs/concepts/errors), [limites de débit](https://docs.higgsfield.ai/docs/concepts/rate-limits).

## Vrais visages et données privées

Les [conditions API Higgsfield](https://open.higgsfield.ai/terms-of-service) exigent un consentement documenté de toute personne identifiable pour l'envoi de son visage/sa voix et l'usage du résultat. Certaines fonctions de visage ou d'identité exigent une vérification du compte et des attestations. La fiche de la route Seedance image-to-video ne confirme pas l'accès de ce compte aux vrais portraits. La V1 bloque les photos marquées `portrait` ou `produit_porte` et demande d'attester l'absence de personne identifiable avant transmission. Elle ne prétend donc pas valider le cas « vraie personne » sans contrôle de l'accès et de la procédure de consentement.

Les conditions indiquent aussi que l'API peut utiliser entrées et sorties pour l'entraînement tant que l'option n'est pas désactivée dans le tableau de bord ; la prise d'effet peut demander dix jours ouvrés. ByteDance est un modèle tiers : vérifier la destination et les règles de traitement avant tout média privé de cliente. Les URL de résultat fournisseur sont privées par défaut, mais les URL de référence envoyées par l'API de chargement sont utilisables par Higgsfield. La configuration « zéro rétention » dépend d'un accord entreprise. Aucun transfert de photo privée n'a été fait pendant cette mise en code.

## Configuration et activation

1. Provisionner nativement le bucket Storage **privé** `studio-video` avec limite 150 Mo et sans policy cliente.
2. Déployer la migration additive `20260928190000_studio_video_jobs.sql`, puis la fonction Edge `studio-video`. `verify_jwt=false` est nécessaire pour le webhook public ; toutes les actions utilisateur continuent de passer par `runPipeline`, et le callback vérifie son jeton par tâche ainsi que le résultat chez Higgsfield.
3. Placer les secrets serveur `HIGGSFIELD_API_KEY`, `HIGGSFIELD_VIDEO_ENABLED=true` et `HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD=<plafond>` ; sans ces trois valeurs, devis et génération restent désactivés. Le plafond est appliqué à la fois par espace et globalement ; une seule génération peut être active à la fois en V1.
4. Vérifier en lecture seule l'accès au modèle, le solde, le devis réel et les réglages de traitement. Obtenir un plafond d'essai et une référence explicitement autorisée avant la première génération payante.
5. Après un premier clip autorisé, contrôler les octets MP4 archivés, la lecture signée, la reprise, le coût réellement débité et le raccord au Reel avec voix/sous-titres.

La création d'un clip à partir d'une image importée passe par la photothèque existante : la V1 n'ajoute pas un second téléverseur. Les vidéos personnelles et Pexels restent des sources du montage Reel.
