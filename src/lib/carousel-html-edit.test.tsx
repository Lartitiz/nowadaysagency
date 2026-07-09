// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { replaceSlideText } from "./carousel-html-edit";

const STYLE = `<style>@import url('https://fonts.googleapis.com/css2?family=Inter');</style>`;

describe("replaceSlideText", () => {
  it("remplace le texte via l'ancre data-slide-text et préserve le <style> de tête", () => {
    const html = `${STYLE}<div style="width:1080px"><h1 data-slide-text="title" style="color:red">Ancien <span style="color:blue">titre</span></h1><p data-slide-text="body">Ancien corps</p></div>`;
    const out = replaceSlideText(html, "title", "Ancien titre", "Nouveau titre");
    expect(out).not.toBeNull();
    expect(out!).toContain("@import");
    expect(out!).toContain(">Nouveau titre<");
    expect(out!).not.toContain("Ancien titre");
    expect(out!).toContain("Ancien corps");
    expect(out!).toContain('style="color:red"');
  });

  it("cible le bon champ quand title et body coexistent", () => {
    const html = `<div><p data-slide-text="title">Même texte</p><p data-slide-text="body">Même texte</p></div>`;
    const out = replaceSlideText(html, "body", "Même texte", "Corps modifié");
    expect(out!).toContain('data-slide-text="title">Même texte');
    expect(out!).toContain("Corps modifié");
  });

  it("repli anciens visuels : l'élément le plus profond au texte exact", () => {
    const html = `<div><div><h2 style="font-size:44px">Le vrai   titre</h2></div><p>Autre chose</p></div>`;
    const out = replaceSlideText(html, "title", "Le vrai titre", "Titre édité");
    expect(out).not.toBeNull();
    expect(out!).toContain(">Titre édité<");
    expect(out!).toContain("Autre chose");
  });

  it("retourne null si le texte est introuvable (visuel inchangé)", () => {
    const html = `<div><h2>Un titre reformulé par l'IA</h2></div>`;
    expect(replaceSlideText(html, "title", "Texte original du JSON", "Nouveau")).toBeNull();
  });

  it("retourne null sur html vide", () => {
    expect(replaceSlideText("", "title", "a", "b")).toBeNull();
  });
});
