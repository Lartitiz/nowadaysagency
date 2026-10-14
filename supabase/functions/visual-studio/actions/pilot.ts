// Actions pilot et retry du Studio : transforment une série en sa première
// image, ou reproposent une image en échec (nouveau routage appliqué).
// Aucune génération ni aucun crédit ici : seule la proposition change.
// Déplacées telles quelles depuis index.ts (fiche 5, lot 3, docs/robustesse/gros-fichiers.md).
import { higgsfieldImagesEnabled, marketingFidelityEligible, routeToMarketingStudio } from "../higgsfield-image.ts";
import { resolveSoulStyle, soulStyles } from "../soul-direction.ts";
import { unwrap } from "../storage.ts";
import type { StudioContext, StudioSession } from "./context.ts";

/** Renvoie la session avec la nouvelle proposition. */
export async function prepareNextProposal(ctx: StudioContext, session: StudioSession): Promise<StudioSession> {
  const { sb, p } = ctx;
  if (session.revision !== p.revision) throw new Error("studio_conflict");
  const active = unwrap(
    await sb.from("visual_studio_versions").select("id").eq(
      "session_id",
      session.id,
    ).eq("status", "processing"),
  );
  if (active.length) throw new Error("studio_busy");
  let next = session.proposal;
  if (p.action === "retry") {
    const failed = unwrap(
      await sb.from("visual_studio_versions").select("proposal").eq(
        "id",
        p.version_id,
      ).eq("session_id", session.id).eq("status", "failed").single(),
    );
    next = {
      ...failed.proposal,
      id: crypto.randomUUID(),
      shots: [],
      cost: 1,
    };
    // New proposal (not a submitted job): apply the current routing so the
    // confirmation shows the provider that will really be used.
    if (higgsfieldImagesEnabled() && marketingFidelityEligible(next)) next = routeToMarketingStudio(next);
  } else {
    if (!next || next.id !== p.proposal_id || !next.shots?.length) {
      throw new Error("studio_conflict");
    }
    next = {
      ...next,
      id: crypto.randomUUID(),
      shots: [],
      cost: 1,
      summary: "Créer uniquement la première image prévue dans la série, pour valider sa direction avant la suite.",
      // The complete first-shot prompt remains authoritative; the plan-wide
      // change list can contain contradictory instructions for later shots.
      change: [],
    };
  }
  if (next?.provider === "higgsfield" && next.soul_style) resolveSoulStyle(next.soul_style.id, await soulStyles());
  session = unwrap(
    await sb.from("visual_studio_sessions").update({
      proposal: next,
      revision: session.revision + 1,
    }).eq("id", session.id).eq("revision", p.revision).select("*").single(),
  );
  return session;
}
