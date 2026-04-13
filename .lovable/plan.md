

## Plan : Ameliorer la qualite des scripts Reel

### Constat
Le depth mandate Reel (lignes 386-433 de `creative-flow/index.ts`) fait 47 lignes avec une seule structure generique. Le carrousel en a 55 avec 4 arcs narratifs, des regles slide par slide, et des interdits precis. `FORMAT_STRUCTURES` dans `copywriting-prompts.ts` (lignes 246-251) ne donne que 5 lignes pour le Reel face cam. L'IA n'a pas de reference de qualite.

### Changements prevus

**Prompt 1 — `supabase/functions/_shared/copywriting-prompts.ts` (lignes 246-251)**

Remplacer les 5 lignes actuelles par 3 structures detaillees :

- **REEL FACE CAM / TALKING HEAD** : confession, reaction, prise de position. Hook regard camera, corps en scene vecue, chute avec deplacement de perspective.
- **REEL VOIX OFF + B-ROLL** : process, coulisses, transformation. Narration off sur images, structure avant/pendant/apres.
- **REEL HOOK LOOP** : boucle narrative ou le debut = la fin. Hook = chute incomprehensible, corps = contexte qui eclaire, retour au debut avec un nouveau sens.

Chaque structure avec timing et role narratif de chaque section (~25 lignes total, comparable aux 3 structures carrousel).

---

**Prompt 2 — `supabase/functions/creative-flow/index.ts` (lignes 386-433)**

Enrichir le depth mandate Reel :

1. **Arc narratif souple** (remplace "developpe avec une SCENE CONCRETE") :
   - Avant d'ecrire, identifier le MOUVEMENT : situation → deplacement de perspective → nouvelle comprehension
   - "Au moins un deplacement de perspective dans le corps : nouvelle info, contre-pied, zoom sur un detail inattendu" (pas "retournement obligatoire")

2. **Regle overlay typee** (remplace "3-8 mots max") :
   - 3 roles possibles : **ancrage** (mot-cle qui reste a l'ecran), **contrepoint** (ce que le texte parle ne dit pas), **punchline** (chute visuelle)
   - Chaque overlay doit explicitement choisir un de ces 3 roles
   - Interdit : overlay qui resume le texte parle en condense

3. **Contrainte corps** :
   - "Chaque section du corps = 2-4 phrases COMPLETES de texte parle. Pas de one-liners enchaines."
   - "Le corps raconte UNE scene, pas 3 micro-conseils."

---

**Prompt 3 — `supabase/functions/creative-flow/index.ts` (apres les interdits, ligne ~433)**

Ajouter un exemple compact ❌/✅ (~20 lignes max pour controler le payload) :

```
❌ SCRIPT GENERIQUE :
Hook: "3 erreurs sur Instagram"
Corps: "Erreur 1 : pas de strategie. Erreur 2 : pas de regulierte. Erreur 3 : pas de CTA."
→ Listicle filme. Zero scene, zero tension.

✅ SCRIPT QUI RACONTE :
Hook: "Ma cliente avait 10K abonnes et zero client."
Corps: "Je lui ai demande : 'Tu postes pour qui ?'. Silence. 
Elle postait 5 fois par semaine. Des tips, des infographies, des reels tendance. 
Sauf que son audience ideale, elle scroll pas des tips. Elle cherche quelqu'un qui comprend SON probleme.
On a tout arrete. 2 posts par semaine. Chaque post = une situation que sa cliente vit."
CTA: "Resultat 3 mois plus tard : 4 appels decouverte par semaine."
→ Une scene, un deplacement, un resultat.
```

### Fichiers modifies
1. `supabase/functions/_shared/copywriting-prompts.ts` — FORMAT_STRUCTURES section Reel
2. `supabase/functions/creative-flow/index.ts` — depth mandate Reel (lignes 386-433)

### Impact tokens
- Ajout estime : ~80 lignes de prompt system
- Comparable a ce qui existe deja pour les carrousels
- L'exemple ❌/✅ est volontairement compact (20 lignes, pas 40)

### Ce qui ne change PAS
- Le format de sortie JSON (lignes 879-907) reste identique
- Les 13 angles editoriaux restent inchanges
- Le mecanisme de rotation/diversite n'est pas ajoute ici (a traiter separement si besoin apres test)

