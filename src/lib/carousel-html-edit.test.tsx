// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  replaceSlideText,
  hasSlideCta,
  getSlideCtaText,
  removeSlideCta,
} from "./carousel-html-edit";

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

  it("édite le texte du CTA via l'ancre data-slide-text=cta", () => {
    const html = `${STYLE}<div><div data-slide-cta><span data-slide-text="cta">Réponds en commentaire</span></div></div>`;
    const out = replaceSlideText(html, "cta", "Réponds en commentaire", "Enregistre ce post");
    expect(out!).toContain("Enregistre ce post");
    expect(out!).not.toContain("Réponds en commentaire");
    expect(out!).toContain("data-slide-cta");
  });

  // Slide photo_full telle que produite APRÈS la garde d'ancre serveur : l'overlay
  // porte data-slide-text="overlay" → l'édition live doit le patcher de façon fiable
  // (c'est ce qui manquait et faisait "disparaître" le texte sur l'aperçu/Canva).
  it("édite l'overlay d'une slide photo_full via l'ancre data-slide-text=overlay", () => {
    const html = `${STYLE}<div style="background-image:url(data:image/jpeg;base64,AAAA);position:relative">` +
      `<div style="position:absolute;bottom:80px"><p data-slide-text="overlay" style="color:#fff">Solidays et Garorock annulés en pleine canicule…</p></div></div>`;
    const out = replaceSlideText(html, "overlay", "Solidays et Garorock annulés en pleine canicule…", "Solidays et Garorock reportés au week-end prochain");
    expect(out).not.toBeNull();
    expect(out!).toContain("reportés au week-end prochain");
    expect(out!).not.toContain("canicule");
    // La photo (background-image) est préservée.
    expect(out!).toContain("background-image:url(data:image/jpeg;base64,AAAA)");
  });
});

describe("CTA retirable (data-slide-cta)", () => {
  const CTA = `${STYLE}<div style="width:1080px"><h1 data-slide-text="title">Avant de poster</h1><a data-slide-cta href="#"><span data-slide-text="cta">Réponds en commentaire</span></a></div>`;

  it("hasSlideCta détecte le bouton", () => {
    expect(hasSlideCta(CTA)).toBe(true);
    expect(hasSlideCta(`${STYLE}<div><h1 data-slide-text="title">Sans CTA</h1></div>`)).toBe(false);
  });

  it("getSlideCtaText renvoie le libellé du bouton", () => {
    expect(getSlideCtaText(CTA)).toBe("Réponds en commentaire");
  });

  it("removeSlideCta retire tout le bouton mais garde le reste + le <style>", () => {
    const out = removeSlideCta(CTA);
    expect(out).not.toBeNull();
    expect(out!).toContain("@import");
    expect(out!).toContain("Avant de poster");
    expect(out!).not.toContain("Réponds en commentaire");
    expect(out!).not.toContain("data-slide-cta");
  });

  it("removeSlideCta retourne null si aucun CTA (visuel inchangé)", () => {
    expect(removeSlideCta(`${STYLE}<div><h1>Rien</h1></div>`)).toBeNull();
  });
});
