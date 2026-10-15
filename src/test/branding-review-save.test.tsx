import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/* Écritures de la relecture de marque (fiche 14 de docs/robustesse/gros-fichiers.md,
   lot T, 15/10/2026). BrandingReview écrit lui-même dans 7 tables ; ce filet
   verrouille, section par section, les 4 cas qui ont déjà cassé :
   - pas de ligne → insertion dans le bon espace ;
   - ligne aux champs vides → complétée ;
   - ligne remplie → intacte (on n'écrase jamais une saisie) ;
   - reprise d'onboarding confirmée (`allow_overwrite`) → remplacée.
   Plus la portée : espace = id de l'utilisatrice → filtre `user_id` ;
   espace distinct → filtre `workspace_id`. Ici on passe par « Je valide tout » ;
   quand les écritures sortiront du composant (lot 2), le test appellera les
   fonctions directement. */

const m = vi.hoisted(() => {
  const db: Record<string, any[]> = {};
  const reads: { table: string; filters: [string, any][] }[] = [];
  const writes: { table: string; op: string; payload: any }[] = [];
  const state = { workspace: "w1", user: "u1" };
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
  const from = vi.fn((table: string) => {
    let op = "read", payload: any, limit = Infinity, single = false;
    const filters: [string, any][] = [], orders: [string, boolean][] = [];
    const result = () => {
      let rows = (db[table] || []).filter(row => filters.every(([k, v]) => (row[k] ?? null) === v));
      for (const [key, asc] of [...orders].reverse()) rows.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (asc ? 1 : -1));
      rows = rows.slice(0, limit);
      if (op === "read") reads.push({ table, filters: [...filters] });
      // Comme PostgREST : une mise à jour vide n'écrit rien et ne renvoie aucune ligne.
      if (op === "update" && payload && typeof payload === "object" && Object.keys(payload).length === 0) rows = [];
      if (op === "update") { writes.push({ table, op, payload }); rows.forEach(row => Object.assign(row, payload)); }
      if (op === "insert") {
        writes.push({ table, op, payload });
        rows = (Array.isArray(payload) ? payload : [payload]).map((row, i) => ({ id: `new-${table}-${(db[table] || []).length + i}`, ...row }));
        db[table] = [...(db[table] || []), ...rows];
      }
      if (single && rows.length > 1) return { data: null, error: { message: "Multiple rows" } };
      return { data: single ? rows[0] || null : structuredClone(rows), error: null };
    };
    const q: any = {
      is: (k: string, v: any) => { filters.push([k, v]); return q; },
      select: () => q, eq: (k: string, v: any) => { filters.push([k, v]); return q; },
      order: (k: string, opts: any) => { orders.push([k, opts.ascending]); return q; },
      limit: (n: number) => { limit = n; return q; },
      maybeSingle: () => { single = true; return q; }, single: () => { single = true; return q; },
      update: (v: any) => { op = "update"; payload = v; return q; },
      insert: (v: any) => { op = "insert"; payload = v; return q; },
      then: (resolve: any, reject: any) => Promise.resolve().then(result).then(resolve, reject),
    };
    return q;
  });
  return { db, reads, writes, state, toast, from };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: m.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: m.state.user } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => m.state.workspace }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/lib/posthog-lazy", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/components/Confetti", () => ({ default: () => null }));
vi.mock("@/components/branding/BrandingCoachingFlow", () => ({ default: () => null }));
vi.mock("@/components/branding/BrandLogoSuggestion", () => ({ BrandLogoSuggestion: () => null }));
vi.mock("@/components/photos/BrandPhotosPicker", () => ({ BrandPhotosPicker: () => null }));
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => ({ children }: any) => <div>{children}</div> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import BrandingReview, { type AnalysisResult } from "@/components/branding/BrandingReview";
import { SAVE_FNS, QUERY_KEYS } from "@/lib/branding-review-save";

const row = (id: string, fields: any = {}) => ({ id, user_id: "u1", workspace_id: "w1", ...fields });

