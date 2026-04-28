## Diagnostic

Le moteur `newsjacking-ai` cherche actuellement dans 6 axes très "actu chaude" (`politique_loi`, `economie_argent`, `societe_debat`...) avec des requêtes du type "actualité semaine France". C'est ce qui produit du contenu hors-sol : des trucs vrais, mais qu'aucun pont ne relie naturellement à toi.

Tu veux trois changements :

1. **Type de sujets** → micro-phénomènes culturels (mots qui reviennent, formats émergents, obsessions collectives) plutôt qu'actu brûlante. alors ça peut être une actu mais faut que ça puisse connecté au projet
2. **Connexion** → chaque sujet doit avoir un pont explicite vers ta cible ou ton expertise, sinon il dégage.
3. **Surprise** → 1 sujet sur 3 doit sortir de l'ordinaire (le reste reste confortable).

---

## Plan — 3 chantiers dans `newsjacking-ai/index.ts`

### Chantier 1 — Remplacer les axes "actu chaude" par des axes "micro-phénomènes"

Les 6 axes actuels deviennent 6 axes orientés culturel/comportemental. Le moteur en pioche toujours 3 au hasard pour la variété, mais sur un terrain beaucoup plus connecté à la com et à la culture.

Nouveaux axes proposés : je ne pense pas que ça doit venir des réseaux pck tout le monde ne travaille pas sur les réseaux dans les utilisateurs de l'otuil


| ID                      | Description                                                                                   | Exemple de requête                                            |
| ----------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `micro_tendance_reseau` | Format, son, mot, esthétique qui émerge sur Insta / TikTok / LinkedIn                         | "format viral réseaux sociaux émergent semaine"               |
| `mot_qui_revient`       | Expression / concept qui sature les conversations en ligne                                    | "expression mot tendance conversation 2026 France"            |
| `obsession_collective`  | Sujet sur lequel tout le monde a un avis sans qu'on sache pourquoi maintenant                 | "phénomène culturel obsession discussion France"              |
| `comportement_emergent` | Nouvelle façon de consommer, travailler, se présenter                                         | "nouveau comportement génération tendance France"             |
| `debat_recurrent`       | Vieux débat qui ressort sous un nouveau prétexte (productivité, authenticité, ego, pro/perso) | "débat authenticité productivité créateurs contenu"           |
| `objet_culturel_passe`  | Film, livre, série, album sorti récemment dont on parle au-delà du public cible               | "sortie culturelle film série livre dont tout le monde parle" |


Note : `politique_loi` et `economie_argent` disparaissent (trop actu pure). `viral_insolite` est gardé en esprit mais reformulé en `micro_tendance_reseau`.

### Chantier 2 — Pont explicite obligatoire (rejet en cas d'échec)

Aujourd'hui, le champ `pertinence` existe mais c'est un nice-to-have descriptif. On le promeut en **garde-fou** :

- Renommer `pertinence` en `pont_explicite` dans le schéma.
- Le prompt impose : pour chaque sujet, écrire en 1 phrase concrète **pourquoi cette personne en particulier (avec son activité / sa cible / son combat) a quelque chose à dire dessus**. Pas un lien forcé du genre "et ça nous rappelle que la communication...". Un vrai pont.
- Règle de rejet dans le prompt : si le pont sonne forcé ou générique, **ne renvoie pas l'actu**. Mieux vaut 3 sujets connectés que 6 hors-sol.
- Ajout d'une checklist anti-pont-forcé dans le prompt :
  - ❌ "ça nous rappelle l'importance de..."
  - ❌ "comme dans la com, il faut..."
  - ❌ "à l'image de ce phénomène, votre marque..."
  - ✅ "ta cible (X) vit exactement ce dilemme quand elle Y"
  - ✅ "tu as déjà parlé de Z, ce sujet permet de creuser sous un autre angle"

### Chantier 3 — Quota "1 sujet inattendu sur 3"

Aujourd'hui le moteur impose un mix de tons (`serieux_marquant`, `drole_decale`, `surprenant_contre_intuitif`). On reformule pour matcher le besoin :

- Renommer le champ `ton` en `registre`, avec 3 valeurs :
  - `confortable` — sujet que ta cible reconnaîtrait immédiatement comme "de ton univers"
  - `decalant` — sujet auquel personne dans ton secteur ne penserait
  - `entre_deux` — connu mais pris sous un angle inattendu
- Règle dans le prompt : sur N sujets renvoyés (3 à 6), **exactement ⌈N/3⌉ doivent être `decalant**`, le reste se répartit entre `confortable` et `entre_deux`.
- Le `decalant` ne dispense PAS du pont explicite — il reste connecté, juste par un chemin moins évident.

### Détails techniques

Fichier touché : `supabase/functions/newsjacking-ai/index.ts` uniquement.

Changements précis :

- Lignes 99-107 : remplacer le tableau `AXES` par les 6 nouveaux axes.
- Lignes 113-177 (le `systemPrompt`) : réécrire la section "RÈGLES DE QUALITÉ" pour intégrer le pont obligatoire + le quota 1/3 décalant + l'anti-pont-forcé.
- Lignes 156-167 (schéma JSON) : renommer `pertinence` → `pont_explicite`, `ton` → `registre`, mettre à jour les valeurs enum.
- Conserver le découpage globale/niche existant (3+3) — il fonctionne.

Pas de changement DB (les actus ne sont pas persistées telles quelles, juste retournées au front).

### Compatibilité front

À vérifier avant de pusher : `src/components/creer/NewsjackingPanel.tsx` et `src/pages/CreerUnifie.tsx` consomment probablement les champs `ton` et `pertinence`. Pendant l'implémentation, il faudra :

- soit mettre à jour les noms de champs côté front,
- soit garder des alias dans la réponse de l'edge function (`ton` = `registre`, `pertinence` = `pont_explicite`).

L'option alias est moins risquée pour ne rien casser. À décider au moment de l'implémentation après lecture du front.

### Validation

Après déploiement, tester avec 2-3 profils différents (un en charte business, un en charte créatif) :

- Vérifier qu'aucun sujet ne tombe dans la politique pure / l'éco pure.
- Vérifier que le `pont_explicite` cite **un élément précis** du profil (cible, activité, combat) et pas une généralité.
- Vérifier qu'un tiers exactement des sujets est tagué `decalant`.

### Hors-scope

- Toucher à `newsjacking-angles` (la génération d'angles à partir d'une actu choisie) — c'est une étape postérieure, déjà refactorisée au tour précédent (règle de vérité).
- Ajouter une UI de filtrage par registre/axe — peut venir plus tard si tu veux trier visuellement.
- Persister les actus en DB pour historique — non demandé.

### Mise à jour mémoire

À la fin, mettre à jour `mem://features/newsjacking` pour refléter :

- Axes orientés micro-phénomènes (pas actu chaude).
- Pont explicite obligatoire.
- Ratio 1/3 décalant.