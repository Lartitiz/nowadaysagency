import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFlowState,
  loadFlowState,
  loadPhotos,
  savePhotos,
  saveFlowState,
  setFlowUserId,
  setFlowWorkspaceId,
} from "@/hooks/use-flow-persistence";

// Copie de secours du parcours /creer avec plusieurs onglets (lot 10, 14/10/2026).
// sessionStorage appartient à un onglet, localStorage est commun à tous : on
// simule chaque onglet en échangeant le contenu de sessionStorage.

vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));

type Tab = { session: Record<string, string> };
let current: Tab | null = null;

function newTab(): Tab {
  return { session: {} };
}
function switchTo(tab: Tab) {
  if (current) current.session = { ...sessionStorage };
  sessionStorage.clear();
  for (const [k, v] of Object.entries(tab.session)) sessionStorage.setItem(k, v);
  current = tab;
}
/** L'onglet est fermé : il ne signale plus sa présence. */
function close(tab: Tab) {
  const id = tab === current ? sessionStorage.getItem("creer_flow_tab") : tab.session["creer_flow_tab"];
  localStorage.removeItem(`creer_flow_presence:${id}`);
  if (tab === current) { sessionStorage.clear(); current = null; }
  tab.session = {};
}
const backups = () => Object.keys(localStorage).filter((k) => k.startsWith("creer_flow_state_backup:"));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  current = null;
  setFlowUserId("owner");
  setFlowWorkspaceId("atelier");
});

