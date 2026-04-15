

## Plan : Nettoyer les bucket brigades pour ne garder que celles qui sonnent humain

### Le problème
Les bucket brigades actuelles (lignes 308-316 de `copywriting-prompts.ts`) contiennent un mélange de relances naturelles et de marqueurs IA devenus reconnaissables. L'IA les utilise mécaniquement parce qu'elles sont listées comme exemples. Les pires : "Et là.", "Sauf que.", "Et devinez quoi.", "Spoiler :", "Le vrai game changer ?", "Ce qu'on ne te dit pas, c'est que…".

### La solution
1. **Épurer les listes** : retirer toutes les relances devenues des tics IA
2. **Remplacer par une instruction de principe** : au lieu de donner une liste que l'IA copie mécaniquement, lui dire de créer ses propres transitions orales adaptées au sujet
3. **Ajouter les marqueurs bucket brigade au bloc PATTERNS BANNIS**

### Fichiers modifiés

**1. `supabase/functions/_shared/copywriting-prompts.ts`**

Réécrire la SECTION 4 (lignes 303-355) :

- **Supprimer les listes exhaustives de bucket brigades** (lignes 308-316)
- Les remplacer par :
  - Une poignée d'exemples (max 3-4) vraiment humains par catégorie
  - Une instruction claire : "Crée tes propres transitions à partir du sujet, pas à partir de cette liste"
- **Retirer spécifiquement** : "Et là.", "Sauf que.", "Et devinez quoi.", "Spoiler :", "Le vrai game changer ?", "Ce qu'on ne te dit pas c'est que…", "Mais attends, y'a mieux.", "Et là, déclic."
- **Garder** : les relances vraiment orales comme "Franchement.", "En vrai.", "Bon.", "Résultat ?", les apartés entre parenthèses
- Modifier l'instruction ligne 337 : passer de "intègre 2-3 bucket brigades" à "si une relance orale arrive naturellement, ok, mais n'en force jamais"

- **Ajouter dans PATTERNS BANNIS** (ligne 406+) :
  - "Sauf que." comme phrase isolée → BANNI
  - "Et là." comme phrase isolée → BANNI  
  - "Et devinez quoi." → BANNI
  - "Spoiler :" → BANNI
  - "Le vrai game changer ?" → BANNI

- **Ligne 370** (anti-slop) : remplacer "Sauf que" par "Le truc c'est que" comme alternative à "Cela étant dit"
- **Ligne 392** : remplacer "prose fluide, bucket brigades" par "prose fluide, rythme oral naturel"

**2. `supabase/functions/_shared/base-prompts.ts`**
- Ligne 20 : remplacer "Bucket brigades pour relancer la lecture" par "Relances orales naturelles quand ça sert le rythme (jamais mécaniques)"

**3. `supabase/functions/niche-ai/index.ts`**  
- Ligne 17 : retirer "sauf que" de la liste d'expressions orales

**4. `supabase/functions/carousel-ai/index.ts`**
- Ligne 1480 : retirer les exemples de bucket brigades ("Sauf que...", "Et là...") de l'instruction de connexion entre slides, les remplacer par une instruction de tension narrative sans liste copiable

**5. `supabase/functions/creative-flow/index.ts`**
- Retirer "sauf que" des listes d'expressions orales si présent

### Ce qui ne change pas
- Le correction-pass (il traque déjà les patterns IA)
- La structure des prompts
- Les CTA éthiques
- Le score-content

### Résultat attendu
L'IA ne piochera plus mécaniquement dans une liste de bucket brigades reconnaissables. Elle créera ses propres transitions orales adaptées au sujet, ce qui donnera des textes moins "templateisés".

