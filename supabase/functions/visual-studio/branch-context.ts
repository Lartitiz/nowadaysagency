import type { Reference } from "./media.ts";

type ParentProposal = {
  reference_snapshot?: Reference[];
  planning_references?: Reference[];
  references?: Reference[];
  original_path?: string | null;
  viewed_reference_id?: string | null;
  subject_kind?: string | null;
};

// Older versions predate reference_snapshot. Reconstruct their original subject
// from the server-written proposal; never substitute a later session reference.
export function referencesAtVersion(
  proposal: ParentProposal,
): Reference[] {
  if (Array.isArray(proposal.reference_snapshot)) {
    return [...proposal.reference_snapshot, ...(proposal.planning_references || []).filter(ref => !proposal.reference_snapshot!.some(r => r.id === ref.id))];
  }
  const original = proposal.original_path;
  const saved = Array.isArray(proposal.references) ? proposal.references : [];
  if (!original || saved.some((r) => r.path === original)) return saved;
  const role = proposal.subject_kind === "produit" ? "product"
    : proposal.subject_kind === "portrait" ? "person" : "subject";
  return [
    {
      id: proposal.viewed_reference_id || "historical-subject",
      photo_id: null,
      role,
      path: original,
      name: "Sujet de cette version",
      kind: proposal.subject_kind || undefined,
    },
    ...saved,
  ];
}

export function referencesDiffer(a: Reference[], b: Reference[]): boolean {
  const keys = (refs: Reference[]) =>
    refs.map((r) => JSON.stringify([
      r.path, r.role, r.name, r.kind || null, r.description || null,
      r.memory_id || null,
    ])).sort();
  return JSON.stringify(keys(a)) !== JSON.stringify(keys(b));
}

const refKey = (r: Reference) => JSON.stringify([
  r.path, r.role, r.name, r.kind || null, r.description || null, r.memory_id || null,
]);

// True when every reference used by the version is still present unchanged and
// the session only gained extra photos since (nothing removed or edited).
export function onlyAdditions(versionRefs: Reference[], currentRefs: Reference[]): boolean {
  if (!versionRefs.length) return false;
  const current = new Set(currentRefs.map(refKey));
  return versionRefs.every((r) => current.has(refKey(r)));
}

const normalizedKind = (ref: Reference) => (ref.kind || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** A clean product shot is authoritative for product fidelity. A worn/in-scene
 * photo remains a fallback only when no clean product shot is available. */
export function preferredProductReference(currentRefs: Reference[]): {
  reference: Reference | null;
  ambiguous: boolean;
} {
  const clean = currentRefs.filter(ref => ref.role === "product" && normalizedKind(ref) === "produit");
  const groups = new Map(clean.map(ref => [ref.subject_group || ref.id, ref]));
  return groups.size === 1
    ? { reference: [...groups.values()][0], ambiguous: false }
    : { reference: null, ambiguous: groups.size > 1 };
}

export const isWornProduct = (ref: Reference) => normalizedKind(ref) === "produit_porte";

/** Every view of the single clean product: the clean shot(s) plus any photo the
 * user marked as "another view" of it. Worn photos never join the group.
 * Several distinct clean products are ambiguous and need a choice. */
export function preferredProductGroup(currentRefs: Reference[]): {
  references: Reference[];
  ambiguous: boolean;
} {
  const key = (ref: Reference) => ref.subject_group || ref.id;
  const products = currentRefs.filter(ref => ref.role === "product" && !isWornProduct(ref));
  const cleanKeys = new Set(products.filter(ref => normalizedKind(ref) === "produit").map(key));
  if (cleanKeys.size !== 1) return { references: [], ambiguous: cleanKeys.size > 1 };
  const [groupKey] = [...cleanKeys];
  return { references: products.filter(ref => key(ref) === groupKey), ambiguous: false };
}
