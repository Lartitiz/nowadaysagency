// Fuite de style (audit slop 18/08, Constat 2) : chat-guide réimplémente sa
// propre boucle SSE au lieu d'utiliser _shared/anthropic-stream.ts, qui
// aurait donné le nettoyage sanitizeStyle gratuitement. Filet minimal en
// attendant la vraie bascule (voir commentaire sur parseChatReply dans
// index.ts) : sanitizeStyle appliqué dans parseChatReply avant tout parsing
// de marqueurs. Ce test vérifie ce filet directement (fonction pure, pas de
// streaming à simuler).
//
// Lancer : deno test --allow-env --allow-read supabase/functions/chat-guide/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureServeHandler, setTestEnv } from "../_shared/test-edge-harness.ts";

setTestEnv();
const MODULE_URL = new URL("./index.ts", import.meta.url).href;
// chat-guide utilise Deno.serve : captureServeHandler neutralise l'ouverture
// d'un vrai socket pendant l'import (même patron que generate-voice-guide).
await captureServeHandler(MODULE_URL);
// Second import : cache ESM, ne ré-exécute pas le module (donc pas de
// second Deno.serve réel) — récupère juste le reste des exports nommés.
const { parseChatReply } = await import(MODULE_URL);

Deno.test("parseChatReply nettoie les tirets cadratins avant de parser les marqueurs", () => {
  const raw = "Salut — comme prévu, voici ton plan.\n[ACTION_LINK:/calendrier|Ouvrir le calendrier]";
  const { cleanText, actions } = parseChatReply(raw);
  assertEquals(cleanText, "Salut, comme prévu, voici ton plan.");
  assertEquals(actions, [{ route: "/calendrier", label: "Ouvrir le calendrier", icon: "CalendarDays" }]);
});

Deno.test("parseChatReply nettoie aussi le texte des cartes de plan et des suggestions", () => {
  const raw =
    "Le truc c'est que ta semaine est calée.\n" +
    "[PLAN_POST:Lundi|post|Mon offre — enfin claire|visibilite]\n" +
    "[SUGGESTION:Écrire un post sur mes coulisses — sans filtre]";
  const { cleanText, plan, aiSuggestions } = parseChatReply(raw);
  assertEquals(cleanText, "Ta semaine est calée.");
  assertEquals(plan.length, 1);
  assertEquals(plan[0].subject, "Mon offre, enfin claire");
  assertEquals(aiSuggestions, ["Écrire un post sur mes coulisses, sans filtre"]);
});