async function validateAll(analysis: AnalysisResult) {
  render(<BrandingReview analysis={analysis} onDone={() => {}} />);
  fireEvent.click(screen.getAllByText("Je valide tout")[0]);
  await screen.findByText("Fiche validée ! 🎉");
  expect(m.toast.error).not.toHaveBeenCalled();
}

beforeEach(() => {
  Object.keys(m.db).forEach(key => delete m.db[key]);
  m.reads.length = 0; m.writes.length = 0;
  m.state.workspace = "w1"; m.state.user = "u1";
  vi.clearAllMocks();
});

type SectionCase = {
  key: keyof AnalysisResult;
  table: string;
  data: any;
  inserted: Record<string, any>;
  emptyRow: Record<string, any>;
  completed: Record<string, any>;
  filledRow: Record<string, any>;
  overwritten: Record<string, any>;
};

const CASES: SectionCase[] = [
  {
    key: "story", table: "storytelling",
    data: { origin: "Origine IA", full_story: "Histoire IA" },
    inserted: { step_1_raw: "Origine IA", step_6_full_story: "Histoire IA", is_primary: true, source: "autofill", story_type: "fondatrice" },
    emptyRow: { step_1_raw: "", step_6_full_story: null },
    completed: { step_1_raw: "Origine IA", step_6_full_story: "Histoire IA" },
    filledRow: { step_1_raw: "Mon origine", step_6_full_story: "Mon histoire" },
    // L'histoire n'est jamais écrasée : la version validée va dans step_7_polished.
    overwritten: { step_1_raw: "Mon origine", step_6_full_story: "Mon histoire", step_7_polished: "Histoire IA" },
  },
  {
    key: "persona", table: "persona",
    data: { description: "Cible IA", frustrations: ["Manque de temps", "Peur de vendre"] },
    inserted: { description: "Cible IA", step_1_frustrations: "Manque de temps\nPeur de vendre", is_primary: true },
    emptyRow: { description: "", step_1_frustrations: null },
    completed: { description: "Cible IA", step_1_frustrations: "Manque de temps\nPeur de vendre" },
    filledRow: { description: "Ma cible", step_1_frustrations: "Mes freins" },
    overwritten: { description: "Cible IA", step_1_frustrations: "Manque de temps\nPeur de vendre" },
  },
  {
    key: "value_proposition", table: "brand_proposition",
    data: { key_phrase: "Phrase IA", proofs: ["Avis 1"] },
    inserted: { step_1_what: "Phrase IA", version_one_liner: "Phrase IA", version_final: "Phrase IA", step_2c_feedback: "Avis 1" },
    emptyRow: { step_1_what: "", version_one_liner: "", version_final: null, step_2c_feedback: null },
    completed: { step_1_what: "Phrase IA", version_one_liner: "Phrase IA", version_final: "Phrase IA", step_2c_feedback: "Avis 1" },
    filledRow: { step_1_what: "Mon activité", version_one_liner: "Ma phrase", version_final: "Ma référence", step_2c_feedback: "Mes preuves" },
    // version_one_liner déjà rédigée n'est jamais remplacée, même en reprise.
    overwritten: { step_1_what: "Phrase IA", version_one_liner: "Ma phrase", version_final: "Phrase IA", step_2c_feedback: "Avis 1" },
  },
  {
    key: "tone_style", table: "brand_profile",
    data: { voice_description: "Voix IA", tone_keywords: ["franche"] },
    inserted: { voice_description: "Voix IA", tone_keywords: ["franche"] },
    emptyRow: { voice_description: "", tone_keywords: [] },
    completed: { voice_description: "Voix IA", tone_keywords: ["franche"] },
    filledRow: { voice_description: "Ma voix", tone_keywords: ["douce"] },
    overwritten: { voice_description: "Voix IA", tone_keywords: ["franche"] },
  },
  {
    key: "content_strategy", table: "brand_strategy",
    data: { pillars: ["Coulisses", "Décryptage"] },
    inserted: { pillar_major: "Coulisses", pillar_minor_1: "Décryptage" },
    emptyRow: { pillar_major: "", pillar_minor_1: null },
    completed: { pillar_major: "Coulisses", pillar_minor_1: "Décryptage" },
    filledRow: { pillar_major: "Mon pilier", pillar_minor_1: "Mon deuxième" },
    overwritten: { pillar_major: "Coulisses", pillar_minor_1: "Décryptage" },
  },
  {
    key: "charter", table: "brand_charter",
    data: { confidence: "high", color_primary: "#112233", font_title: "Lora" },
    inserted: {
      color_primary: "#112233", font_title: "Lora",
      visual_evidence: { color_primary: expect.objectContaining({ source: "diagnostic", confidence: "high" }), font_title: expect.objectContaining({ source: "diagnostic" }) },
    },
    emptyRow: { color_primary: null, font_title: "" },
    completed: { color_primary: "#112233", font_title: "Lora", visual_evidence: expect.objectContaining({ color_primary: expect.any(Object) }) },
    filledRow: { color_primary: "#000000", font_title: "Ma typo" },
    overwritten: { color_primary: "#112233", font_title: "Lora" },
  },
];

