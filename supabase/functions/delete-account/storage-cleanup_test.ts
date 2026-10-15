import { assert, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertAllowedPrefix, cleanupUserStorage } from "./storage-cleanup.ts";

const ME = "user-1";
const MY_SPACE = "space-mine";
const HER_SPACE = "space-other";

type Rows = Record<string, any[]>;
const folder = (name: string) => ({ name, id: null, metadata: null });
const file = (name: string) => ({ name, id: `id-${name}`, metadata: {} });

// Faux client : enregistre TOUS les appels (listes, suppressions, requêtes),
// pas seulement le dernier.
function fakeAdmin(opts: { files?: Record<string, Record<string, any[]>>; rows?: Rows; fail?: "list" | "remove" | "rows" } = {}) {
  const calls = { lists: [] as string[], removed: [] as string[], queries: [] as string[] };
  const files = opts.files ?? {};
  const rows: Rows = { workspaces: [], visual_studio_sessions: [], studio_video_jobs: [], visual_studio_versions: [], ...opts.rows };
  const admin = {
    storage: {
      listBuckets: async () => ({ data: Object.keys(files).map((id) => ({ id })), error: null }),
      from: (bucket: string) => ({
        list: async (prefix: string, o: { offset: number; limit: number }) => {
          calls.lists.push(`${bucket}:${prefix}`);
          if (opts.fail === "list") return { data: null, error: { message: "network failure" } };
          return { data: (files[bucket]?.[prefix] ?? []).slice(o.offset, o.offset + o.limit), error: null };
        },
        remove: async (paths: string[]) => {
          calls.removed.push(...paths.map((p) => `${bucket}:${p}`));
          return { error: opts.fail === "remove" ? { message: "denied" } : null };
        },
      }),
    },
    from: (table: string) => {
      const filters: string[] = [];
      const q: any = {
        select: () => q,
        eq: (c: string, v: string) => (filters.push(`${c}=${v}`), q),
        order: () => q,
        range: async (start: number, end: number) => {
          calls.queries.push(`${table}?${filters.join("&")}`);
          if (opts.fail === "rows") return { data: null, error: { message: "offline" } };
          return { data: (rows[table] ?? []).slice(start, end + 1), error: null };
        },
      };
      return q;
    },
  };
  return { admin, calls };
}

Deno.test("effacement : photos, sous-dossiers et plus de 100 objets, uniquement chez la propriétaire", async () => {
  const f = fakeAdmin({ files: {
    "user-photos": { [ME]: [folder("reel-videos"), ...Array.from({ length: 120 }, (_, i) => file(`p${i}.jpg`))], [`${ME}/reel-videos`]: [file("reel.mp4")] },
    "calendar-media": { [ME]: [file("a.jpg")] },
  } });
  assertEquals(await cleanupUserStorage(f.admin, ME), 122);
  assert(f.calls.removed.includes(`user-photos:${ME}/reel-videos/reel.mp4`));
  assert(f.calls.removed.includes(`user-photos:${ME}/p119.jpg`));
  assert(f.calls.removed.includes(`calendar-media:${ME}/a.jpg`));
  // Aucun autre dossier qu'elle n'est ouvert hors buckets traités à part.
  for (const l of f.calls.lists.filter((x) => x.startsWith("user-photos:") || x.startsWith("calendar-media:"))) {
    const prefix = l.split(":")[1];
    assert(prefix === ME || prefix.startsWith(`${ME}/`), l);
  }
});

for (const phase of ["list", "remove", "rows"] as const) {
  Deno.test(`effacement : erreur ${phase} remontée, jamais un faux succès`, async () => {
    const f = fakeAdmin({ fail: phase, files: { "user-photos": { [ME]: [file("a.jpg")] } } });
    await assertRejects(() => cleanupUserStorage(f.admin, ME));
    if (phase !== "remove") assertEquals(f.calls.removed, [], "rien n'est effacé si l'inventaire échoue");
  });
}

