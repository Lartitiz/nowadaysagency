

## Refonte newsjacking — plus d'idées, moins de pré-mâché, axes mixables

### Ce que tu demandes

1. **Plus d'idées par actu** — aujourd'hui chaque actu arrive avec ses angles déjà rédigés (hook + description + véhicule + format), c'est lourd à scanner et long à générer. Tu veux pouvoir survoler vite et choisir.
2. **Tous les axes représentés** — au lieu de tirer 1 axe global au sort par appel, tu veux voir plusieurs univers d'actus en même temps (société, économie, culture, science, politique, viral).
3. **Les axes peuvent se croiser** — "découverte science drôle" doit exister. Pas de cases étanches : un axe = un angle thématique, et le ton (drôle, sérieux, marquant) est indépendant.

### Nouvelle logique de génération

**Avant** : 1 appel IA → 4 actus complètes avec 1-2 angles rédigés chacune → temps long, output dense.

**Après** : 1 appel IA → **6 actus brèves** (titre + résumé court + axe + pertinence en 1 phrase) **sans angles pré-rédigés**. Les angles sont générés **à la demande** quand tu cliques sur une actu qui t'inspire.

Bénéfices :
- Génération initiale **2-3× plus rapide** (moins de tokens à produire)
- Tu vois **plus d'idées d'un coup** (6 au lieu de 4)
- Tu n'attends pas l'IA pour des angles que tu n'utiliseras pas
- Quand une actu te plaît, tu cliques → 3 angles générés en quelques secondes

### Refonte des axes (sans cases étanches)

**6 axes thématiques** (= "de quoi ça parle") :
- `societe_debat` — débats de société, faits marquants
- `economie_argent` — économie, pouvoir d'achat, business
- `culture_pop` — sorties, films, séries, livres, musique
- `science_decouverte` — études, découvertes, innovations
- `politique_loi` — réformes, lois, décisions publiques
- `viral_insolite` — phénomènes web, faits divers cocasses

**3 tons indépendants** (= "comment c'est raconté") :
- `serieux_marquant` — actu de fond
- `drole_decale` — angle léger ou cocasse
- `surprenant_contre_intuitif` — chiffre ou révélation qui détonne

L'IA pioche **librement** dans les combinaisons axe×ton. Donc oui, on peut avoir "science_decouverte + drole_decale" (étude scientifique surprenante et drôle), "politique_loi + surprenant_contre_intuitif" (réforme avec un effet contre-intuitif), etc.

### Répartition cible des 6 actus retournées

- **3 actus globales** couvrant **3 axes thématiques différents** (jamais 2 actus du même axe)
- **3 actus niche** dérivées des 3 requêtes métier (combat, cible, secteur+date)
- Au moins **1 actu "ton drôle/décalé"** et au moins **1 actu "ton sérieux/marquant"** dans le lot
- Diversité des axes **forcée par le prompt** (l'IA doit annoncer l'axe et le ton de chaque actu)

### Nouvelle UX dans `NewsjackingPanel.tsx`

**État 1 — liste rapide** :
- Carte par actu : titre, résumé 2 phrases, **chip axe** (ex. "Science"), **chip ton** (ex. "Drôle"), source, pertinence en 1 ligne
- Bouton **"Voir les angles"** (l'angle n'est PAS encore généré)
- Bouton "Pas pour moi" (masque l'actu localement)

**État 2 — angles à la demande** :
- Au clic sur "Voir les angles" → appel d'une **2ème edge function** (`newsjacking-angles`) qui génère **3 angles** pour cette actu précise (hook + véhicule + format suggéré, en quelques secondes)
- Les angles s'affichent en dépliant la carte
- Bouton existant "Créer le contenu" reste sur chaque angle

### Architecture technique

**Modifs `supabase/functions/newsjacking-ai/index.ts`** :
- Sortie JSON simplifiée :
```json
{ "actus": [
  { "titre", "resume", "source", "type": "globale|niche",
    "axe": "societe_debat|economie_argent|...",
    "ton": "serieux_marquant|drole_decale|surprenant_contre_intuitif",
    "pertinence": "1 phrase" }
] }
```
- Plus d'`angles[]` dans cette réponse
- Prompt : 6 actus, diversité axes obligatoire, mix de tons obligatoire
- Construction des 3 requêtes niche (combat, cible, métier+date)
- Filtres anti-redondance "pas que IA/réseaux sociaux" conservés
- `max_tokens` réduit (4096 → 2048 suffit)

**Nouvelle fonction `supabase/functions/newsjacking-angles/index.ts`** :
- Input : `{ actu: { titre, resume, axe, ton, type } }` + workspace_id
- Output : `{ angles: [ { vehicule, hook, description, format_suggere } ] }` (3 angles)
- Réutilise `getUserContext` + `formatContextForAI` pour le branding
- Pas de web search (rapide, juste de la rédaction d'angles)
- Quota : `light_action` (moins coûteux que `deep_research`)
- Modèle : `getModelForAction("content")`

**Modifs `src/components/newsjacking/NewsjackingPanel.tsx`** :
- Carte d'actu compacte avec chips axe+ton
- Bouton "Voir les angles" → appel `newsjacking-angles` → rendu inline
- Loader local par carte pendant la génération d'angles
- Cache local : si on a déjà cliqué sur une actu, ne pas re-générer

### Hors scope

- Mémoire DB des actus déjà vues (Phase 2 du plan précédent, on garde pour plus tard)
- Toucher aux `vehicule` (les 5 véhicules restent identiques)
- Toucher au flow de création de contenu depuis un angle (inchangé)

### Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `supabase/functions/newsjacking-ai/index.ts` | Refonte sortie (6 actus brèves, axes+tons), retrait des angles, prompt simplifié |
| `supabase/functions/newsjacking-angles/index.ts` | **Création** : génère 3 angles à la demande pour une actu donnée |
| `src/components/newsjacking/NewsjackingPanel.tsx` | UX : chips axe+ton, bouton "Voir les angles", génération à la demande, cache local |
| `supabase/config.toml` | Ajouter la nouvelle fonction si besoin |

### Validation

- Lancer le panel : 6 actus arrivent en ~5-8s (vs ~15-25s avant), avec 3 axes thématiques différents minimum et au moins 1 ton "drôle/décalé"
- Cliquer sur "Voir les angles" d'une actu → 3 angles arrivent en ~3-5s
- Vérifier qu'on peut cliquer sur 2-3 actus différentes sans que ça bloque
- Vérifier qu'une actu "science drôle" peut apparaître (pas de cloisonnement)

### Risque

Faible-moyen. La nouvelle edge function est isolée (pas de DB, pas de migration). La refonte de `newsjacking-ai` est une simplification du JSON de sortie. Le panel est modifié mais l'intégration aval (création de contenu depuis un angle) reste identique.

