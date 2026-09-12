export type CoachingProposal = { field: string; value: string; label: string };
export function proposalEditKey(proposal: CoachingProposal, index: number) { return `${index}:${proposal.field}`; }
export function collectCoachingProposals(proposals: CoachingProposal[], edits: Record<string, string>, selected: Record<string, number>) {
  const updates: Record<string, string> = {};
  for (const [index, proposal] of proposals.entries()) {
    const variants = proposals.filter(p => p.field === proposal.field);
    if (variants.length > 1) {
      const chosen = selected[proposal.field];
      if (chosen === undefined || proposals[chosen]?.field !== proposal.field) throw new Error(`Choisis la version à conserver pour « ${proposal.label} ».`);
      if (chosen !== index) continue;
    }
    updates[proposal.field] = edits[proposalEditKey(proposal, index)] ?? proposal.value;
  }
  return updates;
}
