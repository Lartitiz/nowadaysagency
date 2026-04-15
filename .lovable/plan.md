

## Plan : Dégraisser les prompts de génération — éliminer les redondances

### Le problème
Le fichier `copywriting-prompts.ts` (1 424 lignes) contient des redondances massives. Les mêmes règles sont répétées 3 à 8 fois dans différentes sections. Un prompt de génération Instagram injecte probablement 8 000+ tokens de règles, dont ~40% sont des doublons. Ça coûte cher en API, dilue les instructions importantes et peut même confondre le modèle.

### Exemples de doublons identifiés

```text
Règle                              Présente dans
─────────────────────────────────── ────────────────────────────
"JAMAIS de tiret cadratin"          BASE_SYSTEM_RULES, CORE_PRINCIPLES,
                                    ANTI_SLOP, LINKEDIN_COMPACT,
                                    LINKEDIN_PRINCIPLES (8+ fois)

"Écriture inclusive point médian"   BASE_SYSTEM_RULES, CORE_PRINCIPLES,
                                    LINKEDIN_COMPACT, LINKEDIN_PRINCIPLES (6+)

"Pas de jargon marketing"          BASE_SYSTEM_RULES, CORE_PRINCIPLES,
                                    LINKEDIN_COMPACT, LINKEDIN_PRINCIPLES (4+)

Patterns anti-IA (broetry, etc.)   ANTI_SLOP, LINKEDIN_COMPACT,
                                    ANTI_BROETRY_LINKEDIN (3 sections)

Guardrails éthiques                CORE_PRINCIPLES + ETHICAL_GUARDRAILS
                                    (quasi copie)

Exemples avant/après               CORE_PRINCIPLES + LINKEDIN_COMPACT
                                    (réécrits)
```

### La stratégie : couche unique + extensions canal

```text
BASE_SYSTEM_RULES (existe déjà, 33 lignes)
  → Source unique pour : tiret, inclusif, ton, jargon, vulgarité
  → Injecté PARTOUT → zéro doublon

CORE_PRINCIPLES
  → Garder : principes éthiques, algorithme, longueurs, priorité voix
  → Retirer : tout ce qui est déjà dans BASE_SYSTEM_RULES
  → Retirer : exemples avant/après (déplacer dans une section "exemples" dédiée)

ANTI_SLOP
  → Garder : la liste de mots/patterns bannis
  → Retirer : les règles structurelles déjà dans CORE_PRINCIPLES

ETHICAL_GUARDRAILS
  → SUPPRIMER : doublon quasi intégral de CORE_PRINCIPLES section "JAMAIS"

ANTI_BIAS
  → Garder tel quel (peu de redondance)

ANTI_BROETRY_LINKEDIN
  → SUPPRIMER : doublon de ANTI_SLOP section "patterns voix IA"

LINKEDIN_PRINCIPLES_COMPACT
  → Retirer : les exemples avant/après (utiliser les mêmes que CORE)
  → Retirer : les patterns anti-IA (déjà dans ANTI_SLOP)
  → Garder : ce qui est spécifique LinkedIn (algo, formatage mobile, etc.)

LINKEDIN_PRINCIPLES
  → Retirer : tout ce qui est dans LINKEDIN_COMPACT (doublon interne)
  → Ou les fusionner en une seule export
```

### Changements concrets

**Fichier : `supabase/functions/_shared/copywriting-prompts.ts`**

1. **Dé-dupliquer `CORE_PRINCIPLES`** : retirer les 20+ lignes qui répètent `BASE_SYSTEM_RULES` (tirets, inclusif, jargon, ton oral)
2. **Supprimer `ETHICAL_GUARDRAILS`** : son contenu est déjà dans la section "JAMAIS" de `CORE_PRINCIPLES`
3. **Supprimer `ANTI_BROETRY_LINKEDIN`** : son contenu est déjà dans `ANTI_SLOP` section patterns voix IA
4. **Fusionner `LINKEDIN_PRINCIPLES` et `LINKEDIN_PRINCIPLES_COMPACT`** en une seule export `LINKEDIN_RULES` — garder uniquement ce qui est spécifique à LinkedIn
5. **Nettoyer `ANTI_SLOP`** : retirer les doublons avec `CORE_PRINCIPLES`
6. **Vérifier tous les fichiers qui importent** ces exports pour mettre à jour les imports (creative-flow, storytelling-ai, content-coaching, generate-content, etc.)

**Fichier : `supabase/functions/_shared/base-prompts.ts`**
- Pas de changement, c'est la bonne base

### Estimation de la réduction
- Avant : ~1 424 lignes / ~8 000-10 000 tokens par prompt
- Après : ~800-900 lignes / ~5 000-6 000 tokens par prompt
- Gain : ~30-40% de tokens en moins par appel API

### Ce qui ne change pas
- Le contenu des règles (aucune règle supprimée, juste dé-dupliquée)
- La qualité des outputs (mêmes instructions, juste pas répétées)
- Les edge functions qui appellent ces prompts (seuls les imports changent)
- `BASE_SYSTEM_RULES` (déjà propre)

### Risque
Faible. On ne retire aucune règle, on retire des copies. Le seul risque est un import cassé, qu'on vérifiera avec un `grep` sur tous les fichiers qui utilisent les exports supprimés.