describe("BrandingReview — écritures par section", () => {
  for (const c of CASES) {
    describe(c.key, () => {
      it("pas de ligne → insertion dans l'espace actif", async () => {
        await validateAll({ [c.key]: c.data });
        expect(m.db[c.table]).toHaveLength(1);
        expect(m.db[c.table][0]).toMatchObject({ ...c.inserted, user_id: "u1", workspace_id: "w1" });
      });

      it("ligne aux champs vides → complétée, sans nouvelle ligne", async () => {
        m.db[c.table] = [row("existant", { is_primary: true, ...c.emptyRow })];
        await validateAll({ [c.key]: c.data });
        expect(m.db[c.table]).toHaveLength(1);
        expect(m.db[c.table][0]).toMatchObject({ id: "existant", ...c.completed });
      });

      it("ligne remplie → intacte", async () => {
        m.db[c.table] = [row("existant", { is_primary: true, ...c.filledRow })];
        const before = structuredClone(m.db[c.table]);
        await validateAll({ [c.key]: c.data });
        expect(m.db[c.table]).toEqual(before);
      });

      it("reprise d'onboarding confirmée (allow_overwrite) → remplacée", async () => {
        m.db[c.table] = [row("existant", { is_primary: true, ...c.filledRow })];
        await validateAll({ [c.key]: c.data, allow_overwrite: true });
        expect(m.db[c.table]).toHaveLength(1);
        expect(m.db[c.table][0]).toMatchObject({ id: "existant", ...c.overwritten });
      });
    });
  }

  it("offres : insérées en une écriture, à côté d'une offre existante d'un autre nom", async () => {
    m.db.offers = [row("o1", { name: "Atelier" })];
    await validateAll({ offers: { offers: [{ name: "Cours", price: "40 €", description: "Un cours", target: "Débutantes", promise: "Oser" }] } });
    expect(m.db.offers).toHaveLength(2);
    expect(m.db.offers[1]).toMatchObject({ name: "Cours", offer_type: "paid", price_text: "40 €", description_short: "Un cours", target_ideal: "Débutantes", promise: "Oser", workspace_id: "w1" });
    expect(m.writes.filter(w => w.table === "offers")).toHaveLength(1);
  });

  it("client·e idéal·e : âge et métier rangés dans portrait.qui_elle_est (insertion)", async () => {
    await validateAll({ persona: { age_range: "25-35 ans", job: "Céramiste", description: "Cible" } });
    expect(m.db.persona[0].portrait).toEqual({ qui_elle_est: { age: "25-35 ans", metier: "Céramiste" } });
    expect(m.db.persona[0]).not.toHaveProperty("portrait_age");
  });

  it("client·e idéal·e : âge existant gardé, métier ajouté, reste du portrait conservé", async () => {
    m.db.persona = [row("p1", { is_primary: true, description: "Ma cible", portrait: { qui_elle_est: { age: "30 ans" }, autre: { garde: true } } })];
    await validateAll({ persona: { age_range: "25-35 ans", job: "Céramiste", description: "Cible IA" } });
    expect(m.db.persona[0]).toMatchObject({ description: "Ma cible", portrait: { qui_elle_est: { age: "30 ans", metier: "Céramiste" }, autre: { garde: true } } });
  });

  it("synthèse brand_profile : vision → mission, cible → target_description, proposition → problème, différence, offre", async () => {
    await validateAll({
      story: { vision: "Ma vision IA" },
      persona: { description: "Cible IA" },
      value_proposition: { problem: "Problème IA", differentiator: "Différence IA", solution: "Solution IA" },
    });
    expect(m.db.brand_profile).toHaveLength(1);
    expect(m.db.brand_profile[0]).toMatchObject({
      workspace_id: "w1",
      mission: "Ma vision IA",
      target_description: "Cible IA",
      target_problem: "Problème IA",
      value_prop_problem: "Problème IA",
      value_prop_difference: "Différence IA",
      offer: "Solution IA",
    });
  });

  it("synthèse brand_profile : ne remplace pas une mission déjà écrite, sauf reprise confirmée", async () => {
    m.db.brand_profile = [row("bp", { mission: "Ma mission" })];
    await validateAll({ story: { vision: "Vision IA" } });
    expect(m.db.brand_profile[0].mission).toBe("Ma mission");
  });

  it("synthèse brand_profile : reprise confirmée → mission remplacée", async () => {
    m.db.brand_profile = [row("bp", { mission: "Ma mission" })];
    await validateAll({ story: { vision: "Vision IA" }, allow_overwrite: true });
    expect(m.db.brand_profile[0].mission).toBe("Vision IA");
  });
});

