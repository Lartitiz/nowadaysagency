// Autorisation INTERNE entre deux fonctions serveur (chantier AA, 18/10/2026).
//
// « Refaire cette slide » : carousel-ai écrit la slide, puis appelle
// carousel-visual pour la redessiner. Le crédit est débité UNE fois, par
// carousel-ai, après les deux étapes. carousel-visual ne doit donc pas débiter
// de son côté, mais seulement quand l'appel vient vraiment de carousel-ai pour
// cette utilisatrice : sinon n'importe qui pourrait redessiner un carrousel
// sans crédit en ajoutant un champ au corps.
//
// Le jeton est une signature HMAC-SHA256 (clé : SUPABASE_SERVICE_ROLE_KEY,
// connue des seules fonctions serveur) de « but:utilisatrice:échéance ». Il ne
// sert qu'à ce but, à cette utilisatrice, et expire vite (5 minutes).
// Module NEUTRE (_shared/carousel-design-boundaries_test.ts) : aucun import local.

const encoder = new TextEncoder();

async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function secret(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

/** « Refaire cette slide » : carousel-ai → carousel-visual (en-tête et but du jeton). */
export const SLIDE_REDO_GRANT = { header: "x-slide-redo-grant", purpose: "slide_redo" } as const;

/** Durée de vie d'un jeton : le temps d'un appel de rendu, pas plus. */
export const INTERNAL_GRANT_TTL_MS = 5 * 60_000;

/** Jeton pour `purpose` et `userId`, ou "" si la clé serveur manque. */
export async function signInternalGrant(purpose: string, userId: string, now = Date.now()): Promise<string> {
  const key = secret();
  if (!key) return "";
  const expires = now + INTERNAL_GRANT_TTL_MS;
  const message = `${purpose}:${userId}:${expires}`;
  return `${expires}.${await hmacHex(key, message)}`;
}

/** Vrai seulement pour un jeton signé par le serveur, pour ce but, cette utilisatrice, non expiré. */
export async function verifyInternalGrant(token: string | null | undefined, purpose: string, userId: string, now = Date.now()): Promise<boolean> {
  const key = secret();
  if (!key || !token || typeof token !== "string") return false;
  const [expiresRaw, sig] = token.split(".");
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || !sig || expires < now || expires > now + INTERNAL_GRANT_TTL_MS) return false;
  const expected = await hmacHex(key, `${purpose}:${userId}:${expires}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
