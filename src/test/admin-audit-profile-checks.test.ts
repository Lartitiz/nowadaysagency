import { describe, expect, it } from "vitest";
import { profileChecks } from "@/lib/admin-audit-profile-checks";

describe("profileChecks (/admin/audit)", () => {
  it("relie profiles par user_id et lit prenom / instagram_username", () => {
    const results = profileChecks(
      [
        { user_id: "u-1", prenom: "Camille", instagram_username: "@camille.atelier" },
        { user_id: "u-2", prenom: "Léa", instagram_username: "lea" },
        { user_id: "u-3", prenom: "Sans insta", instagram_username: "  " },
      ],
      ["u-2"],
      ["u-1", "u-2", "u-1"],
    );
    expect(results).toEqual([
      expect.objectContaining({ title: "Camille : Instagram sans audit", detail: expect.stringContaining("@camille.atelier") }),
    ]);
  });

  it("signale une seule fois un branding sans profil", () => {
    const results = profileChecks([{ user_id: "u-1" }], [], ["u-1", "orphan-123456789", "orphan-123456789"]);
    expect(results).toEqual([expect.objectContaining({ status: "error", title: "Brand profile orphelin", detail: expect.stringContaining("orphan-1") })]);
  });
});