describe("copie de secours : une par onglet", () => {
  it("deux onglets ouverts gardent chacun leur copie, aucune n'écrase l'autre", () => {
    const a = newTab(); const b = newTab();
    switchTo(a); saveFlowState({ step: "result", ideaText: "Brouillon A" });
    switchTo(b); saveFlowState({ step: "result", ideaText: "Brouillon B" });
    expect(backups()).toHaveLength(2);
    switchTo(a); expect(loadFlowState()?.ideaText).toBe("Brouillon A");
  });

  it("un nouvel onglet ne reprend pas le brouillon d'un onglet encore ouvert", () => {
    const a = newTab();
    switchTo(a); saveFlowState({ step: "result", ideaText: "Brouillon A" });
    switchTo(newTab());
    expect(loadFlowState()).toBeNull();
    // L'onglet A garde son brouillon et sa copie.
    switchTo(a); expect(loadFlowState()?.ideaText).toBe("Brouillon A");
  });

  it("onglet fermé puis rouvert : son brouillon revient, sans prendre celui d'un onglet ouvert", () => {
    const a = newTab(); const b = newTab();
    switchTo(a); saveFlowState({ step: "result", ideaText: "Brouillon A" });
    switchTo(b); saveFlowState({ step: "result", ideaText: "Brouillon B, plus récent" });
    close(a);
    switchTo(newTab());
    expect(loadFlowState()?.ideaText).toBe("Brouillon A");
  });

  it("une copie d'onglet fermé depuis plus de 30 jours est supprimée, pas reprise", () => {
    const a = newTab(); const b = newTab();
    switchTo(a); saveFlowState({ step: "result", ideaText: "Très vieux" });
    const keyA = backups()[0];
    localStorage.setItem(keyA, JSON.stringify({ ...JSON.parse(localStorage.getItem(keyA)!), ts: Date.now() - 31 * 86_400_000 }));
    close(a);
    switchTo(b); saveFlowState({ step: "result", ideaText: "Récent" }); close(b);
    switchTo(newTab()); expect(loadFlowState()?.ideaText).toBe("Récent");
    expect(backups()).toHaveLength(1);
  });

  it("un brouillon repris ne peut pas être repris une 2ᵉ fois par un autre onglet", () => {
    const a = newTab();
    switchTo(a); saveFlowState({ step: "result", ideaText: "Brouillon A" });
    close(a);
    const c = newTab();
    switchTo(c); expect(loadFlowState()?.ideaText).toBe("Brouillon A");
    switchTo(newTab()); expect(loadFlowState()).toBeNull();
    expect(backups()).toHaveLength(1);
  });

  it("plusieurs onglets fermés : le plus récent revient, l'autre reste disponible", () => {
    const a = newTab(); const b = newTab();
    switchTo(a); saveFlowState({ step: "result", ideaText: "Ancien" });
    switchTo(b); saveFlowState({ step: "result", ideaText: "Récent" });
    // ts est réécrit à chaque sauvegarde : on vieillit A d'une heure à la main.
    const keyA = backups().find((k) => JSON.parse(localStorage.getItem(k)!).ideaText === "Ancien")!;
    localStorage.setItem(keyA, JSON.stringify({ ...JSON.parse(localStorage.getItem(keyA)!), ts: Date.now() - 3_600_000 }));
    close(a); close(b);
    switchTo(newTab()); expect(loadFlowState()?.ideaText).toBe("Récent");
    switchTo(newTab()); expect(loadFlowState()?.ideaText).toBe("Ancien");
  });

  it("les photos reviennent avec le brouillon de leur onglet", async () => {
    const a = newTab(); const b = newTab();
    switchTo(a);
    saveFlowState({ step: "result", ideaText: "Avec photos" });
    await savePhotos([{ id: "photo-a", userPhotoId: "lib-a", name: "a.jpg" }]);
    switchTo(b);
    saveFlowState({ step: "result", ideaText: "Autre" });
    await savePhotos([{ id: "photo-b", userPhotoId: "lib-b", name: "b.jpg" }]);
    close(a);
    switchTo(newTab());
    expect(loadPhotos()).toMatchObject([{ id: "photo-a" }]);
    expect(loadFlowState()?.ideaText).toBe("Avec photos");
  });

  it("après une remise à zéro, un brouillon plus ancien d'un onglet fermé ne réapparaît pas", () => {
    const a = newTab();
    switchTo(a); saveFlowState({ step: "result", ideaText: "Vieux brouillon" });
    close(a);
    const c = newTab();
    switchTo(c);
    // Nouveau contenu demandé : remise à zéro avant toute reprise.
    clearFlowState();
    expect(loadFlowState()).toBeNull();
  });

  it("une remise à zéro dans un onglet laisse intacte la copie d'un autre onglet", () => {
    const a = newTab(); const b = newTab();
    switchTo(a); saveFlowState({ step: "result", ideaText: "Brouillon A" });
    switchTo(b); saveFlowState({ step: "result", ideaText: "Brouillon B" }); clearFlowState();
    expect(backups()).toHaveLength(1);
    switchTo(a); expect(loadFlowState()?.ideaText).toBe("Brouillon A");
  });

  it("un onglet qui retrouve sa propre copie la reprend avant celle, plus récente, d'un onglet fermé", () => {
    const a = newTab(); const b = newTab();
    switchTo(a); saveFlowState({ step: "result", ideaText: "Mon brouillon" });
    switchTo(b); saveFlowState({ step: "result", ideaText: "Brouillon fermé, plus récent" }); close(b);
    switchTo(a);
    // Un autre compte a utilisé cet onglet entre-temps.
    setFlowUserId("autre"); saveFlowState({ step: "idea", ideaText: "Autre compte" });
    setFlowUserId("owner");
    expect(loadFlowState()?.ideaText).toBe("Mon brouillon");
  });

  it("reprend l'ancienne copie unique (format d'avant) si aucun onglet ne la tient", () => {
    localStorage.setItem("creer_flow_state_backup:owner:atelier", JSON.stringify({ step: "result", ideaText: "Format d'avant", ownerId: "owner", ts: Date.now() }));
    switchTo(newTab());
    expect(loadFlowState()?.ideaText).toBe("Format d'avant");
    expect(localStorage.getItem("creer_flow_state_backup:owner:atelier")).toBeNull();
    expect(backups()).toHaveLength(1);
  });
});
