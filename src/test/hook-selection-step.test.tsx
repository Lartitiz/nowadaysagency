import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HookSelectionStep, { type ReelHook } from "@/components/creer/HookSelectionStep";

const HOOKS: ReelHook[] = [
  {
    type: "vecu_perso",
    type_label: "Vécu perso",
    text: "Mon premier savon, je l'ai jeté. Il était parfait.",
    text_overlay: "PARFAIT. DONC RATÉ.",
    format_recommande: "voix_off_broll",
    format_label: "Voix off + B-roll",
    duree_cible: "~30 sec",
  },
  {
    type: "contre_intuition",
    type_label: "Contre-intuition",
    text: "Un savon qui mousse beaucoup, c'est souvent mauvais signe.",
    text_overlay: "LA MOUSSE MENT",
    format_recommande: "face_cam_confession",
    format_label: "Face cam",
    duree_cible: "~25 sec",
  },
  {
    type: "objection_retournee",
    type_label: "Objection retournée",
    text: "9 euros le savon ? Oui. Et c'est le moins cher des deux.",
    text_overlay: "9 € LE SAVON. MOINS CHER.",
    format_recommande: "face_cam_confession",
    format_label: "Face cam",
    duree_cible: "~35 sec",
  },
];

const noop = () => {};

describe("HookSelectionStep", () => {
  it("affiche les 3 cartes avec type, texte et overlay muet", () => {
    render(
      <HookSelectionStep hooks={HOOKS} loading={false} onSelect={noop} onSkip={noop} onRefresh={noop} onBack={noop} />,
    );
    expect(screen.getByText("Choisis ton angle d'attaque")).toBeTruthy();
    expect(screen.getByText("Vécu perso")).toBeTruthy();
    expect(screen.getByText(/Un savon qui mousse beaucoup/)).toBeTruthy();
    expect(screen.getByText(/LA MOUSSE MENT/)).toBeTruthy();
    expect(screen.getByText(/Voix off \+ B-roll · ~30 sec/)).toBeTruthy();
  });

  it("le CTA est désactivé tant qu'aucun hook n'est choisi, puis renvoie le hook cliqué", () => {
    const onSelect = vi.fn();
    render(
      <HookSelectionStep hooks={HOOKS} loading={false} onSelect={onSelect} onSkip={noop} onRefresh={noop} onBack={noop} />,
    );
    const cta = screen.getByRole("button", { name: /Écrire le script complet/ });
    expect((cta as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /mousse/ }));
    expect((cta as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(cta);
    expect(onSelect).toHaveBeenCalledWith(HOOKS[1]);
  });

  it("« Laisser l'IA choisir » et « 3 autres angles » appellent leurs callbacks", () => {
    const onSkip = vi.fn();
    const onRefresh = vi.fn();
    render(
      <HookSelectionStep hooks={HOOKS} loading={false} onSelect={noop} onSkip={onSkip} onRefresh={onRefresh} onBack={noop} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Laisser l'IA choisir/ }));
    expect(onSkip).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /3 autres angles/ }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("état d'erreur : jamais bloquant, propose de continuer sans choisir", () => {
    const onSkip = vi.fn();
    render(
      <HookSelectionStep hooks={[]} loading={false} error="oups" onSelect={noop} onSkip={onSkip} onRefresh={noop} onBack={noop} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Continuer sans choisir/ }));
    expect(onSkip).toHaveBeenCalled();
  });

  // ── Anti-cul-de-sac (bug live 03/08) ──────────────────────────────────────
  // L'écran restait affiché avec ses angles, ses boutons inertes et AUCUN
  // message : « 3 autres angles » échouait en silence. Trois garanties tenues
  // ici : on dit ce qui s'est passé, on garde les cartes, la sortie de secours
  // ne se verrouille jamais.
  it("refresh raté : le message s'affiche SANS faire disparaître les angles", () => {
    render(
      <HookSelectionStep
        hooks={HOOKS}
        loading={false}
        error="Je n'ai pas réussi à trouver 3 autres angles."
        onSelect={noop}
        onSkip={noop}
        onRefresh={noop}
        onBack={noop}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/3 autres angles/);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /Écrire le script complet/ })).toBeTruthy();
  });

  it("pendant un refresh, seul « 3 autres angles » se verrouille : les sorties restent ouvertes", () => {
    const onSkip = vi.fn();
    const onBack = vi.fn();
    render(
      <HookSelectionStep
        hooks={HOOKS}
        loading={false}
        refreshing
        onSelect={noop}
        onSkip={onSkip}
        onRefresh={noop}
        onBack={onBack}
      />,
    );
    expect((screen.getByRole("button", { name: /3 autres angles/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Laisser l'IA choisir/ }));
    expect(onSkip).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Revenir aux questions/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it("écran vide : « Revenir aux questions » est là aussi (sinon on est enfermée)", () => {
    const onBack = vi.fn();
    render(
      <HookSelectionStep hooks={[]} loading={false} error="oups" onSelect={noop} onSkip={noop} onRefresh={noop} onBack={onBack} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Revenir aux questions/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it("hook récupéré sans habillage : le texte s'affiche, aucun « undefined » à l'écran", () => {
    render(
      <HookSelectionStep
        hooks={[{ text: "9 euros le savon ? Oui, et c'est le moins cher." }]}
        loading={false}
        onSelect={noop}
        onSkip={noop}
        onRefresh={noop}
        onBack={noop}
      />,
    );
    expect(screen.getByText(/9 euros le savon/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/undefined/);
  });

  it("état loading : affiche le loader, pas les cartes", () => {
    render(
      <HookSelectionStep hooks={[]} loading={true} onSelect={noop} onSkip={noop} onRefresh={noop} onBack={noop} />,
    );
    expect(screen.queryByText("Choisis ton angle d'attaque")).toBeNull();
    expect(screen.getByText(/décident de tout/)).toBeTruthy();
  });
});
