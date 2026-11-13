# Relais de rendu des reels (HyperFrames sur Google Cloud)

Fabrique en MP4 les reels « sans voix » (texte à l'écran) montés par l'app.
Décidé le 13/11/2026 : meilleur montage que JSON2Video (fondus, mots un par un,
sons de design), sans filigrane et sans abonnement.

## Chemin d'un reel

1. Écran de montage → edge `reel-render` (action `submit`, `voice_mode: "silent"`).
2. `reel-render/hyperframes.ts` fabrique la page HTML du montage (fonction pure, testée).
3. `reel-render/hyperframes-gateway.ts` l'envoie à ce relais avec le jeton de session de la cliente.
4. Le relais vérifie le jeton auprès de Supabase, limite à 12 rendus/heure et 40/jour par cliente,
   ajoute les sons (`assets/`), puis lance le rendu distribué (`@hyperframes/gcp-cloud-run`).
5. L'écran interroge `status` toutes les 6 s ; à la fin, le relais rend un lien signé (2 h) et
   l'edge recopie le MP4 dans `calendar-media` (action `archive`).

Si le relais ne répond pas au lancement, l'edge repasse par JSON2Video (aucune cliente bloquée).
Interrupteur : `HYPERFRAMES_ENABLED` dans `hyperframes-gateway.ts`.

## Google Cloud (projet `nowadays-reels-1113`, région `europe-west1`)

- Moteur : service `hyperframes-render` (4 vCPU, 8 Gi, 4 machines max) + workflow `hyperframes-render`
  + bucket `hyperframes-render-nowadays-reels-1113`, installés par `hyperframes cloudrun deploy`
  (image construite par Cloud Build depuis le dépôt officiel HyperFrames v0.9.42).
- Relais : service `reel-render-gateway`, compte `reel-gateway@…` (droits : `workflows.invoker`,
  `storage.objectAdmin` sur le bucket, `serviceAccountTokenCreator` sur lui-même pour signer les liens).
- Budget « Plafond reels 5 EUR » : alertes e-mail à 20 / 60 / 100 % (n'arrête rien).
- Coût mesuré : ~0,07 $ par reel de 50 s au plein tarif ; le volume gratuit mensuel de Cloud Run
  couvre environ 75 reels.

## Redéployer le relais

```bash
gcloud run deploy reel-render-gateway --source services/reel-render-gateway \
  --project nowadays-reels-1113 --region europe-west1 \
  --service-account reel-gateway@nowadays-reels-1113.iam.gserviceaccount.com \
  --max-instances 2 --memory 1Gi --cpu 1 --timeout 120 \
  --set-env-vars SUPABASE_ANON_KEY=<clé publique anon de l'app>
```

Sons : Pixabay (licence libre, voir `assets/sfx/CREDITS.md`) ; `assets/pad.mp3` est une nappe
synthétisée pour l'app.
