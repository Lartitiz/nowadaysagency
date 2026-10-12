/**
 * Filet « ligne profiles manquante » (12/10).
 *
 * La ligne `profiles` n'est créée QUE par l'insert de SignupForm, juste après
 * `signUp`. Si cette requête n'atteint jamais le serveur (onglet fermé ou
 * rechargé dans la seconde, coupure réseau), l'inscrite n'a AUCUNE ligne
 * jusqu'à la fin du diagnostic : invisible des stats d'activation et de
 * l'admin, pas d'email de bienvenue (trigger à l'insert), et à son retour le
 * statut onboarding vaut « unknown » → /welcome au lieu de /onboarding.
 *
 * On lit d'abord (cas normal = 1 lecture, aucune écriture), et on ne crée la
 * ligne que si elle manque, en `ON CONFLICT DO NOTHING` : jamais d'écrasement,
 * et sans conflit avec l'insert de SignupForm qui peut courir en parallèle.
 * Mémoïsé par utilisateur : une seule vérification par chargement de l'app.
 */
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { withReadTimeout } from "@/lib/read-timeout";

const pending = new Map<string, Promise<void>>();

function metaText(user: User, key: string): string {
  const v = user.user_metadata?.[key];
  return typeof v === "string" ? v.trim() : "";
}

async function run(user: User): Promise<void> {
  const { data, error } = await withReadTimeout(
    supabase.from("profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
  );
  if (error) throw error;
  if (data) return;

  // Mêmes champs que l'insert de SignupForm ; prénom/activité depuis les
  // métadonnées du compte (posées par signUp, survivent à tout appareil).
  const { error: insertError } = await withReadTimeout(
    supabase.from("profiles").upsert(
      { user_id: user.id, prenom: metaText(user, "prenom"), activite: metaText(user, "activite"), canaux: [] },
      { onConflict: "user_id", ignoreDuplicates: true },
    ),
  );
  if (insertError) throw insertError;
  console.info("[profile] ligne profiles absente — créée par le filet");
}

export function ensureProfileRow(user: User): Promise<void> {
  let p = pending.get(user.id);
  if (!p) {
    p = run(user).catch((err) => {
      // Non bloquant : on retentera au prochain chargement de l'app.
      pending.delete(user.id);
      console.warn("[profile] vérification de la ligne profiles impossible:", err);
    });
    pending.set(user.id, p);
  }
  return p;
}
