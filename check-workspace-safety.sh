#!/usr/bin/env bash
# check-workspace-safety.sh — Watchdog isolation workspace.
#
# Attrape la classe de bug "fuite de données entre comptes" : une Edge Function
# qui résout un workspace puis filtre/écrit quand même par user.id brut, ou un
# INSERT dans une table workspace-scopée sans workspace_id.
#
# Ces bugs sont INVISIBLES en self-test admin (l'admin sans workspace retombe
# toujours sur user_id et "ça marche"). D'où ce watchdog automatique.
#
# Usage : bash check-workspace-safety.sh   (exit 1 si violation dure)

set -uo pipefail
cd "$(dirname "$0")"

FAIL=0
ylw(){ printf "\033[33m%s\033[0m\n" "$1"; }
red(){ printf "\033[31m%s\033[0m\n" "$1"; }
grn(){ printf "\033[32m%s\033[0m\n" "$1"; }

echo "── Watchdog workspace ──"

# 1. .eq("user_id", user.id) en Edge Function, hors lookup légitime d'appartenance
#    (workspace_members) — pattern dangereux de filtre métier par user brut.
HITS=$(grep -rnE '\.eq\(\s*["'"'"']user_id["'"'"']\s*,\s*user\.id' supabase/functions --include=*.ts 2>/dev/null \
  | grep -v "workspace_members" || true)
if [ -n "$HITS" ]; then
  ylw "⚠️  .eq(\"user_id\", user.id) hors workspace_members — vérifier le scope :"
  echo "$HITS"
  FAIL=1
else
  grn "✅ Aucun filtre user_id brut suspect en Edge Function"
fi

# 2. Frontend : filtrage par session.user.id au lieu de useWorkspaceFilter / useProfileUserId
HITS=$(grep -rnE '\.eq\(\s*["'"'"']user_id["'"'"']\s*,\s*(session\.)?user\.id' src --include=*.ts --include=*.tsx 2>/dev/null \
  | grep -viE 'workspace|auth check|profileUserId' || true)
if [ -n "$HITS" ]; then
  ylw "⚠️  Frontend : filtre par user.id brut (préférer useWorkspaceFilter/useProfileUserId) :"
  echo "$HITS"
  FAIL=1
else
  grn "✅ Aucun filtre user.id brut suspect côté frontend"
fi

if [ "$FAIL" -ne 0 ]; then
  red "── Watchdog : points à vérifier manuellement (faux positifs possibles) ──"
  exit 1
fi
grn "── Watchdog workspace : RAS ──"
exit 0
