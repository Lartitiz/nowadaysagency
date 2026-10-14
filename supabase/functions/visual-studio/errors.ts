// Traduction des erreurs internes du Studio en réponse au front.
// Une erreur est reconnue par SOUS-CHAÎNE de son message (ex. « P0001:
// studio_conflict ») : un module qui lance ces codes doit garder exactement
// les mêmes chaînes, sinon un 409 devient 503. Figé par handler_contract_test.ts.
// Déplacé tel quel depuis index.ts (fiche 5, lot 1, docs/robustesse/gros-fichiers.md).
const known: Record<string, string> = {
  studio_soul_style_unavailable: "Ce preset Soul n’est plus disponible. Modifie ta demande ou choisis sans preset.",
  studio_soul_prompt_missing: "La consigne photographique est incomplète. Modifie ta demande avant de générer.",
  studio_integration_sources: "Chaque personne et produit doit être associé à ses originaux. Reprécise les références avant l’intégration.",
  studio_reference_limit:
    "Garde jusqu’à huit références. Retire une référence avant d’ajouter cette direction.",
  studio_image_too_large:
    "Cette photo dépasse 5 Mo. Ajoute une version plus légère pour que le Studio puisse l’examiner.",
  studio_interpretation_limit:
    "Tu as envoyé beaucoup de demandes. Réessaie un peu plus tard.",
  studio_memory_limit:
    "La marque conserve déjà 100 éléments. Retire une ancienne préférence pour en ajouter une.",
  studio_casting_source:
    "Choisis une image de mannequin fictif. Une photo de personne réelle ne devient pas un mannequin fictif.",
  studio_busy:
    "Une image est déjà en cours dans cet espace. Reprends sa session.",
  studio_quota: "Le quota a changé. Recharge la session.",
  studio_proposal_changed:
    "Cette proposition a changé. Vérifie la dernière demande.",
  studio_conflict: "La session a changé. Recharge-la.",
  studio_archived: "Cette session est archivée. Restaure-la pour continuer.",
};
export function translateStudioError(message: string): { error: string; status: number } {
  const key = Object.keys(known).find((k) => message.includes(k));
  return {
    error: key
      ? known[key]
      : message.startsWith("Intégration à préciser :") ? message : "Le Studio est momentanément indisponible. Ta demande reste conservée ; réessaie.",
    status: key ? 409 : 503,
  };
}
