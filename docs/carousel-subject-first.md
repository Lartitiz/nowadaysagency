# Subject-first carousel writing

This release replaces the carousel-only generation policy and photo/mix prose prompts. It does not change other generators' shared copywriting constants, models, account quotas, layout/rendering code or stored documents. The contextual-v2.1 exact-patch reviewer remains unchanged for the first comparison, isolating the generation change.

The content policy accepts descriptive, practical, analytical and narrative progression; reversals, metaphors, confessions and a final CTA are conditional on the material. Existing editorial modes remain available, with guides that no longer require invented scenes, numbers, testimonies or universal lessons. Current source limitations, voice, quotations and useful contrasts remain important. Visual schema types, photo mismatch rules, confirmed structures, source entry paths and text-first image casting remain supported. User-supplied slides still bypass writing and editorial review.

`writing_version` in the response identifies `subject-first-v1`; the review's version/status remains a separate execution marker, never a quality certificate. The selected generation model and review count are unchanged.

## Acceptance route

`carousel-ai-candidate` temporarily contains byte-identical copies of the handler and two writing modules for production-like acceptance. The host cannot resolve imports between sibling functions; parity tests enforce exact source equality. This temporary duplication must be removed after acceptance. It uses the identical authentication, workspace access, quota check and accounting path. It does not accept an arbitrary system prompt, impersonation, admin bypass or new credentials. No frontend references it. Deploy only this route initially; `carousel-ai` continues running its previously deployed bundle until separately deployed after acceptance. Retire the candidate after release.

## Comparison

Use the same eight fictitious briefs twice per variant, same QA profile, model configuration and review pipeline. Four development cases cover product text/mix, a photo-supported method and visual-signalling analysis. Four additional cases cover humour, a useful technical contrast, a nuanced explanation and fictional news. No external current-news research is needed. Cases are synthetic and assessed by the development assistant, not independently human-labelled.

Assess generated visible text, unsupported claims, preservation of source details/voice/quotes, structure validity, latency and review failures. Compare outcomes on the same cases, not just edit counts or lexical scores. Keep unsuccessful outputs. Do not introduce the more expensive separate-draft/selection pipeline unless the simpler generation change is insufficient in the comparison. A winning development sample does not prove zero future slop.

Run Deno backend tests, Deno type checking, frontend CI and actual authenticated route tests before promoting. Revert/deploy the earlier known-good bundle if acceptance shows a regression; reverting only CAROUSEL_SEMANTIC_REVIEW affects the reviewer, not this writing-policy change.