Deno.test("Studio, vidéos, crosspost : tout l'espace dont elle est propriétaire, seulement SES dossiers chez une autre", async () => {
  const f = fakeAdmin({
    rows: {
      workspaces: [{ id: MY_SPACE }],
      visual_studio_sessions: [{ id: "s-mine", workspace_id: MY_SPACE }, { id: "s-there", workspace_id: HER_SPACE }],
      studio_video_jobs: [{ id: "j-mine", workspace_id: MY_SPACE }, { id: "j-there", workspace_id: HER_SPACE }],
      visual_studio_versions: [{ result_path: `${HER_SPACE}/s-hers/v-mine` }],
    },
    files: {
      "visual-studio": {
        [MY_SPACE]: [folder("s-mine"), folder("s-colleague")],
        [`${MY_SPACE}/s-mine`]: [file("original"), file("reference-1"), file("reference-1.fidelity.jpg"), file("reference-1.fidelity.json"), file("v1"), file("v1.refine-lock")],
        [`${MY_SPACE}/s-colleague`]: [file("original")],
        [`${HER_SPACE}/s-there`]: [file("original"), file("v2")],
        [HER_SPACE]: [folder("s-there"), folder("s-hers")],
      },
      "studio-video": {
        [MY_SPACE]: [folder("j-mine")],
        [`${MY_SPACE}/j-mine`]: [file("clip.mp4")],
        [`${HER_SPACE}/j-there`]: [file("clip.mp4")],
        [HER_SPACE]: [folder("j-hers")],
      },
      "crosspost-sources": {
        [`workspace/${MY_SPACE}`]: [file("a.pdf")],
        [`user/${ME}`]: [file("b.jpg")],
        [`workspace/${HER_SPACE}`]: [file("c.jpg")],
      },
    },
  });
  await cleanupUserStorage(f.admin, ME);
  const removed = new Set(f.calls.removed);
  for (const p of [
    `visual-studio:${MY_SPACE}/s-mine/original`,
    `visual-studio:${MY_SPACE}/s-mine/reference-1`,
    `visual-studio:${MY_SPACE}/s-mine/reference-1.fidelity.jpg`,
    `visual-studio:${MY_SPACE}/s-mine/reference-1.fidelity.json`,
    `visual-studio:${MY_SPACE}/s-mine/v1.refine-lock`,
    `visual-studio:${MY_SPACE}/s-colleague/original`,
    `visual-studio:${HER_SPACE}/s-there/original`,
    `visual-studio:${HER_SPACE}/s-there/v2`,
    `visual-studio:${HER_SPACE}/s-hers/v-mine`,
    `visual-studio:${HER_SPACE}/s-hers/v-mine.refine-lock`,
    `studio-video:${MY_SPACE}/j-mine/clip.mp4`,
    `studio-video:${HER_SPACE}/j-there/clip.mp4`,
    `crosspost-sources:workspace/${MY_SPACE}/a.pdf`,
    `crosspost-sources:user/${ME}/b.jpg`,
  ]) assert(removed.has(p), `${p} doit être effacé`);
  // Garde-fou : l'espace d'une autre n'est jamais listé ni vidé en entier.
  assert(!f.calls.lists.includes(`visual-studio:${HER_SPACE}`));
  assert(!f.calls.lists.includes(`studio-video:${HER_SPACE}`));
  assert(!f.calls.lists.includes(`crosspost-sources:workspace/${HER_SPACE}`));
  assert(!removed.has(`crosspost-sources:workspace/${HER_SPACE}/c.jpg`));
  // Inventaire fait sur SES lignes (propriété = created_by, auteur = user_id).
  assert(f.calls.queries.includes(`workspaces?created_by=${ME}`));
  for (const t of ["visual_studio_sessions", "studio_video_jobs", "visual_studio_versions"]) {
    assert(f.calls.queries.includes(`${t}?user_id=${ME}`), t);
  }
});

Deno.test("garde-fou : un dossier d'espace qui n'est pas à elle est refusé", () => {
  const owned = new Set([MY_SPACE]);
  assertAllowedPrefix(MY_SPACE, ME, owned);
  assertAllowedPrefix(`workspace/${MY_SPACE}`, ME, owned);
  assertAllowedPrefix(`user/${ME}`, ME, owned);
  assertAllowedPrefix(`${HER_SPACE}/session-1`, ME, owned);
  assertThrows(() => assertAllowedPrefix(HER_SPACE, ME, owned));
  assertThrows(() => assertAllowedPrefix(`workspace/${HER_SPACE}`, ME, owned));
  assertThrows(() => assertAllowedPrefix("user/someone-else", ME, owned));
  assertThrows(() => assertAllowedPrefix("", ME, owned));
});
