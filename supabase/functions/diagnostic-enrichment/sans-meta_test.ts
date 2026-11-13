import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sansMeta } from "./sans-meta.ts";
Deno.test("la remarque de confiance disparaît du portrait", () => {
  assertEquals(
    sansMeta("Deux publics : les acheteurs et les partenaires. Confiance faible : profil déduit, aucune source en ligne analysée."),
    "Deux publics : les acheteurs et les partenaires.",
  );
  assertEquals(sansMeta("Des clientes en confiance avec leur image."), "Des clientes en confiance avec leur image.");
  assertEquals(sansMeta("Confiance faible : rien."), null);
  assertEquals(sansMeta(null), null);
});