const FULL: AnalysisResult = {
  story: { full_story: "Histoire" },
  persona: { description: "Cible" },
  value_proposition: { key_phrase: "Phrase", problem: "Problème" },
  tone_style: { voice_description: "Voix" },
  content_strategy: { pillars: ["Pilier"], editorial_line: "Ligne" },
  offers: { offers: [{ name: "Offre" }] },
  charter: { color_primary: "#123456" },
};

describe("BrandingReview — portée des lectures et écritures", () => {
  it("espace = id de l'utilisatrice → lectures filtrées sur user_id, insertions sans workspace_id", async () => {
    m.state.workspace = "u1";
    await validateAll(FULL);
    expect(m.reads.length).toBeGreaterThan(0);
    for (const r of m.reads) {
      expect(r.filters).toContainEqual(["user_id", "u1"]);
      expect(r.filters).toContainEqual(["workspace_id", null]);
    }
    const inserts = m.writes.filter(w => w.op === "insert");
    expect(new Set(inserts.map(w => w.table))).toEqual(new Set(["storytelling", "persona", "brand_proposition", "brand_profile", "brand_strategy", "offers", "brand_charter"]));
    for (const w of inserts) for (const p of [].concat(w.payload)) expect(p).toMatchObject({ user_id: "u1", workspace_id: null });
  });

  it("espace distinct → lectures filtrées sur workspace_id, insertions avec workspace_id", async () => {
    m.state.workspace = "w1";
    await validateAll(FULL);
    expect(m.reads.length).toBeGreaterThan(0);
    for (const r of m.reads) {
      expect(r.filters).toContainEqual(["workspace_id", "w1"]);
      expect(r.filters.some(([k]) => k === "user_id")).toBe(false);
    }
    const inserts = m.writes.filter(w => w.op === "insert");
    for (const w of inserts) for (const p of [].concat(w.payload)) expect(p).toMatchObject({ user_id: "u1", workspace_id: "w1" });
  });

  // Constat du lot T, corrigé à l'étape 7 (helper reviewScope) : en compte
  // personnel, toutes les lectures, tables à fiche unique comprises, filtrent
  // aussi `workspace_id is null` ; une ligne d'un autre espace n'est jamais touchée.
  it("espace = id de l'utilisatrice : l'histoire d'un autre espace n'est ni lue ni modifiée", async () => {
    m.state.workspace = "u1";
    m.db.storytelling = [row("autre-espace", { workspace_id: "w9", is_primary: true, step_6_full_story: null })];
    const before = structuredClone(m.db.storytelling[0]);
    await validateAll({ story: { full_story: "Histoire IA" } });
    expect(m.db.storytelling[0]).toEqual(before);
    expect(m.db.storytelling[1]).toMatchObject({ user_id: "u1", workspace_id: null, step_6_full_story: "Histoire IA" });
  });

  it("espace = id de l'utilisatrice : charte, profil, proposition et stratégie d'un autre espace ne sont ni lus ni modifiés", async () => {
    m.state.workspace = "u1";
    m.db.brand_charter = [row("charte-w9", { workspace_id: "w9", color_primary: null })];
    m.db.brand_profile = [row("profil-w9", { workspace_id: "w9", voice_description: null, content_editorial_line: null })];
    m.db.brand_proposition = [row("prop-w9", { workspace_id: "w9", step_1_what: null })];
    m.db.brand_strategy = [row("strat-w9", { workspace_id: "w9", pillar_major: null, updated_at: "2026-01-01" })];
    const before = structuredClone({ c: m.db.brand_charter[0], p: m.db.brand_profile[0], v: m.db.brand_proposition[0], s: m.db.brand_strategy[0] });
    await validateAll({
      value_proposition: { key_phrase: "Phrase" },
      tone_style: { voice_description: "Voix" },
      content_strategy: { pillars: ["Pilier"], editorial_line: "Ligne" },
      charter: { color_primary: "#123456" },
    });
    expect({ c: m.db.brand_charter[0], p: m.db.brand_profile[0], v: m.db.brand_proposition[0], s: m.db.brand_strategy[0] }).toEqual(before);
    expect(m.db.brand_charter[1]).toMatchObject({ user_id: "u1", workspace_id: null, color_primary: "#123456" });
    expect(m.db.brand_strategy[1]).toMatchObject({ user_id: "u1", workspace_id: null, pillar_major: "Pilier" });
    expect(m.db.brand_profile.filter(r => r.workspace_id === null)).toHaveLength(1);
  });
});

