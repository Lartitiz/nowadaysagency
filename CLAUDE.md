# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nowadays Agency is a full-stack marketing/business coaching SaaS platform for solopreneurs and freelancers. It covers content generation, social media management (Instagram, LinkedIn, Pinterest), website auditing, personal branding, and coaching. Built with the Lovable platform.

## Commands

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run build:dev    # Development build with debugging
npx eslint .         # Lint all files
npm test             # Run all tests once (Vitest)
npm run test:watch   # Run tests in watch mode
npm run test:e2e     # Run Playwright e2e tests
npm run test:e2e:ui  # Run e2e tests with UI
```

Run a single test file:
```bash
npx vitest run src/test/someFile.test.ts
```

## Architecture

**Frontend:** React 18 + TypeScript + Vite (SWC) + Tailwind CSS + shadcn/ui (Radix-based)

**Backend:** Supabase (PostgreSQL, Auth, Edge Functions). ~35 edge functions in `supabase/functions/` handle AI content generation, Stripe webhooks, email triggers, and more.

**State management:** React Context (Auth, Workspace, Session, Demo) + TanStack React Query for server state.

**Routing:** React Router v6 with lazy-loaded pages for code splitting. Protected routes via `ProtectedRoute` and `AdminRoute` components.

### Key directories

- `src/pages/` — Route-level page components (lazy-loaded)
- `src/components/ui/` — shadcn/ui primitives
- `src/components/` — Feature components (coach/, demo/, social-mockup/, admin/, etc.)
- `src/hooks/` — Custom React hooks
- `src/lib/` — Utilities and helpers
- `src/contexts/` — React Context providers (Auth, Workspace, Session, Demo)
- `src/integrations/supabase/` — Supabase client and auto-generated DB types
- `src/config/` — Feature flags and dashboard module config
- `supabase/functions/` — Supabase Edge Functions (Deno runtime)
- `supabase/migrations/` — Database schema migrations
- `e2e/` — Playwright end-to-end tests

### Path alias

`@` maps to `./src` (configured in vite, vitest, and tsconfig).

### Testing setup

Vitest has two project environments:
- **unit** (`node`): files matching `src/test/*.test.ts`
- **dom** (`jsdom`): files matching `src/**/*.{test,spec}.tsx` (with setup file `src/test/setup.ts`)

E2e tests use Playwright (Chromium) against `http://localhost:8080`.

### TypeScript config

Strict mode is **off**. `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters` are all disabled. Target: ES2020.

### Environment variables

Required vars (prefixed `VITE_` for client exposure):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase connection
- `VITE_SENTRY_DSN` — Error tracking
- `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` — Product analytics

### UI patterns

- shadcn/ui components added via `npx shadcn-ui@latest add <component>`
- Tailwind with CSS variables for theming (base color: slate)
- Sonner for toast notifications
- Framer Motion for animations
- Document generation: jsPDF, pptxgenjs, xlsx

---

# INSTRUCTIONS PROJET — L'ASSISTANT COM'

## CONTEXTE

L'Assistant Com' est un outil SaaS créé par Laetitia Mattioli (Nowadays Agency) pour aider les solopreneur·es créatif·ves et éthiques à structurer, produire et piloter leur communication. C'est un espace tout-en-un : branding, création de contenu IA, planification, audits et coaching.

- URL : nowadays-assistant.fr (hébergé OVH + Lovable, IP 185.158.133.1)
- Repo principal : github.com/Lartitiz/nowadaysagency.git (toujours se baser sur le repo à jour)
- Repo CRM missions : github.com/Lartitiz/mission-flow.git (outil interne séparé)

**Philosophie** : « La communication comme émancipation, pas manipulation. » L'IA propose, l'utilisateur·ice décide. Chaque contenu généré est une base à personnaliser avec SA voix.

