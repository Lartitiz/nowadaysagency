import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  countCarouselSlides,
  maxStructurePhotoIndex,
  mergeConfirmedStructure,
  normalizePhotoIndexes,
} from "./photo-slide-structure.ts";

const wrap = (slides: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ carousel_type: "photo", slides, caption: { hook: "h" }, ...extra });

const parse = (content: string) => JSON.parse(content.match(/\{[\s\S]*\}/)![0]);

// ── countCarouselSlides ──

Deno.test("countCarouselSlides compte les slides, 0 si illisible", () => {
  assertEquals(countCarouselSlides(wrap([{ slide_number: 1 }, { slide_number: 2 }])), 2);
  assertEquals(countCarouselSlides("pas du json"), 0);
  assertEquals(countCarouselSlides(""), 0);
});

// ── maxStructurePhotoIndex ──

Deno.test("maxStructurePhotoIndex prend le plus grand index entier", () => {
  assertEquals(maxStructurePhotoIndex([{ photo_index: 1 }, { photo_index: 4 }, { photo_index: null }]), 4);
  assertEquals(maxStructurePhotoIndex([]), 0);
  assertEquals(maxStructurePhotoIndex(undefined), 0);
});

// ── mergeConfirmedStructure ──

const STRUCTURE = [
  { slide_number: 1, role: "hook", slide_type: "photo_full", photo_index: 1 },
  { slide_number: 2, role: "process", slide_type: "photo_full", photo_index: 1 },
  { slide_number: 3, role: "detail", slide_type: "photo_full", photo_index: 2 },
  { slide_number: 4, role: "cta", slide_type: "text_only", photo_index: null },
];

Deno.test("merge : restaure photo_index et slide_type omis par le modèle (cas audit 12/07)", () => {
  const content = wrap([
    { slide_number: 1, overlay_text: "a", photo_index: null },
    { slide_number: 2, overlay_text: "b" },
    { slide_number: 3, overlay_text: "c", photo_index: null },
    { slide_number: 4, title: "CTA", body: "..." },
  ]);
  const out = parse(mergeConfirmedStructure(content, STRUCTURE));
  assertEquals(out.slides.map((s: any) => s.photo_index), [1, 1, 2, null]);
  assertEquals(out.slides.map((s: any) => s.slide_type), ["photo_full", "photo_full", "photo_full", "text_only"]);
});

Deno.test("merge : ne touche pas une assignation valide posée par le modèle", () => {
  const content = wrap([
    { slide_number: 1, slide_type: "photo_full", photo_index: 2 },
    { slide_number: 2, slide_type: "photo_integrated", photo_index: 1 },
  ]);
  const out = parse(mergeConfirmedStructure(content, STRUCTURE));
  assertEquals(out.slides.map((s: any) => s.photo_index), [2, 1]);
  assertEquals(out.slides[1].slide_type, "photo_integrated");
});

Deno.test("merge : une slide text_only ne garde jamais de photo_index", () => {
  const content = wrap([
    { slide_number: 4, slide_type: "text_only", photo_index: 3, title: "CTA" },
  ]);
  const out = parse(mergeConfirmedStructure(content, STRUCTURE));
  assertEquals(out.slides[0].photo_index, null);
});

Deno.test("merge : fallback par position quand les slide_number ne matchent pas", () => {
  const content = wrap([
    { slide_number: 10, overlay_text: "a" },
    { slide_number: 20, overlay_text: "b" },
  ]);
  const out = parse(mergeConfirmedStructure(content, STRUCTURE));
  assertEquals(out.slides[0].photo_index, 1);
  assertEquals(out.slides[1].photo_index, 1);
});

Deno.test("merge : sans structure ou contenu illisible → contenu inchangé", () => {
  const content = wrap([{ slide_number: 1 }]);
  assertEquals(mergeConfirmedStructure(content, []), content);
  assertEquals(mergeConfirmedStructure(content, undefined), content);
  assertEquals(mergeConfirmedStructure("pas du json", STRUCTURE), "pas du json");
});

