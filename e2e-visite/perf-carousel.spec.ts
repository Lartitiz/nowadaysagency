/**
 * PERF — Chronométrage génération carrousel (mode texte, qualité normale)
 *
 * Mesure sur le site LIVE (compte Camille) le ressenti utilisateur :
 * clic Générer → texte affiché → visuels affichés.
 *
 * ⚠️ Les durées des requêtes /functions/v1/* loggées ici ne sont fiables QUE
 * pour les endpoints non-SSE : carousel-ai et carousel-visual répondent en
 * text/event-stream (les headers arrivent tout de suite, le body streame) —
 * seuls les jalons UI (⏲ ci-dessous) mesurent la vraie attente.
 *
 * Spec de diagnostic pour les DURÉES (aucune assertion de durée), MAIS depuis
 * le 09/07 il porte aussi la validation de contenu de l'EXPORT PPTX hybride
 * (desktop uniquement) : le carrousel généré ici est réutilisé — zéro crédit en
 * plus — pour télécharger le « PowerPoint — éditable » et l'ouvrir au jszip
 * (slides, fonds non vides, texte éditable, pas de label « Slide N » — les bugs
 * réels de #415/#420). LÀ il y a des assertions : un défaut = ROUGE export.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { exportAndCheckPptx } from "./pptx-export-check";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IDEA = "Pourquoi poster moins mais mieux change tout pour les solopreneurs";

type Timing = { url: string; start: number; end?: number; status?: number };

test("PERF — carrousel texte : durées par étape", async ({ page }) => {
  test.setTimeout(600_000); // 10 min

  const timings: Timing[] = [];
  const pending = new Map<string, Timing>();

  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/")) {
      const t: Timing = { url: req.url().split("/functions/v1/")[1].split("?")[0], start: Date.now() };
      pending.set(req.url() + req.method(), t);
      timings.push(t);
    }
  });
  page.on("response", (res) => {
    const t = pending.get(res.url() + res.request().method());
    if (t && !t.end) {
      t.end = Date.now();
      t.status = res.status();
      console.log(`⏱️  ${t.url} → ${res.status()} en ${((t.end - t.start) / 1000).toFixed(1)}s (headers — SSE streame après)`);
    }
  });

  // ── Décomposition de la phase texte (30/09) ──
  // Les jalons UI disent COMBIEN on attend, pas OÙ. On double donc le flux SSE
  // de carousel-ai / carousel-visual pour horodater chaque étape annoncée par le
  // serveur (writing, correcting…) et afficher les durées par étape que
  // carousel-ai renvoie dans `timings` (préparation, rédaction, juge du fil,
  // relecture, contrôle final). Lecture seule : le flux de la page est intact.
  page.on("console", (m) => { if (m.text().startsWith("[SSE]")) console.log(`   ${m.text()}`); });
  await page.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = async (...args: any[]) => {
      const res = await orig.apply(window, args as any);
      const url = typeof args[0] === "string" ? args[0] : (args[0] as any)?.url || "";
      const edge = url.match(/functions\/v1\/(carousel-[a-z-]+)/)?.[1];
      if (!edge || !res.body || !(res.headers.get("content-type") || "").includes("event-stream")) return res;
      const t0 = performance.now();
      const [forPage, forLog] = res.body.tee();
      (async () => {
        const reader = forLog.getReader(), decoder = new TextDecoder();
        let buffer = "", lastBeat = 0, ended = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            let ev: any = {};
            try { ev = JSON.parse(buffer.slice(0, end).replace(/^data: /, "")); } catch { /* fragment illisible : ignoré */ }
            buffer = buffer.slice(end + 2);
            if (ev.type === "heartbeat") lastBeat = performance.now();
            if (ev.type === "done" || ev.type === "error") ended = true;
            if (!ev.type || ev.type === "heartbeat") continue;
            let detail = ev.stage ? `:${ev.stage}` : "";
            if (ev.type === "done") {
              try {
                const full = JSON.parse(ev.full);
                const doc = JSON.parse((full.content || "").match(/\{[\s\S]*\}/)?.[0] || "{}");
                const review = doc.editorial_review;
                detail = ` durées=${JSON.stringify(full.timings || "non renvoyées")}` +
                  (review ? ` relecture=${JSON.stringify({ status: review.status, pass: review.pass, total_edits: review.total_edits, error: review.error, model: review.model })}` : "") +
                  (doc.progression_review ? ` fil=${JSON.stringify({ slides: doc.slides?.length, status: doc.progression_review.execution_status, verdict: doc.progression_review.verdict, defauts: (doc.progression_review.report?.defects || []).map((d: any) => `${d.severity}:${d.type}`), reparation: doc.progression_review.repair && { trigger: doc.progression_review.repair.trigger, accepted: doc.progression_review.repair.accepted, reason: doc.progression_review.repair.reason } })}` : "") +
                  (doc.structure_warnings?.length ? ` avertissements=${doc.structure_warnings.length}` : "");
              } catch { /* done sans JSON exploitable */ }
            }
            console.log(`[SSE] ${edge} +${((performance.now() - t0) / 1000).toFixed(1)}s ${ev.type}${detail}`);
          }
        }
        // Flux fermé sans done/error = l'edge a été coupée (durée, mémoire) :
        // le dernier battement de cœur date à peu près la coupure.
        if (!ended) console.log(`[SSE] ${edge} +${((performance.now() - t0) / 1000).toFixed(1)}s fin SANS done/error (dernier battement ${lastBeat ? `+${((lastBeat - t0) / 1000).toFixed(1)}s` : "aucun"})`);
      })().catch(() => {});
      return new Response(forPage, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
  });

  // ── Parcours /creer ──
  await page.goto("/creer", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();

  // Sélecteurs : data-testid d'abord (stables, posés le 28/09 après que le
  // renommage « Suivant » → « Continuer » + nouveau placeholder a cassé l'étape 1),
  // texte en repli tant que le site live n'a pas été re-publié avec les testids.
  const nextFormat = page.getByTestId("creer-format-next")
    .or(page.getByRole("button", { name: /^(suivant|continuer)$/i })).first();

  // Étape 1 : idée
  const textarea = page.getByTestId("creer-idea-input")
    .or(page.locator("#creation-idea"))
    .or(page.getByPlaceholder(/nouveauté|coulisses|raconte|idée|mot-clé|envie|partager/i)).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill(IDEA);
  await page.getByTestId("creer-idea-next")
    .or(page.getByRole("button", { name: /^(suivant|continuer)$/i })).first().click();

  // Étape 2 : Instagram → Carrousel → sous-mode « Texte design »
  const instagram = page.getByTestId("creer-channel-instagram")
    .or(page.getByRole("button", { name: /^instagram/i })).first();
  await expect(instagram).toBeVisible({ timeout: 15000 });
  await instagram.click();
  const carrouselCard = page.getByTestId("creer-format-carousel")
    .or(page.getByRole("button", { name: /^Carrousel\b/ })).first();
  await expect(carrouselCard).toBeVisible({ timeout: 15000 });
  await carrouselCard.click();
  const texteDesign = page.getByTestId("carousel-mode-text")
    .or(page.getByRole("button", { name: /^Texte design/i })).first();
  await expect(texteDesign).toBeVisible({ timeout: 10000 });
  await texteDesign.click();
  await expect(texteDesign).toHaveAttribute("aria-pressed", "true");
  await expect(nextFormat).toBeEnabled({ timeout: 5000 });
  await nextFormat.click();

  // Étape 3 (Précisions) : quitter l'étape Format est le vrai signal.
  const stepper = page.getByTestId("creer-stepper");
  await expect
    .poll(async () => {
      if (await stepper.count()) return await stepper.first().getAttribute("data-current-step");
      return (await page.getByText(/Étape 3 sur 4/i).first().isVisible().catch(() => false)) ? "brief" : "?";
    }, { timeout: 15000 })
    .not.toMatch(/^(idea|format|\?)$/);
  await page.screenshot({ path: "e2e-visite/shots/perf-carousel-etape3.png", fullPage: false });

  // Étape 3 : attendre les questions puis générer directement
  const genDir = page.getByTestId("creer-generate-direct")
    .or(page.getByRole("button", { name: /générer directement/i })).first();
  const genBtn = page.getByTestId("creer-questions-next")
    .or(page.getByRole("button", { name: /^générer\b/i })).first();
  await expect(genDir.or(genBtn).first()).toBeVisible({ timeout: 120000 });

  const tClickGen = Date.now();
  if (await genDir.isVisible().catch(() => false)) await genDir.click();
  else await genBtn.click();
  console.log("🚀 Clic Générer");

  // ⏲ Jalon TEXTE : les actions du résultat ("Publier ou programmer") ne
  // s'affichent qu'une fois la génération terminée (generating=false + result).
  await expect(page.getByTestId("publish-or-schedule").first()).toBeVisible({ timeout: 300000 });
  const tTextReady = Date.now();
  console.log(`⏲ 📝 TEXTE affiché après ${((tTextReady - tClickGen) / 1000).toFixed(1)}s`);

  // ⏲ Jalon VISUELS : deux rendus possibles des slides prêtes.
  //  - ancienne grille d'aperçus : une iframe srcDoc PAR slide (≥ 3) ;
  //  - éditeur de carrousel (502b740d, 11/09) : UNE iframe pour la slide active
  //    + une vignette numérotée par slide dans la barre « Slides du carrousel ».
  // Attendre seulement « ≥ 3 iframes » a tenu la spec 10 min en échec le 12/09
  // alors que le carrousel était bien généré et affiché.
  await page.waitForFunction(() => {
    if (document.querySelectorAll("iframe").length >= 3) return true;
    const vignettes = document.querySelectorAll('[aria-label="Slides du carrousel"] > button').length;
    return vignettes >= 3 && document.querySelectorAll("iframe").length >= 1;
  }, { timeout: 300000 });
  const tVisualsReady = Date.now();
  console.log(`⏲ 🖼️  VISUELS affichés après ${((tVisualsReady - tClickGen) / 1000).toFixed(1)}s depuis le clic (+${((tVisualsReady - tTextReady) / 1000).toFixed(1)}s après le texte)`);

  // Capture : l'éditeur apparaît en fondu et l'aperçu (iframe srcdoc) peint après
  // les vignettes — le 28/09 la capture montrait une slide BLANCHE alors que le
  // carrousel était bon. On attend du texte DANS l'aperçu, puis on le cadre.
  await page.waitForFunction(() =>
    [...document.querySelectorAll("iframe")].some((f) => (f.contentDocument?.body?.innerText || "").trim().length > 0),
  null, { timeout: 30000 }).catch(() => console.log("⚠️ aucun aperçu de slide avec du texte après 30 s — regarder la capture"));
  await page.locator("iframe").first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1500); // fin du fondu d'entrée de l'éditeur
  await page.screenshot({ path: "e2e-visite/shots/perf-carousel-final.png", fullPage: false });

  // ── Récap ──
  console.log("\n═══ RÉCAP DES APPELS EDGE (headers) ═══");
  for (const t of timings) {
    const dur = t.end ? ((t.end - t.start) / 1000).toFixed(1) + "s" : "(sans réponse)";
    console.log(`  ${t.url} [${t.status ?? "?"}] : ${dur}`);
  }
  console.log(`\n⏲ Ressenti utilisateur : texte à ${((tTextReady - tClickGen) / 1000).toFixed(1)}s, visuels à ${((tVisualsReady - tClickGen) / 1000).toFixed(1)}s`);

  // ── EXPORT PPTX hybride : validation de CONTENU (desktop uniquement) ──────
  // Réutilise le carrousel qui vient d'être généré (zéro crédit en plus).
  if (test.info().project.name !== "desktop") {
    console.log("Export PPTX : validé en desktop uniquement — étape sautée sur ce projet.");
    return;
  }
  // Nombre de slides affichées : vignettes de l'éditeur s'il est là, sinon
  // les aperçus srcdoc de l'ancienne grille.
  const vignettes = await page.locator('[aria-label="Slides du carrousel"] > button').count();
  const uiSlides = vignettes || (await page.locator("iframe").count());

  // backgroundIsDecorative : l'export hybride « éditable » pose le texte en NATIF
  // par-dessus le fond → un fond APLAT (blanc/primaire de l'alternance) est légitime
  // tant que la slide porte du texte. Sans ça, un tirage sur fond uni était flaggé à
  // tort « fond raté » (faux positif ~1 jour/3 selon la génération — cf. 21/07).
  const report = await exportAndCheckPptx(page, __dirname, {
    format: "carrousel_texte_design",
    outName: "export-carousel-hybride.pptx",
    shotName: "export-pptx-fond.png",
    validate: { minSlides: 3, expectEditableText: true, backgroundIsDecorative: true },
  });
  if (report.slideCount !== uiSlides) {
    // Informational : d'autres iframes peuvent exister sur la page — ne casse pas seul.
    console.log(`ℹ️ slides PPTX (${report.slideCount}) ≠ iframes UI (${uiSlides}) — à regarder si ça diverge fort.`);
  }
  console.log("✅ Export PPTX hybride (texte) : contenu validé (zip, slides, fonds, texte éditable, pas de label technique).");
});
