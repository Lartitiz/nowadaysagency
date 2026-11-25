// La relance « Voilà la nouvelle version… » annonce une image qui vient d'être
// créée. Défaut du 25/11/2026 : elle revenait sous une réponse de conseil ou un
// renvoi vers l'outil Préparation, alors qu'aucune image n'avait été créée.
import { describe, expect, it } from "vitest";
import { readyFollowUpFor } from "@/features/visual-studio/proposal-labels";
import type { StudioMessage, StudioVersion } from "@/features/visual-studio/api";

const version = (proposal: Record<string, unknown> = { operation: "edit" }): StudioVersion => ({
  id: "v1", status: "ready", proposal: proposal as never, url: "/v1.png",
  library_photo_id: null, error_message: null, created_at: "",
});
const asked: StudioMessage = { role: "user", text: "Éclaircis la cuisine", viewed_version_id: null };
const prepared: StudioMessage = { role: "assistant", text: "Je prépare la retouche.", operation: "edit", viewed_version_id: null };
const NEW_VERSION = "Voilà la nouvelle version. Qu’est-ce que tu veux ajuster maintenant ? Réponds-moi directement ici.";

describe("relance après une image prête", () => {
  it("s'affiche juste après la création de l'image", () => {
    expect(readyFollowUpFor(version(), [], [asked, prepared]).readyFollowUp).toBe(NEW_VERSION);
    expect(readyFollowUpFor(version(), []).readyFollowUp).toBe(NEW_VERSION);
  });

  it("ne s'affiche plus après un renvoi vers l'outil Préparation sur cette image", () => {
    const messages: StudioMessage[] = [asked, prepared,
      { role: "user", text: "Rends cette cuisine plus lumineuse", viewed_version_id: "v1" },
      { role: "assistant", text: "L'outil Préparation est le plus adapté.", operation: "existing_tool", existing_tool: "preparation", viewed_version_id: "v1" }];
    expect(readyFollowUpFor(version(), [], messages).readyFollowUp).toBeNull();
  });

  it.each(["advise", "clarify", "existing_tool"])("ne s'affiche plus quand la dernière réponse est « %s », même en nouvelle demande", (operation) => {
    const messages: StudioMessage[] = [asked, prepared,
      { role: "user", text: "Autre sujet", viewed_version_id: null },
      { role: "assistant", text: "Réponse sans image.", operation, viewed_version_id: null }];
    expect(readyFollowUpFor(version(), [], messages).readyFollowUp).toBeNull();
    expect(readyFollowUpFor(version({ operation: "create" }), [], messages).readyFollowUp).toBeNull();
    expect(readyFollowUpFor(version({ operation: "create", scene_workflow: { phase: "scene" } }), [], messages).readyFollowUp).toBeNull();
  });

  it("garde les boutons du mannequin après une question, sans réannoncer le mannequin", () => {
    const sheet = version({ operation: "create", person_reference: { mode: "sheet" } });
    const fresh = readyFollowUpFor(sheet, [], [asked, prepared]);
    expect(fresh.identitySheet).toBe(true);
    expect(fresh.readyFollowUp).toMatch(/^Voilà ton mannequin\./);
    const later = readyFollowUpFor(sheet, [], [asked, prepared,
      { role: "user", text: "Elle fait quel âge ?", viewed_version_id: "v1" },
      { role: "assistant", text: "Une trentaine d'années.", operation: "advise", viewed_version_id: "v1" }]);
    expect(later.identitySheet).toBe(true);
    expect(later.readyFollowUp).toMatch(/^Prochaine étape : la photo portée/);
    expect(later.readyFollowUp).not.toMatch(/Voilà/);
  });
});