Ce n'est PAS un Hootsuite (programmation pure), un Canva (création visuelle), ni un ChatGPT (IA généraliste). C'est un outil de stratégie de communication personnalisé où l'IA connaît le branding de la personne et génère des contenus cohérents avec SA voix.

**IMPORTANT** : L'outil doit s'adresser à une audience LARGE. Les prompts IA, exemples et onboarding doivent rester neutres et dynamiques, pas biaisés vers un seul persona. Le branding Nowadays reste légitime mais l'outil est ouvert à tou·tes.

## STACK TECHNIQUE

- Frontend : React / TypeScript / Tailwind CSS / shadcn-ui / Framer Motion (via Lovable)
- Backend : Supabase (PostgreSQL + Edge Functions Deno + Storage + Auth)
- IA : API Claude Anthropic
  - Sonnet : structuration, onboarding, audits rapides
  - Opus : génération de contenu ("wahou effect" conservé)
- Paiements : Stripe (live mode activé)
- Analytics : PostHog + Sentry
- Email : Resend (domaine nowadaysagency.com sur Squarespace)
- Hébergement : OVH + Lovable

## ARCHITECTURE FONCTIONNELLE

### Modules actifs — Pipeline kanban missions (CRM interne)
- Appel découverte
- Proposition commerciale
- Kick-off
- Plan d'actions
- Suivi
- Espace client

### Fonctionnalités détaillées

**Onboarding conversationnel (4 phases)**
- Phase 1 : profil (activité, canaux, blocages, objectifs)
- Phase 2 : import documents + audit en fond (Instagram, site)
- Phase 3 : branding conversationnel IA (positionnement, mission, ton)
- Phase 4 : diagnostic guidé avec score animé, forces, faiblesses, 3 priorités actionnables, récap par canal
- Dictée vocale disponible
- Endowed Progress Effect (barre commence à 15%)

**Espace Branding (6 sections)** — Chaque section a 2 onglets : fiche éditable (vue structurée avec cards) + coaching IA (questions une par une).
- Mon histoire (storytelling)
- Mon client·e idéal·e (persona) — fiche design pro style HubSpot/Xtensio, export PDF
- Ma proposition de valeur
- Mon ton, mon style & mes combats
- Ma stratégie de contenu
- Mes offres

**Audits IA**
- Audit Instagram (bio, posts, régularité, hashtags, engagement)
- Audit site web (SEO, structure, contenu, conversion)
- Analyse documents importés
- Mini-diagnostic flash landing page

**Création de contenu IA** — Générateurs par format alimentés par le branding : Reels (script + structure + hook + CTA + ambiance musicale), carrousels, posts Instagram, stories, newsletters, posts LinkedIn, épingles Pinterest, bio Instagram créative. Menu contextuel IA sur sélection de texte : reformuler, développer, raccourcir, CTA, rendre percutant, transformer en hook, demande libre.

**Calendrier éditorial** — Vue mensuelle, drag & drop, connecté aux générateurs (contexte passé automatiquement via navigate state). Le contenu généré revient dans le post du calendrier.

**Bibliothèque d'idées (Atelier)** — Stocker, classer, transformer les idées en contenus. Envoi vers calendrier ou générateur.

**Espaces par canal** — Instagram, LinkedIn, Pinterest, Site web, Newsletter. Chacun avec checklist, guides, outils spécifiques, générateurs dédiés.

**Dashboard bento** — Grille bento avec cards de tailles différentes : audit branding, prochains posts, routine d'engagement, stats, accès rapide aux espaces, card accompagnement Laetitia (si binôme) ou card CTA (si gratuit).

**Gamification** — Streaks de régularité, badges déblocables, compteur semaine, barre de progression branding, confettis aux étapes clés. Ton bienveillant, jamais culpabilisant.

**Connecteurs intelligents** — Quand un champ structurant est modifié (positionnement, mission, valeurs, ton, offres…), l'IA compare avant/après, scanne tout le reste et suggère des mises à jour. Application en 1 clic ou section par section. Toast immédiat + card persistante dashboard.

