/**
 * T21-admin-legit — Accès admin légitime
 *
 * compte-t21.spec.ts ne couvre que le cas NON-admin (Camille). Ce fichier
 * couvre le cas symétrique : un compte AVEC le rôle admin (table user_roles,
 * cf. has_role() dans supabase/migrations) doit accéder à /admin/audit et
 * /admin/coaching sans redirection ni crash.
 *
 * Nécessite un compte de test admin distinct de Camille. Optionnel et non
 * bloquant : sans VISITE_ADMIN_PASSWORD configuré, ce test est sauté (voir
 * .env.visite.local.example).
 *
 * Construit sa propre session (login API Supabase, même mécanique que
 * auth.setup.ts) plutôt que d'utiliser la session Camille des projets
 * desktop/mobile — les deux comptes ne doivent jamais se mélanger.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readEnvFile(file: string): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!fs.existsSync(file)) return vars;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
}

const ADMIN_PAGES = ["/admin/audit", "/admin/coaching"] as const;

test("T21-admin-legit — un compte avec le rôle admin accède à /admin/audit et /admin/coaching sans redirection", async ({ browser }) => {
  const adminEmail = process.env.VISITE_ADMIN_EMAIL || "laetitia@nowadaysagency.com";
  const adminPassword = process.env.VISITE_ADMIN_PASSWORD;

  test.skip(
    !adminPassword,
    "VISITE_ADMIN_PASSWORD non configuré — ajoute VISITE_ADMIN_EMAIL/VISITE_ADMIN_PASSWORD " +
      "(compte avec le rôle admin dans user_roles) dans .env.visite.local pour activer ce test.",
  );

  const repoEnv = readEnvFile(path.join(__dirname, "..", ".env"));
  const supabaseUrl = process.env.VITE_SUPABASE_URL || repoEnv.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || repoEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
  test.skip(!supabaseUrl || !anonKey, "VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY introuvables.");

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey!, "content-type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    signal: AbortSignal.timeout(15_000),
  });
  test.skip(!res.ok, `Login admin API en échec (HTTP ${res.status}) — vérifie VISITE_ADMIN_EMAIL/VISITE_ADMIN_PASSWORD.`);

  const session = await res.json();
  test.skip(!session?.access_token, "Réponse /token sans session exploitable.");

  const projectRef = new URL(supabaseUrl!).hostname.split(".")[0];
  const baseURL = process.env.VISITE_BASE_URL || "https://nowadays-assistant.fr";
  const origin = new URL(baseURL).origin;

  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin,
          localStorage: [
            { name: `sb-${projectRef}-auth-token`, value: JSON.stringify(session) },
          ],
        },
      ],
    },
  });

  try {
    const page = await context.newPage();

    for (const adminPath of ADMIN_PAGES) {
      await page.goto(adminPath, { waitUntil: "networkidle" });

      // Pas de redirection : on doit rester sur la page admin demandée.
      expect(page.url(), `Redirigé hors de ${adminPath}`).toContain(adminPath);

      const body = (await page.locator("body").textContent()) || "";
      expect(body, `Page ${adminPath} en erreur/crash pour un compte admin`).not.toMatch(
        /uncaught error|something went wrong|cannot read|page introuvable|404/i,
      );
      expect(body.trim().length, `Page ${adminPath} trop courte (${body.trim().length} chars)`).toBeGreaterThan(50);
    }
  } finally {
    await context.close();
  }
});
