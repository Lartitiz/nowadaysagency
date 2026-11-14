# Écoute de la voix des reels (Whisper sur Google Cloud)

Donne le moment où chaque mot est dit, pour les sous-titres mot à mot des reels
« Je me filme » (son du clip) et « voix enregistrée » montés par HyperFrames.
Décidé le 14/11/2026 : Whisper hébergé chez nous (faster-whisper, modèle `small`,
français, traitement par lots), pas de service payant à l'usage.

- Service PRIVÉ `reel-transcribe` : seul le relais `reel-render-gateway` l'appelle
  (compte `reel-gateway@…`, droit `roles/run.invoker`). Rien n'est stocké ici ; le
  relais garde les résultats dans son bucket (`transcripts/`).
- `POST /transcribe` `{"items":[{"url","seek","duration"}]}` → `{"items":[{"words":[{"text","start","end"}]}]}`
  (temps en secondes depuis `seek`). Un lien illisible ou un clip sans son rend
  `words: []` pour ce morceau, sans faire échouer les autres.
- Vitesse mesurée sur Mac (4 fils) : 57 s de voix en ~7 s. Pièges : sans traitement
  par lots, ~50 s ; un modèle `.en` traduirait en anglais (on force `language="fr"`).

Tests sans modèle : `python3 -m unittest test_app` (avec faster-whisper installé).

## Déployer

```bash
gcloud run deploy reel-transcribe --source services/reel-transcribe \
  --project nowadays-reels-1113 --region europe-west1 \
  --no-allow-unauthenticated --cpu 4 --memory 4Gi --concurrency 1 \
  --max-instances 3 --timeout 180 --cpu-boost
gcloud run services add-iam-policy-binding reel-transcribe \
  --project nowadays-reels-1113 --region europe-west1 \
  --member serviceAccount:reel-gateway@nowadays-reels-1113.iam.gserviceaccount.com \
  --role roles/run.invoker
```
