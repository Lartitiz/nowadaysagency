# Harmonisation textes crédits IA — fin de l'"illimité" Premium

Aucune logique modifiée. Uniquement des chaînes affichées. `plan-limiter.ts` non touché.

## (a) Modifications demandées

### 1. `src/pages/AbonnementPage.tsx`
- L.320 : `credits="25 crédits IA/mois"` → `credits="60 crédits IA/mois"` (carte Gratuit)
- Reste inchangé (300 déjà OK partout ailleurs).

### 2. `src/pages/PricingPage.tsx`
Tableau comparatif :
- L.35 : ligne "Contenus IA par mois" → `outil: "300/mois", studio: "300/mois"`
- L.47 : ligne "Audits IA par mois" → `outil: "300/mois", studio: "300/mois"`

Bloc descriptif Premium :
- L.241 : "Contenus IA illimités, audits illimités, communauté active." → "300 crédits IA/mois (générations + audits), communauté active."
- L.247 : "Contenus IA illimités (posts, reels, stories, newsletters…)" → "300 crédits IA/mois (posts, reels, stories, newsletters, audits…)"
- L.248 : supprimer la ligne "Audits IA illimités" (fusionnée dans la précédente) — **à confirmer**, alternative : la remplacer par "Audits IA inclus dans les 300 crédits". Voir question ci-dessous.

### 3. `src/lib/stripe-config.ts` (features plan outil, L.22-23)
- Remplacer les 2 lignes `"Générations IA illimitées"` + `"Audits illimités"` par 1 seule : `"300 crédits IA / mois (générations + audits)"`
- priceId, prix, mode, CREDIT_PACKS, STRIPE_PRODUCTS, ligne free L.10 → inchangés

### 4. `src/components/UpgradeGate.tsx`
- L.15 : "…passer au Premium pour des crédits illimités." → "…passer au Premium pour 300 crédits IA/mois."
- L.16 : "…passer au Premium pour des audits illimités." → "…passer au Premium pour 300 crédits IA/mois."
- L.48 (fallback) : "…Passe au Premium pour des crédits illimités." → "…Passe au Premium pour 300 crédits IA/mois."

### 5. `src/components/QuotaWallModal.tsx`
- L.129 : "Passer à L'Assistant Com' — crédits illimités" → "Passer à L'Assistant Com' — 300 crédits IA/mois"

### 6. `src/components/AiCreditsCounter.tsx`
- L.127 : "Passer à L'Assistant Com' — crédits illimités" → "Passer à L'Assistant Com' — 300 crédits IA/mois"

### 7. `src/lib/email-templates.ts`
- L.125 : "Crédits IA illimités" → "300 crédits IA/mois"
- L.168 : "Crédits IA illimités" → "300 crédits IA/mois"
- L.86, 120, 195 (60 crédits gratuit) inchangés

### 8. `src/pages/BinomeSalesPage.tsx`
- L.43 : "Valeur 39€/mois : crédits IA illimités, audits illimités, tout débloqué" → "Valeur 39€/mois : 300 crédits IA/mois, tout débloqué"

### 9. `src/pages/AccompagnementPage.tsx`
- L.245 : "Crédits IA illimités" → "300 crédits IA/mois"
- L.281 : "Crédits IA illimités" → "300 crédits IA/mois"

### 10. `src/pages/CguCgvPage.tsx`
- L.99 : "25 crédits IA par mois" → "60 crédits IA par mois"
- L.100 : remplacer par le paragraphe complet :
  > Plan L'Assistant Com' Premium : 39€ TTC par mois, sans engagement. Inclut 300 crédits IA par mois (toutes actions IA confondues : génération de contenus, audits, suggestions, adaptations), tous les modules débloqués. Certaines actions spécifiques disposent de limites mensuelles propres, détaillées sur la page Tarifs : coaching IA (120), recherches approfondies (15), imports de statistiques (10), retouches photo (50). Les crédits non utilisés ne sont pas reportés. Des packs de crédits complémentaires sont disponibles à l'achat.
- Section "13. Modification des CGU/CGV" : compléter avec le délai 30 jours et la phrase d'acceptation tacite (texte fourni dans la demande).

## (b) Propositions hors liste explicite (à valider)

Le grep a trouvé d'autres mentions "illimité" liées aux crédits/IA dans des fichiers **non listés**. Elles contredisent l'harmonisation si on les laisse :

- **`src/pages/LandingPage.tsx`** (4 occurrences) :
  - L.115 (FAQ) : "Le premium à 39€/mois débloque les contenus illimités, les audits, les stats…" → "Le premium à 39€/mois débloque 300 crédits IA/mois (contenus + audits), les stats…"
  - L.701 : "Crée sans compter. L'IA en illimité." → "Crée régulièrement. 300 crédits IA/mois."
  - L.707 : "Contenus IA illimités" → "300 crédits IA/mois (contenus + audits)"
  - L.708 : "Audits IA illimités" → à supprimer (fusionnée) ou "Audits IA inclus"

- **`src/pages/PricingPage.tsx`** L.100 (FAQ) et L.123 (meta description SEO) :
  - "Le Premium, c'est l'IA en illimité pour créer tes contenus en autonomie." → "Le Premium, c'est 300 crédits IA/mois pour créer en autonomie."
  - meta description : "…Premium à 39€/mois pour l'IA illimitée…" → "…Premium à 39€/mois avec 300 crédits IA/mois…"

- **Non touchés** (légitimes, pas liés aux crédits IA) :
  - `AbonnementPage.tsx` L.343 "WhatsApp illimité 6 mois" (binôme)
  - `PromoCodeInput.tsx` L.42 (usages illimités d'un code promo)

## Question avant exec

Pour les listes Premium qui affichaient 2 lignes séparées ("Contenus IA illimités" + "Audits IA illimités"), je propose de **fusionner en une seule ligne** "300 crédits IA/mois (générations + audits)" pour rester cohérent avec stripe-config. Confirme si tu préfères garder 2 lignes distinctes (ex : "300 crédits IA/mois — contenus" + "Audits inclus dans les 300 crédits").

## Validation

- `npx tsc --noEmit --skipLibCheck` : 0 erreur
- `grep -rn "illimité" src/` : plus aucune occurrence liée aux crédits/IA
- `grep -rn "25 crédits" src/` : 0 résultat
- Visuel : /tarifs, /abonnement, /cgu-cgv affichent 60 (free) et 300 (premium)
