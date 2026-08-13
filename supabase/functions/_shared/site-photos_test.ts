import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { extractImageCandidates, pickLargestFromSrcset } from "./site-photos.ts";

const BASE = "https://www.exemple-savonnerie.fr/";

// ── pickLargestFromSrcset ──

Deno.test("srcset : prend la variante la plus large", () => {
  const best = pickLargestFromSrcset("/img/a-400.jpg 400w, /img/a-1600.jpg 1600w, /img/a-800.jpg 800w");
  assertEquals(best?.url, "/img/a-1600.jpg");
  assertEquals(best?.width, 1600);
});

Deno.test("srcset avec descripteurs x : première URL, largeur inconnue", () => {
  const best = pickLargestFromSrcset("photo.jpg 1x, photo@2x.jpg 2x");
  assertEquals(best?.url, "photo.jpg");
  assertEquals(best?.width, null);
});

// ── extractImageCandidates ──

Deno.test("img simple : URL relative résolue en absolue, alt conservé", () => {
  const html = `<img src="/photos/atelier.jpg" alt="L'atelier">`;
  const imgs = extractImageCandidates(html, BASE);
  assertEquals(imgs.length, 1);
  assertEquals(imgs[0].url, "https://www.exemple-savonnerie.fr/photos/atelier.jpg");
  assertEquals(imgs[0].alt, "L'atelier");
});

Deno.test("og:image passe en premier, avant les img du document", () => {
  const html = `
    <meta property="og:image" content="https://cdn.site.fr/hero.jpg">
    <img src="/photos/produit.jpg">`;
  const imgs = extractImageCandidates(html, BASE);
  assertEquals(imgs[0].url, "https://cdn.site.fr/hero.jpg");
  assertEquals(imgs[1].url, "https://www.exemple-savonnerie.fr/photos/produit.jpg");
});

Deno.test("lazy-loading : data-src prime sur le src placeholder", () => {
  const html = `<img src="data:image/gif;base64,R0lGOD" data-src="/vraie-photo.jpg" alt="">`;
  const imgs = extractImageCandidates(html, BASE);
  assertEquals(imgs.length, 1);
  assertEquals(imgs[0].url, "https://www.exemple-savonnerie.fr/vraie-photo.jpg");
});

Deno.test("srcset dans <img> : la plus large gagne, le src est ignoré", () => {
  const html = `<img src="/small.jpg" srcset="/a-600.jpg 600w, /a-2000.jpg 2000w">`;
  const imgs = extractImageCandidates(html, BASE);
  assertEquals(imgs.length, 1);
  assertEquals(imgs[0].url, "https://www.exemple-savonnerie.fr/a-2000.jpg");
});

Deno.test("bruit écarté : logo, favicon, sprite, svg, gif, pixel 1x1", () => {
  const html = `
    <img src="/logo.png" alt="Logo">
    <img src="/assets/favicon.png">
    <img src="/img/sprite.png">
    <img src="/dessin.svg">
    <img src="/anim.gif">
    <img src="/track/1x1.png">
    <img src="/photos/vraie.jpg">`;
  const imgs = extractImageCandidates(html, BASE);
  assertEquals(imgs.length, 1);
  assertEquals(imgs[0].url, "https://www.exemple-savonnerie.fr/photos/vraie.jpg");
});

Deno.test("class=logo sur le tag suffit à écarter, même avec un nom neutre", () => {
  const html = `<img class="site-logo" src="/uploads/marque.png">`;
  assertEquals(extractImageCandidates(html, BASE).length, 0);
});

Deno.test("largeur déclarée < 200px = écartée ; sans attribut = gardée", () => {
  const html = `
    <img src="/petite.jpg" width="64" height="64">
    <img src="/hero.jpg">`;
  const imgs = extractImageCandidates(html, BASE);
  assertEquals(imgs.length, 1);
  assertEquals(imgs[0].url, "https://www.exemple-savonnerie.fr/hero.jpg");
});

Deno.test("dédup par chemin : les variantes ?format= comptent pour une", () => {
  const html = `
    <img src="https://images.squarespace-cdn.com/content/abc/photo.jpg?format=500w">
    <img src="https://images.squarespace-cdn.com/content/abc/photo.jpg?format=1500w">`;
  const imgs = extractImageCandidates(html, BASE);
  assertEquals(imgs.length, 1);
});

Deno.test("URL Wix : extension au milieu du chemin acceptée", () => {
  const html = `<img src="https://static.wixstatic.com/media/abc123.jpg/v1/fill/w_980/abc123.jpg">`;
  const imgs = extractImageCandidates(html, BASE);
  assertEquals(imgs.length, 1);
});

Deno.test("URL CDN opaque sans extension : gardée (un src d'img est une image)", () => {
  const html = `<img src="https://cdn.opaque.io/i/9f8e7d6c">`;
  assertEquals(extractImageCandidates(html, BASE).length, 1);
});

Deno.test("plafond à 60 candidates", () => {
  const many = Array.from({ length: 80 }, (_, i) => `<img src="/photos/p${i}.jpg">`).join("\n");
  assertEquals(extractImageCandidates(many, BASE).length, 60);
});
