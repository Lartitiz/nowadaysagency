import { describe, it, expect } from "vitest";
import {
  guardCalendarLabel,
  normalizeObjectif,
  nextDateForDay,
  planItemRoute,
  splitStoredActions,
  ChatPlanItem,
} from "@/lib/chat-plan";

describe("guardCalendarLabel", () => {
  it("réécrit un bouton de navigation qui PROMET un ajout", () => {
    // Le bug vécu : le bouton disait « Ajouter au calendrier », il ne faisait
    // qu'ouvrir la page — le calendrier restait vide.
    expect(guardCalendarLabel("/calendrier", "Ajouter au calendrier")).toBe("Ouvrir le calendrier");
    expect(guardCalendarLabel("/calendrier", "Planifier mes posts")).toBe("Ouvrir le calendrier");
    expect(guardCalendarLabel("/calendrier?vue=semaine", "Caler ma semaine")).toBe("Ouvrir le calendrier");
    expect(guardCalendarLabel("/calendrier", "Programmer la semaine")).toBe("Ouvrir le calendrier");
  });

  it("laisse tranquille un libellé honnête", () => {
    expect(guardCalendarLabel("/calendrier", "Ouvrir le calendrier")).toBe("Ouvrir le calendrier");
    expect(guardCalendarLabel("/calendrier", "Voir mon calendrier")).toBe("Voir mon calendrier");
  });

  it("ne touche pas aux autres routes", () => {
    expect(guardCalendarLabel("/creer", "Ajouter une photo")).toBe("Ajouter une photo");
    expect(guardCalendarLabel("/idees", "Planifier plus tard")).toBe("Planifier plus tard");
  });
});

describe("normalizeObjectif", () => {
  it("traduit le vocabulaire du coaching vers celui du calendrier", () => {
    expect(normalizeObjectif("inspirer")).toBe("visibilite");
    expect(normalizeObjectif("eduquer")).toBe("credibilite");
    expect(normalizeObjectif("vendre")).toBe("vente");
    expect(normalizeObjectif("lien")).toBe("confiance");
  });

  it("laisse passer les valeurs déjà canoniques", () => {
    for (const v of ["visibilite", "confiance", "vente", "credibilite"]) {
      expect(normalizeObjectif(v)).toBe(v);
    }
  });

  it("renvoie null plutôt qu'une valeur que l'app ne sait pas lire", () => {
    expect(normalizeObjectif("n'importe quoi")).toBeNull();
    expect(normalizeObjectif(null)).toBeNull();
    expect(normalizeObjectif("")).toBeNull();
  });
});

describe("nextDateForDay", () => {
  it("vise la prochaine occurrence, jamais aujourd'hui ni le passé", () => {
    const mercredi = new Date(2026, 7, 5); // mercredi 5 août 2026
    expect(nextDateForDay("Vendredi", mercredi)).toBe("2026-08-07");
    expect(nextDateForDay("Lundi", mercredi)).toBe("2026-08-10");
    // Le jour même bascule à la semaine suivante (on ne planifie pas derrière soi)
    expect(nextDateForDay("Mercredi", mercredi)).toBe("2026-08-12");
  });

  it("tolère la casse et les espaces", () => {
    const mercredi = new Date(2026, 7, 5);
    expect(nextDateForDay("  vendredi ", mercredi)).toBe("2026-08-07");
  });
});

describe("planItemRoute", () => {
  const item = (format: string): ChatPlanItem => ({
    kind: "plan", day: "Lundi", format, subject: "Mes 3 erreurs", objective: "credibilite",
  });

  it("pré-remplit sujet et objectif dans le bon générateur", () => {
    expect(planItemRoute(item("post_carrousel"))).toBe(
      "/creer?format=carousel&sujet=Mes%203%20erreurs&objectif=credibilite",
    );
    expect(planItemRoute(item("post"))).toBe(
      "/creer?sujet=Mes%203%20erreurs&objectif=credibilite",
    );
    expect(planItemRoute(item("reel"))).toContain("format=reel");
  });
});

describe("splitStoredActions", () => {
  it("sépare les liens des cartes de planning rangés dans la même colonne", () => {
    const stored = [
      { route: "/creer", label: "Créer le post", icon: "PenLine" },
      { kind: "plan", day: "Lundi", format: "post_carrousel", subject: "Sujet A", objective: "vente" },
      { kind: "plan", day: "Mardi", format: "reel", subject: "Sujet B", objective: "confiance" },
    ];
    const { actions, plan } = splitStoredActions(stored);
    expect(actions).toHaveLength(1);
    expect(plan).toHaveLength(2);
    expect(plan[1].subject).toBe("Sujet B");
  });

  it("assainit aussi les vieux messages déjà en base", () => {
    const { actions } = splitStoredActions([
      { route: "/calendrier", label: "Ajouter au calendrier", icon: "CalendarDays" },
    ]);
    expect(actions[0].label).toBe("Ouvrir le calendrier");
  });

  it("encaisse null / valeurs inattendues", () => {
    expect(splitStoredActions(null)).toEqual({ actions: [], plan: [] });
    expect(splitStoredActions("bidon")).toEqual({ actions: [], plan: [] });
    expect(splitStoredActions([null, 42, {}])).toEqual({ actions: [], plan: [] });
  });
});
