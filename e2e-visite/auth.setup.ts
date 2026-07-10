import { test as setup } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Connecte le compte test "Camille" une seule fois et sauvegarde la session
// (localStorage Supabase inclus) pour que la visite parte d'un état authentifié.
//
// Chemin principal : login par l'API Supabase (POST /auth/v1/token) puis
// storageState synthétisé — zéro UI, zéro waitForURL. Supprime les deux flakes
// documentés du login UI : le waitForURL 45s qui expirait sur réseau froid
// (faux rouge du 07/07/2026) et la fragilité face au rate-limit / à la
// révocation de sessions concurrentes (deux batchs d'audit perdus les 09-10/07).
// Le login UI reste en fallback si l'appel API échoue, ce qui garde une
// couverture du formulaire réel sans conditionner tout le run à sa lenteur.
const AUTH_FILE = path.join(__dirname, ".auth/camille.json");

// Parse un fichier .env sans dépendance dotenv (même logique que
// playwright.visite.config.ts pour .env.visite.local).
function readEnvFile(file: string): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!fs.existsSync(file)) return vars;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
}

// Login API → écrit AUTH_FILE. Retourne false si l'appel échoue (statut loggué,
// jamais le token ni le corps de réponse) pour laisser le fallback UI jouer.
async function apiLogin(email: string, password: string): Promise<boolean> {
  const repoEnv = readEnvFile(path.join(__dirname, "..", ".env"));
  const supabaseUrl = process.env.VITE_SUPABASE_URL || repoEnv.VITE_SUPABASE_URL;
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || repoEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) {
    console.warn("[auth.setup] VITE_SUPABASE_URL/PUBLISHABLE_KEY introuvables → fallback UI");
    return false;
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[auth.setup] login API HTTP ${res.status} → fallback UI`);
      return false;
    }
    const session = await res.json();
    if (!session?.access_token || !session?.refresh_token) {
      console.warn("[auth.setup] réponse /token sans session → fallback UI");
      return false;
    }

    // supabase-js lit la session dans localStorage sous sb-<projectref>-auth-token,
    // au format exact de la réponse /token — on synthétise le storageState direct.
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const origin = new URL(process.env.VISITE_BASE_URL || "https://nowadays-assistant.fr")
      .origin;
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    fs.writeFileSync(
      AUTH_FILE,
      JSON.stringify({
        cookies: [],
        origins: [
          {
            origin,
            localStorage: [
              { name: `sb-${projectRef}-auth-token`, value: JSON.stringify(session) },
            ],
          },
        ],
      }),
    );
    return true;
  } catch (err) {
    console.warn(
      `[auth.setup] login API en échec (${err instanceof Error ? err.name : "?"}) → fallback UI`,
    );
    return false;
  }
}

setup("authentifie le compte test Camille", async ({ page }) => {
  const email = process.env.VISITE_EMAIL || "laetitiatest@nowadaysagency.com";
  const pwd = process.env.VISITE_PASSWORD;
  if (!pwd) {
    throw new Error(
      "VISITE_PASSWORD manquant. Copie .env.visite.local.example -> .env.visite.local " +
        "et renseigne le mot de passe du compte test (fichier jamais commité).",
    );
  }

  if (await apiLogin(email, pwd)) return;

  // Fallback : login par le formulaire réel (chemin historique).
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByPlaceholder(/email/i).first().fill(email);
  await page.getByPlaceholder(/mot de passe|password/i).first().fill(pwd);
  await page.getByRole("button", { name: /se connecter|connexion|login/i }).first().click();

  // Succès = on quitte /login pour un écran connecté.
  // 45s (et non 25s) : le post-login enchaîne une longue série de requêtes REST
  // séquentielles (rôle, plan, workspace, notifs…) avant la redirection ; sur un
  // moment réseau froid, 25s pouvait expirer et faire échouer TOUT le run (faux rouge,
  // observé le 07/07/2026 alors que le login fonctionnait — vérifié via diagnostic direct).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
  await page.waitForTimeout(1500); // laisse la session Supabase se poser dans localStorage

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
