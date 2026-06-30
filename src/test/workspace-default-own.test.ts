import { describe, it, expect } from "vitest";
import { pickActiveWorkspace } from "@/lib/workspace-select";

/**
 * Régression du bug QA : un·e admin membre de plusieurs espaces (le sien + ceux
 * de client·es) ne doit JAMAIS atterrir par défaut dans l'espace d'autrui.
 * `pickActiveWorkspace` doit privilégier l'espace dont on est `owner`, pas le
 * premier de la liste (ordre arbitraire renvoyé par la BDD).
 */

type Row = { id: string; _role: string };

// Ordre volontairement "piège" : un espace client (manager) en premier.
const CLIENT_A: Row = { id: "ws-client-a", _role: "manager" };
const OWN: Row = { id: "ws-own", _role: "owner" };
const CLIENT_B: Row = { id: "ws-client-b", _role: "manager" };
const loaded = [CLIENT_A, OWN, CLIENT_B];

describe("pickActiveWorkspace", () => {
  it("défaut = espace 'owner' même si un espace client est en tête de liste", () => {
    expect(pickActiveWorkspace(loaded, null)?.id).toBe("ws-own");
  });

  it("respecte un choix explicite persisté (savedId) encore accessible", () => {
    expect(pickActiveWorkspace(loaded, "ws-client-b")?.id).toBe("ws-client-b");
  });

  it("ignore un savedId devenu inaccessible et retombe sur l'espace owner", () => {
    expect(pickActiveWorkspace(loaded, "ws-supprime")?.id).toBe("ws-own");
  });

  it("sans aucun espace owner, retombe sur le premier (dernier recours)", () => {
    const onlyClients = [CLIENT_A, CLIENT_B];
    expect(pickActiveWorkspace(onlyClients, null)?.id).toBe("ws-client-a");
  });

  it("utilisateur·ice solo (1 seul espace, le sien) : le sélectionne", () => {
    expect(pickActiveWorkspace([OWN], null)?.id).toBe("ws-own");
  });

  it("liste vide → null", () => {
    expect(pickActiveWorkspace([], null)).toBeNull();
  });
});
