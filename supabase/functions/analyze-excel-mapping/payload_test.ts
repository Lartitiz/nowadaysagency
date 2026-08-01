import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { ExcelMappingSchema, MAX_HEADERS, MAX_SHEETS, normalizeSheets } from "./payload.ts";

const feuille = (over: Record<string, unknown> = {}) => ({
  name: "Suivi 2026",
  headers: ["Date", "Abonnés", "Portée"],
  sampleRows: [["01/01", "1200", "3400"]],
  ...over,
});

Deno.test("un corps sans `sheets` est REFUSÉ en nommant le champ (avant : 500 muet)", () => {
  const err = assertThrows(
    () => validateInput({}, ExcelMappingSchema),
    ValidationError,
  ) as ValidationError;
  assertEquals(err.message.includes("sheets"), true);
});

Deno.test("une liste de feuilles vide est refusée, pas envoyée à l'IA", () => {
  assertThrows(() => validateInput({ sheets: [] }, ExcelMappingSchema), ValidationError);
});

Deno.test("une feuille mal formée est refusée", () => {
  assertThrows(() => validateInput({ sheets: [{ name: "X" }] }, ExcelMappingSchema), ValidationError);
  assertThrows(
    () => validateInput({ sheets: [{ name: 42, headers: [] }] }, ExcelMappingSchema),
    ValidationError,
  );
});

Deno.test("un classeur normal passe intact", () => {
  const parsed = validateInput({ sheets: [feuille()] }, ExcelMappingSchema);
  const { sheets, truncated } = normalizeSheets(parsed.sheets);
  assertEquals(truncated, false);
  assertEquals(sheets[0].headers, ["Date", "Abonnés", "Portée"]);
  assertEquals(sheets[0].sampleRows.length, 1);
});

Deno.test("une feuille sans données passe sans casser (headers vides)", () => {
  const parsed = validateInput(
    { sheets: [feuille({ headers: [], sampleRows: [] })] },
    ExcelMappingSchema,
  );
  const { sheets } = normalizeSheets(parsed.sheets);
  assertEquals(sheets[0].headers, []);
  assertEquals(sheets[0].sampleRows, []);
});

Deno.test("des en-têtes vides (null) restent acceptés", () => {
  const parsed = validateInput(
    { sheets: [feuille({ headers: ["Date", null, "Portée"] })] },
    ExcelMappingSchema,
  );
  const { sheets } = normalizeSheets(parsed.sheets);
  assertEquals(sheets[0].headers, ["Date", null, "Portée"]);
});

Deno.test("un gros classeur est TRONQUÉ, pas refusé (l'import doit rester possible)", () => {
  const gros = {
    sheets: Array.from({ length: MAX_SHEETS + 5 }, (_, i) =>
      feuille({
        name: `Feuille ${i}`,
        headers: Array.from({ length: MAX_HEADERS + 30 }, (_, j) => `col${j}`),
      })),
  };
  const parsed = validateInput(gros, ExcelMappingSchema);
  const { sheets, truncated } = normalizeSheets(parsed.sheets);
  assertEquals(truncated, true);
  assertEquals(sheets.length, MAX_SHEETS);
  assertEquals(sheets[0].headers.length, MAX_HEADERS);
});

Deno.test("les cellules très longues sont coupées (budget de tokens)", () => {
  const parsed = validateInput(
    { sheets: [feuille({ headers: ["x".repeat(300)] })] },
    ExcelMappingSchema,
  );
  const { sheets } = normalizeSheets(parsed.sheets);
  assertEquals(sheets[0].headers[0]!.length, 120);
});

Deno.test("plus de 3 lignes d'exemple : on en garde 3 et on le signale", () => {
  const parsed = validateInput(
    { sheets: [feuille({ sampleRows: [["a"], ["b"], ["c"], ["d"], ["e"]] })] },
    ExcelMappingSchema,
  );
  const { sheets, truncated } = normalizeSheets(parsed.sheets);
  assertEquals(sheets[0].sampleRows.length, 3);
  assertEquals(truncated, true);
});
