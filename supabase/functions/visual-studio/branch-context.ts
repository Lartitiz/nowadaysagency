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

/** A worn/in-scene product photo is placement context only when a clean shot exists. */
export function isWornProduct(ref: Reference): boolean {
  return normalizedKind(ref) === "produit_porte";
}

export function hasCleanProduct(refs: Reference[]): boolean {
  return refs.some(ref => ref.role === "product" && normalizedKind(ref) === "produit");
}

/** Clean shots of ONE product are authoritative for product fidelity — several
 * angles of the same product all travel together. Worn shots are never part of
 * the group, and distinct products require the user to choose. */
export function preferredProductGroup(currentRefs: Reference[]): {
  references: Reference[];
  ambiguous: boolean;
} {
  const clean = currentRefs.filter(ref => ref.role === "product" && normalizedKind(ref) === "produit");
  const groups = new Map<string, Reference[]>();
  for (const ref of clean) {
    const key = ref.subject_group || ref.id;
    groups.set(key, [...(groups.get(key) || []), ref]);
  }
  if (groups.size !== 1) return { references: [], ambiguous: groups.size > 1 };
  return { references: [...groups.values()][0], ambiguous: false };
}
