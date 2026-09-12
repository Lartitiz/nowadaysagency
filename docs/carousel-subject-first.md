# Subject-first carousel writing

This release replaces the carousel-only generation policy and photo/mix prose prompts. It does not change other generators' shared copywriting constants, models, account quotas, layout/rendering code or stored documents. The contextual-v2.1 exact-patch reviewer remains unchanged for the first comparison, isolating the generation change.

The content policy accepts descriptive, practical, analytical and narrative progression; reversals, metaphors, confessions and a final CTA are conditional on the material. Existing editorial modes remain available, with guides that no longer require invented scenes, numbers, testimonies or universal lessons. Current source limitations, voice, quotations and useful contrasts remain important. Visual schema types, photo mismatch rules, confirmed structures, source entry paths and text-first image casting remain supported. User-supplied slides still bypass writing and editorial review.

`writing_version` identifies `subject-first-calibrated-v4.1`. The reviewer is `contextual-calibrated-v4`, using the existing `claude-opus-4-8` model for bounded exact-patch semantic review, with paired positive/negative editorial examples and a contribution test. The news route no longer appends a legacy mandate to generalize when facts are sparse. Generation still respects normal versus quality_max mode; other generators and their models are unchanged. This editorial model change was announced before acceptance testing. Review status remains execution metadata, never a quality certificate. The source-first-only candidate still produced slogans. The independent-copy/pairwise-selection experiment was also rejected: it preferred unsupported prose, adding latency without reliable benefit. That extra two-call architecture has been removed. The retained version keeps generation + at-most-two exact-patch reviews, with the existing timeout and factual/quote/layout guards. Supplied slides bypass writing/review.

## Acceptance route

`carousel-ai-candidate` used byte-identical copies of the handler and writing modules because hosting cannot resolve sibling-function imports. Parity tests protected the acceptance comparison. Those temporary copies are now removed; deploy the inert replacement after the primary release. It returns HTTP 410 (OPTIONS 204) and cannot generate, access user data or debit a quota. No frontend references it. Deploying this retired route does not deploy the primary function. The disabled endpoint remains explicit rather than leaving an unmaintained generation route live.

## Limits

Live synthetic tests showed improvements over the previous bundle, not elimination of all rhetorical filler or unsupported details. Preserve the complete before/after corpus and residual failures in the release report. Review metadata and regex scores must not be marketed as editorial certification. Existing drafts are not rewritten on deployment; generated prose remains editable and needs user review, especially for technical or legal claims. The independent evaluator idea was removed, not silently retained as extra cost. This release does not certify unrelated caption generators or other formats.

## Comparison

Use the same eight fictitious briefs twice per variant, same QA profile, model configuration and review pipeline. Four development cases cover product text/mix, a photo-supported method and visual-signalling analysis. Four additional cases cover humour, a useful technical contrast, a nuanced explanation and fictional news. No external current-news research is needed. Cases are synthetic and assessed by the development assistant, not independently human-labelled.

Assess generated visible text, unsupported claims, preservation of source details/voice/quotes, structure validity, latency and review failures. Compare outcomes on the same cases, not just edit counts or lexical scores. Keep unsuccessful outputs. Do not introduce the more expensive separate-draft/selection pipeline unless the simpler generation change is insufficient in the comparison. A winning development sample does not prove zero future slop.

Run Deno backend tests, Deno type checking, frontend CI and actual authenticated route tests before promoting. Revert/deploy the earlier known-good bundle if acceptance shows a regression; reverting only CAROUSEL_SEMANTIC_REVIEW affects the reviewer, not this writing-policy change.
