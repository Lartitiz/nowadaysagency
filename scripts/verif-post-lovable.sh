#!/usr/bin/env bash
# verif-post-lovable.sh — À LANCER APRÈS CHAQUE CHANTIER IMPLÉMENTÉ PAR LOVABLE.
#
# Pourquoi : Lovable livre parfois à moitié (helper manquant), casse un import,
# ou rouvre un bug corrigé. tsc seul ne le voit pas. Ce script attrape
# automatiquement les classes de régression récurrentes du projet.
#
# Usage :   bash scripts/verif-post-lovable.sh
# Codes :   0 = OK (éventuels ⚠️ à relire) | 1 = ❌ bloquant, ne pas valider le chantier
#
# ❌ = violation dure (corriger avant de valider) | ⚠️ = à relire (faux positifs possibles)

set -uo pipefail
cd "$(dirname "$0")/.."   # racine du repo

FAIL=0; WARN=0
red(){ printf "\033[31m%s\033[0m\n" "$1"; }
ylw(){ printf "\033[33m%s\033[0m\n" "$1"; }
grn(){ printf "\033[32m%s\033[0m\n" "$1"; }
fail(){ red "❌ $1"; FAIL=1; }
warn(){ ylw "⚠️  $1"; WARN=1; }
ok(){ grn "✅ $1"; }

echo "════════ 1. Compilation TypeScript ════════"
# Préférer le tsc local du projet (évite le homonyme npm "tsc@2.x").
if [ -x node_modules/.bin/tsc ]; then TSC="node_modules/.bin/tsc"; else TSC="npx --no-install tsc"; fi
if ! command -v node_modules/.bin/tsc >/dev/null 2>&1 && [ ! -x node_modules/.bin/tsc ] && ! $TSC --version >/dev/null 2>&1; then
  warn "TypeScript introuvable localement — lance d'abord 'npm install', puis relance ce script"
elif $TSC --noEmit --skipLibCheck 2>&1 | tail -20; then
  ok "tsc : 0 erreur"
else
  fail "tsc : erreurs de compilation (voir ci-dessus)"
fi

echo "════════ 2. Patterns BANNIS (Edge Functions) ════════"
if grep -rn "getClaims(" supabase/functions --include=*.ts >/dev/null 2>&1; then
  fail "getClaims() détecté (banni — 401 silencieux → utiliser getUser()) :"
  grep -rn "getClaims(" supabase/functions --include=*.ts
else
  ok "Aucun getClaims()"
fi
if grep -rn "checkAndIncrementUsage" supabase/functions --include=*.ts >/dev/null 2>&1; then
  fail "checkAndIncrementUsage détecté (banni — incrémente avant succès → crédit perdu) :"
  grep -rn "checkAndIncrementUsage" supabase/functions --include=*.ts
else
  ok "Aucun checkAndIncrementUsage (pattern checkQuota AVANT / logUsage APRÈS respecté)"
fi

echo "════════ 3. Catégorie de quota inexistante ════════"
# "coaching" n'existe pas → c'est "coach". Erreur fréquente.
if grep -rnE 'checkQuota\([^,]+,\s*["'"'"']coaching["'"'"']|logUsage\([^,]+,\s*["'"'"']coaching["'"'"']' \
     supabase/functions --include=*.ts >/dev/null 2>&1; then
  fail 'Catégorie "coaching" dans checkQuota/logUsage (n'\''existe pas → utiliser "coach") :'
  grep -rnE 'checkQuota\([^,]+,\s*["'"'"']coaching["'"'"']|logUsage\([^,]+,\s*["'"'"']coaching["'"'"']' \
     supabase/functions --include=*.ts
else
  ok 'Pas de catégorie "coaching" en quota'
fi

echo "════════ 4. Appels Edge Function non wrappés (frontend) ════════"
# Tout appel front doit passer par invokeWithTimeout / invokeWithHeartbeat.
# use-onboarding.ts : un fire-and-forget toléré.
HITS=$(grep -rn "supabase.functions.invoke(" src --include=*.ts --include=*.tsx 2>/dev/null \
  | grep -v "use-onboarding" || true)
if [ -n "$HITS" ]; then
  warn "Appels invoke directs sans wrapper (risque de spinner figé) — vérifier :"
  echo "$HITS"
else
  ok "Tous les appels Edge passent par un wrapper"
fi

echo "════════ 5. Spinner sans filet (setLoading/setSaving sans finally) ════════"
# Heuristique : signale les fichiers à relire (faux positifs probables).
HITS=$(grep -rlnE 'set(Loading|Saving|Generating)\(true\)' src --include=*.tsx 2>/dev/null || true)
if [ -n "$HITS" ]; then
  warn "Fichiers avec setLoading/Saving(true) — vérifier qu'un finally remet à false :"
  echo "$HITS" | sed 's/^/   /'
fi

echo "════════ 6. Watchdog isolation workspace ════════"
if [ -f check-workspace-safety.sh ]; then
  bash check-workspace-safety.sh || warn "Watchdog workspace : points à vérifier (voir ci-dessus)"
else
  fail "check-workspace-safety.sh ABSENT à la racine (le watchdog n'existe pas)"
fi

echo ""
echo "════════════════════════════════════════════"
if [ "$FAIL" -ne 0 ]; then
  red   "❌ ÉCHEC — corrige les ❌ AVANT de valider le chantier."
  exit 1
elif [ "$WARN" -ne 0 ]; then
  ylw   "⚠️  OK avec avertissements — relis les ⚠️ ci-dessus."
  exit 0
else
  grn   "✅ TOUT VERT — chantier sain."
  exit 0
fi
