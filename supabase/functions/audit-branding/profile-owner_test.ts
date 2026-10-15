import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readOwnerProfile } from "./profile-owner.ts";

function fakeSb(rows: Record<string, any>) {
  const calls: string[] = [];
  const sb = {
    from(table: string) {
      const q: any = {
        select: () => q,
        eq: (col: string, val: string) => { calls.push(`${table}.${col}=${val}`); return q; },
        maybeSingle: () => Promise.resolve(rows[table] ?? { data: null, error: null }),
      };
      return q;
    },
  };
  return { sb, calls };
}

Deno.test("espace : lit le profil de la propriétaire par user_id, jamais par workspace_id", async () => {
  const { sb, calls } = fakeSb({
    workspace_members: { data: { user_id: "owner-1" }, error: null },
    profiles: { data: { instagram_bio: "Bio" }, error: null },
  });
  assertEquals(await readOwnerProfile(sb, "manager-1", "ws-1", "instagram_bio"), { instagram_bio: "Bio" });
  assertEquals(calls, ["workspace_members.workspace_id=ws-1", "workspace_members.role=owner", "profiles.user_id=owner-1"]);
});

Deno.test("sans espace : lit le profil de la personne connectée", async () => {
  const { sb, calls } = fakeSb({ profiles: { data: { instagram_bio: "Moi" }, error: null } });
  assertEquals(await readOwnerProfile(sb, "user-1", null, "instagram_bio"), { instagram_bio: "Moi" });
  assertEquals(calls, ["profiles.user_id=user-1"]);
});

Deno.test("propriétaire introuvable : rend null sans lire le profil de quelqu'un d'autre", async () => {
  const { sb, calls } = fakeSb({ workspace_members: { data: null, error: null } });
  assertEquals(await readOwnerProfile(sb, "manager-1", "ws-1", "instagram_bio"), null);
  assertEquals(calls.some((c) => c.startsWith("profiles")), false);
});
