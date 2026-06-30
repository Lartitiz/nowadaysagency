// Chiffrement at-rest des jetons OAuth stockés dans social_connections
// (access_token / refresh_token).
//
// - AES-256-GCM, clé fournie via le secret `TOKEN_ENCRYPTION_KEY`
//   (32 octets encodés en base64).
// - Format versionné `enc.v1:<base64(iv|ciphertext)>` pour pouvoir évoluer.
// - TOLÉRANT AU CLAIR : un jeton qui ne porte pas le préfixe est renvoyé tel
//   quel. Cela permet un déploiement sans migration : les jetons en clair
//   existants restent lisibles et seront rechiffrés au prochain refresh /
//   à la prochaine reconnexion.
// - FAIL-OPEN si la clé est absente : `encryptToken` stocke alors en clair
//   (au lieu de casser la connexion). À surveiller via les logs.

const PREFIX = "enc.v1:";

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let keyPromise: Promise<CryptoKey | null> | null = null;

function loadKey(): Promise<CryptoKey | null> {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    const raw = Deno.env.get("TOKEN_ENCRYPTION_KEY");
    if (!raw) return null;
    let keyBytes: Uint8Array;
    try {
      keyBytes = b64ToBytes(raw.trim());
    } catch {
      console.error("TOKEN_ENCRYPTION_KEY n'est pas un base64 valide.");
      return null;
    }
    if (keyBytes.length !== 32) {
      console.error(`TOKEN_ENCRYPTION_KEY doit faire 32 octets (reçu ${keyBytes.length}).`);
      return null;
    }
    return await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
  })();
  return keyPromise;
}

// Chiffre un jeton. Idempotent (ne re-chiffre pas une valeur déjà chiffrée).
export async function encryptToken(
  plain: string | null | undefined,
): Promise<string | null> {
  if (plain == null || plain === "") return plain ?? null;
  if (plain.startsWith(PREFIX)) return plain; // déjà chiffré
  const key = await loadKey();
  if (!key) return plain; // pas de clé : on stocke en clair (fail-open)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plain) as BufferSource,
  );
  const ct = new Uint8Array(ctBuf);
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv, 0);
  combined.set(ct, iv.length);
  return PREFIX + bytesToB64(combined);
}

// Déchiffre un jeton. Renvoie tel quel si non chiffré (clair hérité).
export async function decryptToken(
  stored: string | null | undefined,
): Promise<string | null> {
  if (stored == null || stored === "") return stored ?? null;
  if (!stored.startsWith(PREFIX)) return stored; // clair hérité
  const key = await loadKey();
  if (!key) {
    console.error("Jeton chiffré mais TOKEN_ENCRYPTION_KEY absente.");
    return stored;
  }
  try {
    const combined = b64ToBytes(stored.slice(PREFIX.length));
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource);
    return new TextDecoder().decode(ptBuf);
  } catch (e) {
    console.error("Échec du déchiffrement d'un jeton:", e);
    return stored;
  }
}

// Déchiffre EN PLACE les jetons d'une ligne social_connections chargée, pour
// que le reste du code continue d'utiliser conn.access_token / refresh_token
// en clair comme avant.
export async function decryptConnTokens<
  T extends { access_token?: string | null; refresh_token?: string | null },
>(conn: T | null | undefined): Promise<T | null | undefined> {
  if (!conn) return conn;
  if (conn.access_token) conn.access_token = await decryptToken(conn.access_token);
  if (conn.refresh_token) conn.refresh_token = await decryptToken(conn.refresh_token);
  return conn;
}
