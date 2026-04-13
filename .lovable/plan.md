

## Plan : Pré-remplir l'onboarding d'Auriana (sans le refaire)

### Concept
Tu veux te connecter en Auriana, arriver sur l'onboarding, mais que tous les champs soient **déjà remplis** pour pouvoir cliquer rapidement sans tout retaper. 

L'onboarding stocke ses réponses dans `localStorage`. On va ajouter une logique dans `use-onboarding.ts` qui, quand l'utilisateur a un profil existant en base (prenom, activite remplis) mais `onboarding_completed = false`, **pré-charge les réponses depuis la base** au lieu de partir de zéro.

### Étapes

#### 1. Mettre les flags onboarding à `false` en base
- `profiles.onboarding_completed = false`, `onboarding_step = 0`
- `user_plan_config.onboarding_completed = false`, `welcome_seen = false`

#### 2. Compléter les champs manquants en base pour Auriana
Certains champs onboarding ne sont pas remplis dans le profil d'Auriana :
- `main_goal` → ex: `"sell"` (vendre)
- `main_blocker` → ex: `"invisible"` 
- `weekly_time` → ex: `"2h"`
- `website_url` → ex: `"www.auriana-mdb.fr"` (si elle en a un)
- `instagram_url` → l'URL Instagram si disponible

#### 3. Modifier `use-onboarding.ts` — ajouter le pré-remplissage depuis la DB
Dans le `useEffect` qui vérifie l'état de l'onboarding (ligne ~200), quand on détecte `onboarding_completed = false` ET que le profil a un `prenom` rempli :

- Fetch les champs du profil : `prenom, activite, type_activite, activity_detail, canaux, main_blocker, main_goal, weekly_time, website_url, instagram_url, linkedin_url, linkedin_summary`
- Mapper ces valeurs vers les clés `Answers` :
  - `main_goal` → `objectif`
  - `main_blocker` → `blocage`  
  - `weekly_time` → `temps`
  - `website_url` → `website`
  - `instagram_url` → `instagram`
  - `linkedin_url` → `linkedin`
  - `canaux` → `canaux`
  - `activity_detail` → `activity_detail`
- Pré-remplir `setAnswers` avec ces valeurs
- Ne PAS écraser ce qui est déjà dans localStorage (priorité localStorage > DB)

#### 4. Résultat pour la démo
1. Tu te connectes en Auriana
2. Tu arrives sur l'onboarding étape 0 (Welcome)
3. Tu cliques → étape 1 : prénom "Auriana" et activité déjà remplis
4. Tu cliques → étape 2 : type "immobilier" déjà sélectionné
5. Etc. — tout est pré-rempli, tu ne fais que cliquer "Suivant"
6. À la fin, le diagnostic tourne et tu retrouves le dashboard complet

### Fichiers modifiés
- `src/hooks/use-onboarding.ts` — ajout du pré-remplissage depuis DB
- Base de données — reset flags + compléter les champs manquants d'Auriana

