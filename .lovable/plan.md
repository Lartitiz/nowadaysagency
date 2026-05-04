# Resserrer la pertinence du newsjacking ("Surfer sur l'actu")

## Diagnostic

Trois mécaniques cumulent leurs effets et font partir les sujets trop loin :

### 1. Quota inversé sur la niche (newsjacking-ai)
Aujourd'hui, sur les 3 sujets "niche", la consigne impose **MAXIMUM 1 sujet du métier littéral**, donc **2 sur 3 viennent forcément de l'univers élargi** (émotion, moments de vie, lifestyle). Cumulé aux 3 sujets globaux (axes culturels), on se retrouve avec ~5 sujets sur 6 hors métier — l'élargissement initial conçu comme un garde-fou anti-monomanie est devenu un facteur de dérive.

### 2. `themes_lifestyle` est un crochet trop faible
Dans le `brand_universe`, les 4 listes ne sont pas équivalentes en force narrative :
- `valeurs_combat` et `moments_de_vie_cible` → ponts forts (la cible est nommément concernée)
- `univers_emotionnel` → pont moyen
- `themes_lifestyle` → pont faible (esthétique/ambiance, pas de levier commercial direct)

Tout est mis sur un pied d'égalité, donc l'IA pioche autant dans le faible que dans le fort.

### 3. Génération d'angles qui pousse au "parallèle absurde"
Dans `newsjacking-angles`, pour les actus globales, la consigne dit explicitement "Privilégie `parallele_absurde` ou `declencheur_externe`". Or `parallele_absurde` est par nature le véhicule le plus fragile. Pire : le "pont explicite" exigé à la recherche n'est pas re-vérifié à la génération d'angles, donc l'IA peut dériver.

### 4. Pas de signal de force de pont côté front
L'utilisatrice voit 6 sujets sur le même plan, sans indicateur de "pont fort vs pont fragile" pour zapper en un coup d'œil.

## Règles à mettre en place

### A. Inverser le quota d'élargissement (newsjacking-ai/index.ts)

**Avant** : "Sur 3 sujets niche, MAX 1 du métier littéral, les 2 autres en élargi."
**Après** : "Sur 3 sujets niche, **MINIMUM 2 doivent rester ancrés dans le métier ou son extension directe** (cible nommément concernée, valeur de combat partagée, moment de vie où la cible utilise réellement le produit/service). MAXIMUM 1 sujet peut venir de l'univers émotionnel/lifestyle pur."

Effet : on garde l'ouverture (1 sujet/6 reste "élargi") mais on rebascule la majorité dans la zone à pont fort.

### B. Hiérarchiser le brand_universe par force de pont (newsjacking-ai)

Dans le `universeBlock`, ajouter un classement explicite :
- **Niveau 1 (pont fort, à privilégier)** : `valeurs_combat`, `moments_de_vie_cible`
- **Niveau 2 (pont moyen)** : `univers_emotionnel`
- **Niveau 3 (pont faible, max 1 sujet sur l'ensemble)** : `themes_lifestyle`

Demander à l'IA de toujours préférer un sujet niveau 1 si elle a le choix.

### C. Ajouter un test de pertinence chiffré (newsjacking-ai)

Demander à l'IA d'auto-évaluer chaque sujet avec un nouveau champ `force_pont` ∈ {`fort`, `moyen`, `fragile`} basé sur des critères explicites :
- **fort** = le pont cite un élément littéral du profil (cible exacte, activité exacte, combat exact, pilier exact) et la connexion est immédiate, sans paraphrase
- **moyen** = le pont passe par l'univers élargi mais reste évident pour la cible
- **fragile** = le pont demande une étape de raisonnement pour comprendre la connexion → **rejeté**

Règle absolue : `fragile` → ne renvoie pas le sujet. Sur N sujets renvoyés, **au moins ⌈N×2/3⌉ doivent être `fort`**.

### D. Resserrer la génération d'angles (newsjacking-angles/index.ts)

- **Supprimer** "Privilégie parallele_absurde ou declencheur_externe" pour les globales. Remplacer par : "Privilégie `declencheur_externe`, `constat_decale` ou `recit_experience`. `parallele_absurde` est autorisé MAX 1 angle sur 3, et seulement si le parallèle est immédiatement lisible — pas un parallèle qu'il faut déballer."
- **Re-rappeler le pont** : reprendre le champ `pertinence` de l'actu en tête du prompt et exiger que CHAQUE angle s'appuie dessus, sans dériver vers une autre connexion plus lointaine.
- **Ajouter un check final** : pour chaque angle, l'IA doit pouvoir nommer l'élément du profil utilisé (cible / activité / combat / pilier / valeur). Sinon → reformuler.

### E. Signal visuel de force de pont (NewsjackingPanel.tsx)

Ajouter un petit badge sur chaque carte d'actu :
- `fort` → badge discret vert "pont direct"
- `moyen` → badge neutre "pont élargi"
- (les `fragile` ne devraient plus arriver, mais en sécurité afficher en gris)

L'utilisatrice peut filtrer/scanner en un coup d'œil.

### F. Compatibilité

- Les anciennes réponses en cache (sans `force_pont`) restent affichables — fallback à "moyen" + pas de badge.
- Les noms de champs existants (`axe`, `ton`, `pertinence`) sont conservés.

## Fichiers à modifier

- `supabase/functions/newsjacking-ai/index.ts` — règles A, B, C
- `supabase/functions/newsjacking-angles/index.ts` — règle D
- `src/components/creer/NewsjackingPanel.tsx` — règle E (UI)
- `mem://features/newsjacking` — mise à jour mémoire (quota inversé + force_pont + hiérarchie univers)

## Validation

Re-tester sur le profil utilisé (lingerie ou autre) :
- Attendu : 4-6 sujets dont 2/3 minimum à pont fort, et au plus 1 sujet purement lifestyle
- Aucun angle ne doit ressembler à "cette actu n'a rien à voir mais quand même…"
- Le badge "pont direct" doit apparaître sur la majorité des cartes

## Hors scope

- Pas de touche à la régénération du `brand_universe` (cache 30j conservé)
- Pas de touche aux 6 axes culturels globaux (la dérive vient de la branche niche, pas des axes)
