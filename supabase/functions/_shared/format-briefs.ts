// Format-specific depth mandates for the `generate` step.
// Extracted verbatim from index.ts to keep prompt quality identical.
// Each function returns the exact same string literal that was previously inlined.
//
// Sommaire (découpage du 14/10/2026, docs/robustesse/gros-fichiers.md fiche 10) :
// chaque format a son fichier dans _shared/format-briefs/, ce fichier les
// réexporte pour que les imports existants (creative-flow, tests) ne changent
// pas. Pour retoucher un brief, modifie SON fichier. format-briefs/common.ts
// reste interne (non réexporté).
export * from "./format-briefs/carousel.ts";
export * from "./format-briefs/pinterest.ts";
export * from "./format-briefs/newsletter.ts";
export * from "./format-briefs/position.ts";
export * from "./format-briefs/photo-caption.ts";
export * from "./format-briefs/caption.ts";
export * from "./format-briefs/linkedin.ts";
export * from "./format-briefs/reel.ts";
export * from "./format-briefs/stories.ts";
