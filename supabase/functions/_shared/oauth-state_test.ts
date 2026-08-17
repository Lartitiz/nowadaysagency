// Tests du state OAuth signé (protection anti-CSRF du flux social-oauth-*) et du PKCE Canva.
//
// Lancer : deno test --no-check --allow-all supabase/functions/_shared/oauth-state_test.ts

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  signState,
  verifyState,
  generateCodeVerifier,
  codeChallengeS256,
} from "./oauth-state.ts";

const SECRET = "test-oauth-state-secret";

// ---------- signState / verifyState ----------

Deno.test("signState -> verifyState: round-trip renvoie le payload intact", async () => {
  const payload = {
    user_id: "user-1",
    workspace_id: "ws-1",
    platform: "instagram",
    origin: "https://nowadays-assistant.fr",
    nonce: "abc-123",
    ts: Date.now(),
  };
  const state = await signState(payload, SECRET);
  const decoded = await verifyState(state, SECRET);
  assertEquals(decoded, payload);
});

Deno.test("verifyState: rejette un state avec mauvaise signature (secret différent)", async () => {
  const state = await signState({ user_id: "user-1" }, SECRET);
  const decoded = await verifyState(state, "un-autre-secret");
  assertEquals(decoded, null);
});

Deno.test("verifyState: rejette un payload altéré (data modifiée, signature d'origine conservée)", async () => {
  const state = await signState({ user_id: "user-1", platform: "instagram" }, SECRET);
  const [data, sig] = state.split(".");
  // On modifie un caractère de la partie data pour simuler une falsification.
  const tamperedChar = data[0] === "a" ? "b" : "a";
  const tampered = `${tamperedChar}${data.slice(1)}.${sig}`;
  const decoded = await verifyState(tampered, SECRET);
  assertEquals(decoded, null);
});

Deno.test("verifyState: rejette une signature altérée", async () => {
  const state = await signState({ user_id: "user-1" }, SECRET);
  const [data, sig] = state.split(".");
  const tamperedSig = sig.slice(0, -1) + (sig.at(-1) === "A" ? "B" : "A");
  const decoded = await verifyState(`${data}.${tamperedSig}`, SECRET);
  assertEquals(decoded, null);
});

Deno.test("verifyState: rejette un state absent de point de séparation", async () => {
  const decoded = await verifyState("nimportequoi-sans-point", SECRET);
  assertEquals(decoded, null);
});

Deno.test("verifyState: rejette un state vide", async () => {
  const decoded = await verifyState("", SECRET);
  assertEquals(decoded, null);
});

Deno.test("verifyState: rejette un state avec trop de segments", async () => {
  const state = await signState({ user_id: "user-1" }, SECRET);
  const decoded = await verifyState(`${state}.extra`, SECRET);
  assertEquals(decoded, null);
});

Deno.test("verifyState: accepte un state dans la fenêtre de validité (maxAgeMs)", async () => {
  const state = await signState({ ts: Date.now() - 5000 }, SECRET);
  const decoded = await verifyState(state, SECRET, 10_000);
  assertNotEquals(decoded, null);
});

Deno.test("verifyState: rejette un state expiré (au-delà de maxAgeMs) — protège contre le rejeu d'un vieux lien", async () => {
  const state = await signState({ ts: Date.now() - 11 * 60 * 1000 }, SECRET);
  const decoded = await verifyState(state, SECRET); // maxAgeMs par défaut = 10 min
  assertEquals(decoded, null);
});

Deno.test("verifyState: un payload sans `ts` n'est jamais rejeté pour expiration", async () => {
  const state = await signState({ user_id: "user-1" }, SECRET);
  const decoded = await verifyState(state, SECRET, 1);
  assertNotEquals(decoded, null);
});

// ---------- PKCE (Canva) ----------

Deno.test("generateCodeVerifier: longueur et alphabet base64url conformes RFC 7636", () => {
  const verifier = generateCodeVerifier();
  assertEquals(verifier.length, 43);
  assertEquals(/^[A-Za-z0-9_-]+$/.test(verifier), true);
});

Deno.test("generateCodeVerifier: deux appels produisent des valeurs différentes", () => {
  const a = generateCodeVerifier();
  const b = generateCodeVerifier();
  assertNotEquals(a, b);
});

Deno.test("codeChallengeS256: déterministe pour un même verifier", async () => {
  const verifier = generateCodeVerifier();
  const a = await codeChallengeS256(verifier);
  const b = await codeChallengeS256(verifier);
  assertEquals(a, b);
});

Deno.test("codeChallengeS256: vecteur de test RFC 7636 (Appendix B)", async () => {
  // https://datatracker.ietf.org/doc/html/rfc7636#appendix-B
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  const challenge = await codeChallengeS256(verifier);
  assertEquals(challenge, expectedChallenge);
});

Deno.test("codeChallengeS256: deux verifiers différents donnent des challenges différents", async () => {
  const a = await codeChallengeS256(generateCodeVerifier());
  const b = await codeChallengeS256(generateCodeVerifier());
  assertNotEquals(a, b);
});
