# Contextual carousel review (2026-09-12)

Scope: generated text, mix and photo carousels in `carousel-ai`. Other generators retain the legacy correction contract. `assign_templates` (user-provided slides) exits before generation/review; do not introduce editorial rewriting there.

The generator no longer draws a compulsory caption ending in contextual mode. The brief is captured before branding fallback so fallback material is never labelled current authored text. Remaining examples/frameworks are subordinate to the current brief and editorial contract. Version `contextual-v2` also passes the current request, including tone and explicit limits, in a separate priority block to both review passes. An absent product-specific fact cannot be supplied by a general brand fact (e.g. having an online shop does not establish availability of the current object).

One source-aware review sees all registered visible fields and produces a forced tool response with explicit keep/edit decisions and local exact-match patches. Complete field coverage, unique excerpts, non-overlap, structural integrity and source quotations are validated atomically. The existing factual/numeric guards still run. Exact patch strings bypass typography sanitization (`keepDashes`). Photo template labels are assigned before review so newly added labels cannot escape it.

A second pass re-examines the current draft against its original generated baseline if the first made edits, was rejected/unavailable, or the lexical gate has findings. This uses the existing gate slot, not an unbounded loop. The baseline is comparison material, never a source of facts. No unconditional third review is introduced. Existing network retry/timeouts remain in effect, so two logical reviews are not necessarily two HTTP attempts.

`editorial_review` contains version, status (`reviewed`, `invalid`, `unavailable`, `rejected`), field count, edits in this pass, total edits and pass number. This is execution metadata, NOT an AI-detection score or a guarantee of editorial quality. The legacy `quality_check.score` remains heuristic. A failed review preserves recoverable prose; it is never relabelled as successful. No new user confirmation step, database schema or publication permission is introduced.

Emergency rollback: set the server-side `CAROUSEL_SEMANTIC_REVIEW=false` and redeploy `carousel-ai`. This restores the legacy correction route and caption-ending mechanism; no data migration is needed. Remove/set true to re-enable. The shared field registry now covers extra visible fields for the lexical guard in either mode.

## Validation

Run `npm run test:edges`, TypeScript checks and CI. The contextual-review tests cover malformed/truncated responses, coverage gaps, duplicate fields, invented paths, ambiguous/overlapping edits, quotes, required labels, unchanged structural fields, short drafts, factual guard rejection, and actual text/mix/photo handler wiring with mocked services.

`supabase/functions/_shared/fixtures/carousel-editorial-eval.json` is the initial eight-case synthetic editorial evaluation set. These expectations were authored for diagnosis, not independently user-labelled; do not report them as a production success rate. Includes slogans without negation and positive controls (humour, factual/methodological contrast, locked quote), plus full sequences. Separate future unseen cases from prompt tuning and review both missed defects and unwanted changes to good prose.

The preliminary real-model experiment used `ai-text-action`, which differs from the production carousel model/system/parameters. Seven outputs obeyed the patch contract; one keep decision omitted the edits array and was rejected without changing the humour. Both sequence clichés were removed in that diagnostic. Production uses a forced tool schema rather than this diagnostic route's plain-text response. Verify actual `carousel-ai` responses after deployment, including review status, all variants and supplied slides; retain failures as evidence. No promise of zero slop.

The first live v1 replay returned reviewed metadata for text/mix/photo and preserved user-supplied slides, but retained generic prose and an unsupported shop-availability claim. That result motivated v2's explicit separation of the current brief from background reference data; execution success must not be confused with complete editorial success. Keep measuring both residual defects and unwanted changes after deployment.

Version `contextual-v2.1` normalizes omitted empty edits/reason only for explicit keep decisions (no text mutation), aligns input/output identifiers, and reads schema prose nested in `data`. Unknown/duplicate fields, missing edit instructions and unsafe patches still reject the review. Live v2 had one contract rejection; the earlier diagnostic had specifically observed a keep decision without its empty edits array. These are transport checks, not proof of semantic quality.
