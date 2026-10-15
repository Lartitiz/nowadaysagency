import { describe, it, expect } from "vitest";
import { pickActiveWorkspace, visibleWorkspaces } from "@/lib/workspace-select";
import { WORKSPACE_SHARING_ENABLED } from "@/config/feature-flags";

/** Mode Binôme coupé le 15/10/2026 : chacune reste dans son propre espace. */
const CLIENT = { id: "ws-client", _role: "manager" };
const OWN = { id: "ws-own", _role: "owner" };
const OWN_2 = { id: "ws-own-2", _role: "owner" };

describe("partage d'espace coupé", () => {
  it("l'interrupteur est bien coupé", () => {
    expect(WORKSPACE_SHARING_ENABLED).toBe(false);
  });

  it("un espace client (manager) n'est plus proposé, même s'il était le dernier ouvert", () => {
    const visible = visibleWorkspaces([CLIENT, OWN], false);
    expect(visible).toEqual([OWN]);
    expect(pickActiveWorkspace(visible, "ws-client")).toEqual(OWN);
  });

  it("une utilisatrice avec deux espaces à elle garde les deux", () => {
    expect(visibleWorkspaces([OWN, CLIENT, OWN_2], false)).toEqual([OWN, OWN_2]);
  });

  it("sans aucun espace owner, la liste reste telle quelle (rien ne disparaît)", () => {
    expect(visibleWorkspaces([CLIENT], false)).toEqual([CLIENT]);
  });

  it("partage rallumé : tout est proposé comme avant", () => {
    expect(visibleWorkspaces([CLIENT, OWN], true)).toEqual([CLIENT, OWN]);
  });
});
