/**
 * Règle ESLint nowadays/require-supabase-error-check (bloquante en CI via
 * lint:a11y) : toute écriture Supabase doit lire son erreur, sinon l'échec est
 * silencieux (« succès menteur », audit du 17/08/2026).
 *
 * On vérifie ici les deux faces : les patterns fautifs sont bien attrapés, et
 * les patterns légitimes (destructuration d'error, throwOnError, lectures
 * select, résultat délégué à l'appelant…) ne déclenchent pas de faux positif.
 */
import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import { requireSupabaseErrorCheck } from "../../eslint-rules/require-supabase-error-check.js";

// Branche RuleTester sur vitest (sinon il cherche des describe/it globaux).
(RuleTester as any).describe = describe;
(RuleTester as any).it = it;
(RuleTester as any).itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

// Les écritures doivent être dans un contexte async pour les cas `await`.
const dansAsync = (code: string) => `async function f() { ${code} }`;

ruleTester.run("require-supabase-error-check", requireSupabaseErrorCheck as any, {
  valid: [
    // Destructuration classique de l'erreur.
    dansAsync(`const { error } = await supabase.from("x").insert(y); if (error) throw error;`),
    // Renommage et chaînage après l'écriture.
    dansAsync(`const { data, error: err } = await supabase.from("x").update(y).eq("id", 1).select().single(); use(data, err);`),
    // Rest : l'erreur est dedans.
    dansAsync(`const { data, ...reste } = await supabase.from("x").upsert(y); use(reste);`),
    // Résultat nommé, erreur lue plus loin.
    dansAsync(`const res = await supabase.from("x").upsert(y); if (res.error) log(res.error);`),
    // Accès direct sur l'await.
    dansAsync(`if ((await supabase.from("x").delete().eq("id", 1)).error) alert();`),
    // throwOnError : l'échec devient une exception.
    dansAsync(`await supabase.from("x").insert(y).throwOnError();`),
    // Résultat délégué à l'appelant.
    `function g() { return supabase.from("x").insert(y); }`,
    dansAsync(`return await supabase.from("x").insert(y);`),
    dansAsync(`const res = await supabase.from("x").insert(y); return res;`),
    dansAsync(`await Promise.all([supabase.from("x").insert(y), autre()]);`),
    // .then dont le callback lit l'erreur (objet ou paramètre nommé).
    `supabase.from("x").insert(y).then(({ error }) => handle(error));`,
    `supabase.from("x").insert(y).then((res) => { if (res.error) log(res.error); });`,
    // Les lectures ne sont pas concernées.
    dansAsync(`const { data } = await supabase.from("x").select("*");`),
    dansAsync(`await supabase.from("x").select("*").eq("id", 1);`),
    // .delete / .update hors chaîne .from() : pas du Supabase.
    `cache.delete(key);`,
    dansAsync(`await store.update(valeur);`),
  ],

  invalid: [
    // Résultat jeté.
    {
      code: dansAsync(`await supabase.from("x").insert(y);`),
      errors: [{ messageId: "erreurIgnoree" }],
    },
    // Client admin, chaîne .eq après l'écriture.
    {
      code: dansAsync(`await supabaseAdmin.from("x").delete().eq("user_id", uid);`),
      errors: [{ messageId: "erreurIgnoree" }],
    },
    // .select().single() chaîné mais résultat quand même jeté.
    {
      code: dansAsync(`await supabase.from("x").insert(y).select().single();`),
      errors: [{ messageId: "erreurIgnoree" }],
    },
    // Destructuration sans error.
    {
      code: dansAsync(`const { data } = await supabase.from("x").update(y).eq("id", 1);`),
      errors: [{ messageId: "erreurIgnoree" }],
    },
    // Résultat nommé mais seul .data est lu.
    {
      code: dansAsync(`const res = await supabase.from("x").upsert(y); use(res.data);`),
      errors: [{ messageId: "erreurIgnoree" }],
    },
    // (await ...).data : on lit tout sauf l'erreur.
    {
      code: dansAsync(`use((await supabase.from("x").insert(y)).data);`),
      errors: [{ messageId: "erreurIgnoree" }],
    },
    // .then qui ignore l'erreur (destructuration sans error, ou aucun paramètre).
    {
      code: `supabase.from("x").insert(y).then(({ data }) => use(data));`,
      errors: [{ messageId: "erreurIgnoree" }],
    },
    {
      code: `supabase.from("x").insert(y).then(() => toast.success("ok"));`,
      errors: [{ messageId: "erreurIgnoree" }],
    },
    // .catch seul : le client Supabase ne rejette jamais sur {error}.
    {
      code: `supabase.from("x").delete().eq("id", 1).catch(() => {});`,
      errors: [{ messageId: "erreurIgnoree" }],
    },
    // Promesse flottante : jamais attendue.
    {
      code: `supabase.from("x").insert(y);`,
      errors: [{ messageId: "jamaisAttendue" }],
    },
    {
      code: `void supabase.from("x").insert(y);`,
      errors: [{ messageId: "jamaisAttendue" }],
    },
  ],
});
