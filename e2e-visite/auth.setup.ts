import { test as setup } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Connecte le compte test "Camille" une seule fois et sauvegarde la session
// (localStorage Supabase inclus) pour que la visite parte d'un état authentifié.
const AUTH_FILE = path.join(__dirname, ".auth/camille.json");

setup("authentifie le compte test Camille", async ({ page }) => {
  const email = process.env.VISITE_EMAIL || "laetitiatest@nowadaysagency.com";
  const pwd = process.env.VISITE_PASSWORD;
  if (!pwd) {
    throw new Error(
      "VISITE_PASSWORD manquant. Copie .env.visite.local.example -> .env.visite.local " +
        "et renseigne le mot de passe du compte test (fichier jamais commité).",
    );
  }

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
