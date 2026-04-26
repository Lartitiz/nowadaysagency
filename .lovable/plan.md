## Diagnostic

Le hook que tu as épinglé (« Patagonia te dit de pas acheter. Et pourtant, tu achètes. ») viole l'esprit de la règle anti-TU, et le brief enchaîne aussi en TU. Trois causes dans `supabase/functions/content-coaching/index.ts` :

1. **La règle anti-TU est trop permissive** : "TU autorisé sur 1 hook sur 3 max" → l'IA s'autorise systématiquement 1 hook en TU.
2. **Plusieurs structures de hook poussent au TU** dans `HOOK_STRUCTURES` :
   - "Interpellation directe : Pointer une erreur courante que l'audience fait"
   - "Polarisation douce : Opposer deux postures et demander laquelle résonne"
3. **La règle ne s'applique qu'aux hooks**, pas aux briefs ni aux subjects → effet de contagion.

## Plan d'action

### 1. Durcir la règle anti-TU (lignes 299-303)
Remplacer par une règle qui couvre **hook + subject + brief** :
- Voix dominante = JE (vécu/conviction de l'utilisatrice) ou impersonnelle ("on", "les solopreneuses", "quand on…").
- TU **interdit** dans les hooks par défaut. Autorisé uniquement si la structure du hook est explicitement interpellative (et alors max 1 sur 3).
- TU **interdit** dans le `brief` et le `subject` : on parle DE l'audience, pas À elle.
- Exemples ✅/❌ étendus.

### 2. Reformuler les structures de hook qui poussent au TU (lignes 219-230)
- "Interpellation directe" → reformulé en "Observation tranchée : nommer une erreur courante du secteur (à la 3e personne ou via JE)"
- "Polarisation douce" → "Opposer deux postures dans le métier (sans interpeller le lecteur)"
- Garder les autres structures qui sont déjà naturellement en JE.

### 3. Ajouter une contrainte explicite sur le brief
Dans la section "MÉTHODE" (ligne 286+) ou dans le schéma JSON (ligne 327), préciser : "Le `brief` est rédigé à la 3e personne ou en JE narratif, jamais en TU adressé au lecteur."

### Hors-scope
Les erreurs de build TypeScript dans `_shared/scraping.ts` (DecompressionStream, propriétés `file_url`/`file_name` sur type `never`) sont **préexistantes** et liées au strictness Deno, pas à notre changement. Je ne les corrige pas dans cette itération sauf si tu me le demandes explicitement.

## Résultat attendu
Les 3 idées générées seront en JE narratif ou impersonnel. Le hook Patagonia deviendrait par exemple : « Patagonia dit "n'achetez pas cette veste". Et pourtant, ils explosent les ventes. » (impersonnel) au lieu de « te dit » + « tu achètes ».