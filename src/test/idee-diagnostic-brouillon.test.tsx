import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { nextIdeaLink, useSubjectBaseline } from "@/hooks/use-subject-baseline";

/* Suite de #1725 : un brouillon restauré dans l'onglet (editingIdeaId déjà
   rempli) empêchait de relier l'idée du diagnostic choisie, et un nouveau
   sujet écrivait le nouveau contenu dans l'ancienne fiche. */

const brouillon = { editingIdeaId: "brouillon-1", previousSubject: "Mon ancien carrousel", hasContent: true };

describe("Sujet suivant : quelle fiche reçoit le contenu", () => {
  it("relie l'idée du diagnostic même quand un brouillon rempli traîne, sans écrire dedans", () => {
    expect(nextIdeaLink({ ...brouillon, pickedIdeaId: "idee-1", subject: "Mes bijoux en petites séries" }))
      .toEqual({ ideaId: "idee-1", freshContent: true });
  });

  it("relie l'idée du diagnostic quand le brouillon n'a encore rien d'écrit", () => {
    expect(nextIdeaLink({ ...brouillon, hasContent: false, pickedIdeaId: "idee-1", subject: "Mes bijoux en petites séries" }))
      .toEqual({ ideaId: "idee-1", freshContent: false });
  });

  it("un autre sujet tapé après un contenu écrit part sur une nouvelle fiche", () => {
    expect(nextIdeaLink({ ...brouillon, subject: "Un tout autre sujet" })).toEqual({ ideaId: null, freshContent: true });
  });

  it("garde la fiche si le sujet ne change pas, ou s'il est reformulé avant tout contenu", () => {
    expect(nextIdeaLink({ ...brouillon, subject: " Mon ancien carrousel " })).toEqual({ ideaId: "brouillon-1", freshContent: false });
    expect(nextIdeaLink({ ...brouillon, hasContent: false, subject: "Mon ancien carrousel, reformulé" }))
      .toEqual({ ideaId: "brouillon-1", freshContent: false });
    expect(nextIdeaLink({ ...brouillon, pickedIdeaId: "brouillon-1", subject: "Mon ancien carrousel" }))
      .toEqual({ ideaId: "brouillon-1", freshContent: false });
  });

  it("le sujet de référence reste figé pendant la saisie à l'étape idée", () => {
    const { result, rerender } = renderHook(({ step, idea }) => useSubjectBaseline(step, idea), {
      initialProps: { step: "result", idea: "Mon ancien carrousel" },
    });
    rerender({ step: "idea", idea: "Mon ancien carrousel" });
    rerender({ step: "idea", idea: "Un tout autre" });
    expect(result.current.current).toBe("Mon ancien carrousel");
    rerender({ step: "format", idea: "Un tout autre sujet" });
    expect(result.current.current).toBe("Un tout autre sujet");
  });
});
