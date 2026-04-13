

## Plan : Diversifier les actus du newsjacking (variété + actus insolites/drôles)

### Problème identifié
Le prompt de recherche web est statique : il demande toujours "actualité France mars 2026" ou "tendance société 2026", ce qui pousse Claude à chercher les mêmes mots-clés et retourner les mêmes résultats. De plus, il n'y a aucune instruction pour chercher des actus insolites, drôles ou décalées — uniquement du "sérieux".

### Fichier modifié
`supabase/functions/newsjacking-ai/index.ts` — un seul fichier

### Changements

**1. Ajouter de la randomisation dans les termes de recherche**
Avant la construction du `systemPrompt`, créer un tableau de variantes de recherche et en tirer une au hasard. Cela force des requêtes web différentes à chaque appel :

```typescript
const searchVariants = [
  { global: "actualité insolite France cette semaine", niche: "nouveauté surprenante" },
  { global: "buzz viral réseaux sociaux France 2026", niche: "polémique débat" },
  { global: "fait divers drôle insolite France", niche: "tendance inattendue" },
  { global: "actualité décalée société France", niche: "innovation surprenante" },
  { global: "phénomène viral TikTok Instagram cette semaine", niche: "actu contre-intuitive" },
  { global: "tendance culturelle pop culture France 2026", niche: "étude chiffre marquant" },
];
const variant = searchVariants[Math.floor(Math.random() * searchVariants.length)];
```

**2. Enrichir la RECHERCHE 1 avec des catégories d'actus variées**
Remplacer les exemples de recherche statiques par les variantes dynamiques, et ajouter explicitement la catégorie "insolite / drôle / décalé" comme type d'actu valide :

Dans le bloc RECHERCHE 1, remplacer :
```
Cherche "actualité France mars 2026" ou "tendance société 2026" ou "fait marquant cette semaine France".
```
Par :
```
Cherche "${variant.global}" ET varie tes requêtes.
```

Et ajouter après les exemples d'actus globales :
```
IMPORTANT — VARIÉTÉ OBLIGATOIRE : ne retourne PAS uniquement des actus "sérieuses" (politique, économie).
Au moins 1 actu sur les 2 globales doit être dans une de ces catégories :
- INSOLITE / DRÔLE : un fait divers absurde, un record bizarre, une situation cocasse
- VIRAL / POP CULTURE : un meme, un challenge, une réaction en chaîne sur les réseaux
- DÉCALÉ : une étude surprenante, un chiffre contre-intuitif, un phénomène de société inattendu
Ces actus sont souvent les MEILLEURES pour du newsjacking car elles sont plus partageables et moins "corporate".
```

**3. Ajouter un véhicule d'angle "humour / décalage"**
Ajouter un 5ème véhicule dans la section ANGLES PROPOSÉS :
```
5. PARALLÈLE ABSURDE (parallele_absurde) : "Cette actu n'a rien à voir avec mon métier… et pourtant ça illustre exactement…"
```

**4. Enrichir le message utilisateur avec un signal de variété**
Modifier le message final envoyé à Claude pour ajouter un signal aléatoire qui force la diversité :
```typescript
const moods = ["drôles et insolites", "surprenantes et contre-intuitives", "virales et pop culture", "décalées et débattables"];
const mood = moods[Math.floor(Math.random() * moods.length)];
// Dans le message : "Trouve les actualités les plus pertinentes... Privilégie les actus ${mood} quand c'est possible."
```

### Ce qui ne change PAS
- Le format JSON de sortie (même structure `actus[]`)
- La répartition 2 globales + 2 niches
- Les 4 véhicules existants (on ajoute un 5ème)
- La logique de quota, auth, rate limit
- Le branding context
- Tous les autres fichiers

### Impact
- Chaque appel aura des termes de recherche différents grâce à la randomisation
- L'IA est explicitement invitée à chercher des actus drôles/insolites/virales
- Le nouveau véhicule "parallèle absurde" permet des angles plus créatifs sur les actus décalées

### Vérification
- TypeScript compile sans erreur
- `grep "VARIÉTÉ OBLIGATOIRE"` retourne 1 occurrence
- `grep "parallele_absurde"` retourne au moins 1 occurrence
- `grep "searchVariants"` retourne 1 occurrence
- Déploiement de la Edge Function `newsjacking-ai`

