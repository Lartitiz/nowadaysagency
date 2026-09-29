import { describe, expect, it } from "vitest";
import { isRecycleRefusal } from "@/lib/recycle-result";

describe("recyclage : résultat publiable", () => {
  it("rejects a refusal returned as if it were a post", () => {
    expect(isRecycleRefusal("Contenu non généré : cet essai QA est fictif.")).toBe(true);
    expect(isRecycleRefusal("**Contenu non généré** : il manque des faits.")).toBe(true);
  });

  it("keeps an explicitly fictional post", () => {
    expect(isRecycleRefusal("Exemple fictif : voici le Carnet Azur, 48 pages, à 12 €. ")).toBe(false);
  });
});
