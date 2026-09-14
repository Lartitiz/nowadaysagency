# Calendar sharing contract (14 September 2026)

Deploy `20260914144500_calendar_share_contract.sql`, then the three `public-calendar*` edge functions, then the frontend. The write RPC is callable only by `service_role`; public callers present their token to the edge functions.

## Scope and compatibility

All reads/writes require an active, unexpired link, its owner and its channel filter. Workspace links require the same workspace. New links without a workspace expose only personal posts (`workspace_id IS NULL`). The migration marks **existing** workspace-less links `legacy_owner_scope=true`, retaining their existing owner-wide scope without reassigning posts. The owner list labels those historical links explicitly and includes them beside the current workspace links. Counters use each link's actual scope. Existing ownership/membership grants are retained; authenticated comment inserts gain an additional restrictive post/link scope check.

Comments remain available on every valid link, as before: there is no separate configurable comment permission. Status and wording permissions stay independent. Wording additionally requires `show_content_draft=true`. Validation/revision markers are comments, not social publication commands. Guest names are declarative and do not authenticate a person.

## Public fields

The calendar needs ID, theme, date, status, channel, format, phase and update timestamp for navigation/filtering. Column visibility is presentation for these fields, as the form now explains. `description` and `notes` explicitly authorize `objectif` and `notes` respectively. `show_content_draft=true` authorizes draft, hook and media; otherwise none of those fields is returned. Internal `angle` is not public. JSON drafts omit `_crosspost` provenance; legacy crosspost wrappers additionally omit source text/files, previous revisions and all-channel results. The chosen version/full text remains public, and editing restores omitted private fields unchanged before structural validation. Comments are restricted to the current link and the posts actually returned. No private data is deleted.

## Writes and recovery

The RPC locks the link and target post, verifies scope/rights/revocation/expiry, and commits the edit and audit comment together. A trace failure rolls back the edit. New clients provide `expected_updated_at`; a conflicting write is refused, while an already-applied identical value can be retried. Existing clients may omit that field.

Guest comments carry a UUID request ID, unique per link. Replaying the same effective author/post/content returns the existing comment; a different payload returns 409. Clients retain that request ID and comment draft in session storage until confirmation. Two deliberate comments with identical text remain separate after a confirmed send. An old client without a request ID retains its original behavior.

The public wording editor keeps the original draft representation. A structured JSON draft may only change editorial text leaves; keys, array order/length, IDs, media and non-text metadata must be preserved. Flattening or changing metadata returns 409 and leaves the draft in the editor. Other post columns, including `content_data`, are not rewritten. This is not a new structured editor or a promise that arbitrary historical schemas can be edited through the public textarea.

Owner replies require choosing the destination when multiple valid links apply. They reuse the same row UUID after an uncertain response. Existing comments keep their original share association, including historical/revoked links.

## Verification

- `psql -v ON_ERROR_STOP=1 -f supabase/tests/calendar-share.sql` on a disposable PostgreSQL database. Tests migration, legacy/personal/workspace/channel boundaries, permissions, structured data, stale writes, replay, expiry/revocation, RPC grants, owner/non-owner RLS, and rollback on log failure.
- Deno check on all three functions; typed `_shared/calendar-share_test.ts` tests scope/projection.
- Vitest handler and React component regressions under `src/test/*calendar*sharing*` and `shared-calendar-recovery.test.tsx`, plus `public-calendar-handlers.test.ts`.

Local fixtures and compilation do not prove a deployed function or an authenticated production journey. The coordinator records the published versions separately.
