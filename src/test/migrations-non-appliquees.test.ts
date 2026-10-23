import { describe, it, expect } from "vitest";
// Sonde lancée chaque lundi par e2e-visite/code-health.mjs.
import { analyser, lireDepot, rapport, estSchema } from "../../e2e-visite/migrations-non-appliquees.mjs";

const NOW = Date.UTC(2026, 9, 19);

describe("sonde migrations non appliquées", () => {
  it("attrape le cas du 23/10/2026 : stats_instagram_source mergée, absente du journal Lovable", () => {
    const { migrations, tags } = lireDepot();
    const avantLovable = tags.filter((t: string) => t !== "0011_stats_instagram_source");
    const res = analyser({ migrations, tags: avantLovable, now: NOW });
    expect(res.nonAppliquees).toEqual(["20261016200000_stats_instagram_source"]);
    expect(rapport(res).verdict).toBe("WARN");
  });

  it("nom rallongé par Lovable, migrations de données et migrations nommées par Lovable", () => {
    const res = analyser({
      now: NOW,
      verifiees: {},
      tags: ["0003_saved_idea_previews_functions"],
      migrations: [
        { fichier: "20261004130000_saved_idea_previews", sql: "CREATE OR REPLACE FUNCTION x()" },
        { fichier: "20261015160000_promo_code_binome", sql: "-- create\nINSERT INTO promo_codes VALUES (1)" },
        { fichier: "20261011111258_46abb480-70d6-4aa6-95d2-3e6563091a59", sql: "ALTER TABLE t ADD c int" },
        { fichier: "20261001000000_avant_le_journal", sql: "CREATE TABLE t()" },
      ],
    });
    expect(res).toEqual({ nonAppliquees: [], donneesRecentes: ["20261015160000_promo_code_binome"] });
  });

  it("un commentaire qui dit « create » ne fait pas une migration de schéma", () => {
    expect(estSchema("/* create table */ UPDATE t SET a = 1; -- drop")).toBe(false);
  });
});
