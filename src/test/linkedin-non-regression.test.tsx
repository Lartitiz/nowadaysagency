// NON-RÉGRESSION LinkedIn côté écran (04/10/2026) : l'accroche est toujours le
// début exact du post, l'aperçu et le texte corrigé repartent du post tel quel
// (listes, numérotation, sauts de paragraphe), et changer d'accroche ne fait
// perdre aucune ligne du post. Pendant serveur : creative-flow/index_test.ts
// (« NON-RÉGRESSION LinkedIn ») et _shared/text-structure-guard_test.ts.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LinkedInResult from "@/components/creer/formatRenderers/LinkedInResult";
import { deriveLinkedInHook, replaceLinkedInHook, splitHookFromBody } from "@/lib/linkedin-hook";

vi.mock("@/components/creer/formatRenderers/FeedPreview", () => ({ default: ({ text }: any) => <pre data-testid="feed">{text}</pre> }));
vi.mock("@/components/RedFlagsChecker", () => ({ default: () => null }));
vi.mock("@/components/AiGeneratedMention", () => ({ default: () => null }));
afterEach(cleanup);

const POST = `J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas.
Et pourtant, c'était simple.

Voici ce que j'ai changé, dans l'ordre :

1. J'écris d'abord pour une seule personne.
2. Je garde une seule idée par post.
3. Je relis à voix haute avant de publier.

Ce que j'ai arrêté :
– les listes de conseils génériques
– les accroches qui promettent tout`;

describe("aperçu LinkedIn", () => {
  it("accroche reformulée par l'IA : dérivée du post, jamais affichée deux fois, aperçu = post exact", () => {
    render(<LinkedInResult result={{ content: POST, accroche: "Trois ans pour comprendre mes posts" }} />);
    expect(screen.getByTestId("feed").textContent).toBe(POST);
    expect(screen.queryByText("Trois ans pour comprendre mes posts")).toBeNull();
    expect(screen.getAllByText("J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas.").length).toBe(1);
  });

  it("accroche coupée au milieu d'une phrase (« 210 premiers caractères ») : aucun saut de ligne ajouté", () => {
    render(<LinkedInResult result={{ content: POST, accroche: "J'ai mis trois ans à comprendre pourquoi" }} />);
    expect(screen.getByTestId("feed").textContent).toBe(POST);
  });

  it("accroche exacte sur une ligne suivie d'un simple retour : l'aperçu ne crée pas de paragraphe", () => {
    render(<LinkedInResult result={{ content: POST, accroche: "J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas." }} />);
    expect(screen.getByTestId("feed").textContent).toBe(POST);
  });

  it("forme accroche + corps séparés (légende de carrousel) : inchangée", () => {
    render(<LinkedInResult result={{ hook: "Une accroche", body: "Le corps.", cta: "La fin." }} />);
    expect(screen.getByTestId("feed").textContent).toBe("Une accroche\n\nLe corps.\n\nLa fin.");
  });
});

describe("linkedin-hook", () => {
  it("deriveLinkedInHook garde une accroche exacte, sinon la première ligne", () => {
    expect(deriveLinkedInHook(POST, "J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas.\nEt pourtant, c'était simple."))
      .toBe("J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas.\nEt pourtant, c'était simple.");
    expect(deriveLinkedInHook(POST, "autre chose")).toBe("J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas.");
  });

  it("splitHookFromBody signale une divergence sans toucher au corps", () => {
    expect(splitHookFromBody(POST, "Pas le début")).toEqual({ matched: false, rest: POST });
    expect(splitHookFromBody(POST, "J'ai mis trois ans").matched).toBe(true);
  });

  it("replaceLinkedInHook : seule l'accroche change, chaque ligne de liste survit", () => {
    const out = replaceLinkedInHook(POST, "Une nouvelle accroche.");
    expect(out).toBe(POST.replace("J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas.\nEt pourtant, c'était simple.", "Une nouvelle accroche."));
    for (const line of POST.split("\n").slice(2)) expect(out.split("\n")).toContain(line);
  });

  it("replaceLinkedInHook : une liste collée à l'accroche n'est jamais avalée", () => {
    const post = "Mes trois règles :\n1. Une personne.\n2. Une idée.\n3. Relire.";
    expect(replaceLinkedInHook(post, "Trois règles qui ont tout changé :")).toBe("Trois règles qui ont tout changé :\n1. Une personne.\n2. Une idée.\n3. Relire.");
    // Post qui commence directement par une liste : l'accroche s'ajoute au-dessus.
    expect(replaceLinkedInHook("1. Un\n2. Deux", "Accroche")).toBe("Accroche\n\n1. Un\n2. Deux");
  });

  it("replaceLinkedInHook : premier paragraphe trop long → seule la première ligne est remplacée", () => {
    const post = "Ligne d'accroche.\n" + "x".repeat(250) + "\n\nSuite.";
    expect(replaceLinkedInHook(post, "Nouvelle.")).toBe("Nouvelle.\n" + "x".repeat(250) + "\n\nSuite.");
  });
});
