

## Plan : Assouplir le filtre pour les actus globales — connecter le buzz au secteur

### Le problème
Le filtre de pertinence actuel (lignes 129-136) s'applique uniformément à toutes les actus. Il exige que l'audience du secteur "s'en soucie directement", ce qui élimine les actus chaudes grand public qui sont justement les meilleures pour du newsjacking : prendre un sujet dont tout le monde parle et le relier à son expertise.

### La solution
Séparer les critères de pertinence selon le type d'actu :

- **Actus GLOBALES** : le critère n'est plus "est-ce que l'audience s'en soucie" mais **"est-ce qu'on peut créer un PONT vers le secteur"**. Une actu sur une polémique politique peut devenir un parallèle puissant avec l'immobilier si l'angle est bien trouvé.
- **Actus NICHE** : garder le filtre strict actuel (doit parler du secteur directement).

### Fichier modifié
`supabase/functions/newsjacking-ai/index.ts` — un seul fichier

### Changements concrets

**Remplacer le bloc FILTRE DE PERTINENCE unique par deux filtres distincts :**

```
FILTRE DE PERTINENCE — ACTUS GLOBALES :
Pour les actus globales, le critère est : "peut-on créer un PONT entre cette actu et le secteur de ${nicheLabel} ?"
✅ GARDER si : on peut faire un parallèle, une métaphore, un "ça m'a fait penser à mon métier", un constat transposable
✅ GARDER si : l'actu touche un sujet universel (argent, confiance, peur, liberté, travail) que l'audience peut s'approprier
❌ REJETER si : même avec un angle créatif, impossible de relier à l'expertise ou au vécu professionnel

FILTRE DE PERTINENCE — ACTUS NICHE :
Pour les actus niche, le critère est strict :
1. L'actu parle directement du secteur, du marché ou des clients de "${nicheLabel}"
2. L'expertise de cette personne apporte un éclairage unique
⚠️ "réseaux sociaux" ou "marketing digital" N'EST PAS une actu niche sauf si c'est le métier.
```

**Ajouter une instruction explicite pour les angles des actus globales :**
```
Pour les actus GLOBALES, l'angle doit TOUJOURS construire un pont :
- Le hook part de l'actu (ce que tout le monde a vu)
- Le pivot ramène à l'expertise métier (ce que seul·e cette personne peut dire)
- Le véhicule idéal est souvent "parallele_absurde" ou "declencheur_externe"
```

### Ce qui ne change pas
- La répartition 2 globales + 2 niches
- Les variantes de recherche randomisées
- Les 5 véhicules d'angle
- Le format JSON de sortie
- Auth, quota, rate limit

### Résultat attendu
Les actus globales seront de vraies actus chaudes (buzz, polémiques, tendances virales) avec des angles qui créent un pont vers le secteur, au lieu d'être filtrées parce qu'elles ne parlent pas directement du métier.