Deno.test("merge : recopie role manquant, garde role existant", () => {
  const content = wrap([
    { slide_number: 1, overlay_text: "a" },
    { slide_number: 2, overlay_text: "b", role: "emotion" },
  ]);
  const out = parse(mergeConfirmedStructure(content, STRUCTURE));
  assertEquals(out.slides[0].role, "hook");
  assertEquals(out.slides[1].role, "emotion");
});

// ── normalizePhotoIndexes ──

Deno.test("normalize photo pur : slides SANS slide_type traitées comme photo (trou audit 12/07)", () => {
  const content = wrap([
    { slide_number: 1, overlay_text: "a", photo_index: null },
    { slide_number: 2, overlay_text: "b", photo_index: null },
    { slide_number: 3, overlay_text: "c", photo_index: null },
  ]);
  const out = parse(normalizePhotoIndexes(content, 3, { assumePhotoWhenTypeMissing: true }));
  assertEquals(out.slides.map((s: any) => s.photo_index), [1, 2, 3]);
});

Deno.test("normalize : sans assumePhotoWhenTypeMissing, comportement historique (slides sans type ignorées)", () => {
  const content = wrap([
    { slide_number: 1, overlay_text: "a", photo_index: null },
    { slide_number: 2, overlay_text: "b", photo_index: null },
  ]);
  const out = parse(normalizePhotoIndexes(content, 2));
  assertEquals(out.slides.map((s: any) => s.photo_index), [null, null]);
});

Deno.test("normalize : assignation valide avec répétitions voulues respectée", () => {
  const content = wrap([
    { slide_number: 1, slide_type: "photo_full", photo_index: 1 },
    { slide_number: 2, slide_type: "photo_full", photo_index: 1 },
    { slide_number: 3, slide_type: "photo_full", photo_index: 2 },
  ]);
  const out = parse(normalizePhotoIndexes(content, 2));
  assertEquals(out.slides.map((s: any) => s.photo_index), [1, 1, 2]);
});

Deno.test("normalize : dégénéré (tout sur la photo 1 avec 3 photos dispo) → séquentiel", () => {
  const content = wrap([
    { slide_number: 1, slide_type: "photo_full", photo_index: 1 },
    { slide_number: 2, slide_type: "photo_full", photo_index: 1 },
    { slide_number: 3, slide_type: "photo_full", photo_index: 1 },
  ]);
  const out = parse(normalizePhotoIndexes(content, 3));
  assertEquals(out.slides.map((s: any) => s.photo_index), [1, 2, 3]);
});

Deno.test("normalize : index hors range → séquentiel plafonné au photoCount", () => {
  const content = wrap([
    { slide_number: 1, slide_type: "photo_full", photo_index: 7 },
    { slide_number: 2, slide_type: "photo_full", photo_index: 8 },
    { slide_number: 3, slide_type: "photo_full", photo_index: 9 },
  ]);
  const out = parse(normalizePhotoIndexes(content, 2));
  assertEquals(out.slides.map((s: any) => s.photo_index), [1, 2, 2]);
});

Deno.test("normalize : text_only forcée à null, photoCount=0 → no-op", () => {
  const mixed = wrap([
    { slide_number: 1, slide_type: "photo_full", photo_index: 1 },
    { slide_number: 2, slide_type: "text_only", photo_index: 2, title: "t" },
  ]);
  const out = parse(normalizePhotoIndexes(mixed, 1));
  assertEquals(out.slides[1].photo_index, null);
  const content = wrap([{ slide_number: 1 }]);
  assertEquals(normalizePhotoIndexes(content, 0), content);
});

Deno.test("merge puis normalize : le chemin complet structure→sortie de l'audit", () => {
  // Reproduit S2 : structure 7 slides photo_index [1,1,2,3,3,4,4], sortie tout-null.
  const structure = [1, 1, 2, 3, 3, 4, 4].map((idx, i) => ({
    slide_number: i + 1, role: "r", slide_type: "photo_full", photo_index: idx,
  }));
  const content = wrap(structure.map((s) => ({ slide_number: s.slide_number, overlay_text: "x", photo_index: null })));
  let out = mergeConfirmedStructure(content, structure);
  out = normalizePhotoIndexes(out, 4, { assumePhotoWhenTypeMissing: true });
  assertEquals(parse(out).slides.map((s: any) => s.photo_index), [1, 1, 2, 3, 3, 4, 4]);
});