// Lot 2 (15/10/2026) : les écritures vivent dans src/lib/branding-review-save.ts,
// appelables sans l'écran. Cas qui ne passent pas par « Je valide tout ».
describe("SAVE_FNS — appel direct", () => {
  it("donnée absente ou vide → aucune lecture ni écriture", async () => {
    for (const key of Object.keys(SAVE_FNS) as (keyof typeof SAVE_FNS)[]) {
      await SAVE_FNS[key](undefined, "u1", "w1");
    }
    await SAVE_FNS.offers({ offers: [] }, "u1", "w1");
    await SAVE_FNS.charter({ confidence: "high" }, "u1", "w1");
    expect(m.reads).toEqual([]);
    expect(m.writes).toEqual([]);
  });

  it("offre sans nom → erreur, rien d'écrit", async () => {
    await expect(SAVE_FNS.offers({ offers: [{ name: "  " }] }, "u1", "w1")).rejects.toThrow("Donne un nom à chaque offre");
    expect(m.writes).toEqual([]);
  });

  it("deux offres du même nom dans l'import → erreur avant toute écriture", async () => {
    await expect(SAVE_FNS.offers({ offers: [{ name: "Atelier" }, { name: "atelier " }] }, "u1", "w1")).rejects.toThrow("existe déjà");
    expect(m.writes).toEqual([]);
  });

  it("une mise à jour qui ne touche aucune ligne n'est pas un succès", async () => {
    m.db.brand_charter = [row("c1", { color_primary: null })];
    // La ligne disparaît entre la lecture et l'écriture (supprimée ailleurs).
    const realFrom = m.from.getMockImplementation()!;
    let calls = 0;
    m.from.mockImplementation((table: string) => {
      if (table === "brand_charter" && ++calls === 2) m.db.brand_charter = [];
      return realFrom(table);
    });
    try {
      await expect(SAVE_FNS.charter({ color_primary: "#123456" }, "u1", "w1")).rejects.toThrow("Aucune fiche enregistrée");
    } finally {
      m.from.mockImplementation(realFrom);
    }
  });

  it("QUERY_KEYS : chaque section rafraîchit au moins un cache", () => {
    expect(Object.keys(QUERY_KEYS).sort()).toEqual(Object.keys(SAVE_FNS).sort());
    for (const keys of Object.values(QUERY_KEYS)) expect(keys.length).toBeGreaterThan(0);
  });
});