**Espace accompagnement (Ta Binôme de Com')** — Vue cliente : programme (mois en cours, progression), sessions planifiées (à venir/passées), livrables déblocables, journal de bord, message personnalisé de Laetitia.

**Admin (Laetitia)** — Dashboard coach : vue programmes actifs, sessions planifiées, préparation kick-off automatisée (résumé IA + agenda suggéré + sujets manquants + branding complétion par champ). Page /admin/audit : scan complet de l'app (tables, RLS, cohérence données, connexions modules, mode démo).

### MODE DÉMO
Compte pré-rempli "Léa" (photographe portraitiste éthique). Sert pendant les appels découverte.
- Toggle Free/Binôme pour montrer les 2 expériences
- Données en dur (pas d'appel Supabase ni IA)
- Toutes fonctionnalités navigables et interactives
- Données démo : score branding 62, 4 forces, 5 faiblesses, 3 priorités, scores par canal (Instagram 58, Site 71, Newsletter 12, Branding 85)

## BUSINESS MODEL (3 plans)

### Plan Gratuit (freemium — porte d'entrée)
- Onboarding conversationnel complet
- Espace branding (6 sections + coaching IA)
- Calendrier éditorial + bibliothèque d'idées
- 30 crédits IA/mois (compteur unique, toutes fonctionnalités IA confondues)
- Espaces par canal
- Dashboard bento, gamification

### Plan Premium (39€/mois)
Tout le gratuit + :
- Crédits IA illimités
- Audits illimités (Instagram, LinkedIn, site)
- Import stats (Excel/CSV) + Dashboard KPI
- Contacts stratégiques + routine d'engagement + mini-CRM prospection
- Communauté (poster, commenter, lives mensuels, replays)
- Positionnement : présent sur la page pricing, PAS poussé dans la communication. Se vend par l'usage.

### Ta Binôme de Com' (250€/mois × 6 mois = 1 500€)
L'outil premium est inclus. L'accompagnement humain se greffe dessus :
- Phase 1 Stratégie (mois 1-2) : kick-off + branding + plan 6 mois (done for you)
- Phase 2 Application (mois 3-6) : 1 visio 2h/mois + WhatsApp jours ouvrés 24-48h + validation livrables (done with you)
- Option non publique : plan de com' seul 290€/mois × 3 mois (proposée uniquement en appel découverte).

## PARCOURS DE CONVERSION FREEMIUM → PREMIUM

4 points de friction progressifs :

1. **Jauge visible en continu** (AiCreditsCounter dans le header) — Badge avec ring SVG circulaire. 4 paliers : Confort (>50%, vert), Attention (20-50%, orange, pulse), Urgence (<20%, rouge, pulse, CTA), Épuisé (0, rouge statique, date renouvellement + CTA).

2. **Banner "derniers crédits"** (dans CreerUnifie.tsx) — Quand il reste 1 à 4 crédits (plan free uniquement). Ton bienveillant.

3. **Modal interstitiel à 0 crédit** (QuotaWallModal) — Bilan positif du mois + date de renouvellement avec compte à rebours + CTA Premium + alternatives en attendant.

4. **Tracking PostHog** — Events : quota_warning_shown, low_credits_banner_shown, low_credits_banner_cta_clicked, quota_wall_shown, quota_wall_cta_clicked, quota_wall_dismissed.

## CONVENTIONS TECHNIQUES

### Workflow de développement
- Toujours se baser sur le repo GitHub à jour avant de proposer une modification
- 1 prompt = 1 fichier = 1 fonctionnalité (modifications chirurgicales)
- Toujours inclure des blocs "NE PAS TOUCHER" / "NE PAS MODIFIER" pour protéger les fichiers et fonctionnalités existantes
- Vérification après chaque implémentation : `npx tsc --noEmit --skipLibCheck`
- Préférer les corrections ciblées aux refactorisations larges

### Patterns Supabase / Edge Functions

**Quota IA :**
- Pattern obligatoire : `checkQuota()` AVANT l'appel IA + `logUsage()` APRÈS succès
- NE PAS utiliser `checkAndIncrementUsage` (incrémente même en cas d'échec)
- Système de crédits : compteur unique total (30 pour free, illimité pour outil/binôme). Les sous-catégories existent dans plan-limiter.ts pour l'analytics mais sont toutes égales au total en free (pas de blocage individuel).

**Workspace isolation :**
- Utiliser le hook `useWorkspaceFilter` pour filtrer les données par workspace
- NE PAS hardcoder `.eq("user_id", user.id)` partout

**Tables spéciales :**
- `voice_profile` et `brand_charter` : filtrer par `user_id` du propriétaire, PAS par `workspace_id`

**Timeouts :**
- Opus : 120s
- Audits complexes : 120-180s
- Génération standard : 60s

## IDENTITÉ VISUELLE

### Couleurs
- Rose framboise : #FB3D80 (accent principal)
- Rose moyen : #FFA7C6
- Rose doux : #FFD6E8
- Rose très pâle : #FFF4F8 (fond par défaut)
- Jaune lumière : #FFE561
- Rouge intense : #91014b (titres)
- Dark : #1A1A1A

### Typographie
- Titres : Libre Baskerville (serif, élégant, jamais en gras)
- Corps : IBM Plex Sans (lisible, moderne)

### Style UI
- Cards arrondies (20px), ombres douces
- Micro-interactions, glassmorphism subtil
- Inspiration Yayoi Kusama : pop art, joyeux mais pro
- JAMAIS de cercle/rond décoratif en fond : uniquement rectangles arrondis
- Pas de beige boring, pas d'éléments décoratifs lourds
- Beaucoup d'air, de blanc, de respiration

## VOCABULAIRE OBLIGATOIRE

| Terme correct | Termes INTERDITS |
|---|---|
| L'Assistant Com' (avec l'apostrophe) | — |
| Ta Binôme de Com' | Now Academy, Now Pilot, Now Studio, "formation", "coaching" seul |
| Ton Agency de Com | — |
| Nowadays (marque ombrelle) | — |

## GLOSSAIRE TECHNIQUE

| Terme | Signification |
|---|---|
| Branding | L'ensemble des 6 sections de l'espace branding (pas juste le logo) |
| Crédits IA | Unité de consommation des appels API Claude. 30/mois en gratuit (compteur unique), illimité en premium/binôme. |
| Connecteurs intelligents | Système de propagation des modifications branding vers tous les contenus |
| Mode démo | Compte "Léa" pré-rempli pour les appels découverte |
| Binôme | L'offre d'accompagnement 6 mois (250€/mois) |
| Navigate state | Méthode React pour passer le contexte du calendrier vers les générateurs |
| Dashboard bento | Grille de cards de tailles différentes sur la page d'accueil |
| Endowed Progress Effect | Biais psychologique : la barre de progression commence à 15% pour motiver |
| QuotaWallModal | Modal interstitiel affiché à 0 crédit. Bilan du mois + CTA Premium + date de renouvellement. |

## RÈGLES D'OR

1. **Jamais de régression** : chaque modification doit préserver 100% des fonctionnalités existantes
2. **Un prompt = un sujet** : pas de modification fourre-tout qui touche à 5 fichiers
3. **Vérifier avant de coder** : toujours consulter le repo à jour
4. **Pattern quota strict** : checkQuota → appel IA → logUsage (dans cet ordre)
5. **Workspace first** : toute requête de données passe par useWorkspaceFilter
6. **L'outil est universel** : les textes, exemples et prompts IA internes doivent parler à tout le monde
7. **Corrections ciblées > refactorisations larges** : on corrige chirurgicalement, on ne refait pas tout