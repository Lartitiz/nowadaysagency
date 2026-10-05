import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SubPageHeader from "@/components/SubPageHeader";

// Le lien « Retour » lit ?from= dans l'URL : un lien piégé ne doit jamais
// en faire un javascript: ou une sortie vers un autre site.
function backHref(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Audit" useFromParam />
    </MemoryRouter>,
  );
  return screen.getByRole("link", { name: /^Retour/ }).getAttribute("href");
}

describe("SubPageHeader ?from=", () => {
  it("suit un chemin interne", () => {
    expect(backHref("/linkedin/audit?from=%2Fcalendrier")).toBe("/calendrier");
  });

  it.each([
    "javascript:alert(document.cookie)",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
  ])("ignore %s et revient au parent", (from) => {
    expect(backHref(`/linkedin/audit?from=${encodeURIComponent(from)}`)).toBe("/linkedin");
  });
});
