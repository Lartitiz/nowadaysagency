/**
 * Attente « vivante » des carrousels photo et mixte (08/10/2026).
 *
 * Deux sondes en lecture seule, partagées par les specs live photo et mixte :
 *  - `tapCarouselSse` double le flux SSE de carousel-ai et horodate chaque
 *    étape annoncée par le serveur (writing, outline, draft, correcting…) et
 *    les durées par étape renvoyées dans `timings` ;
 *  - `watchWaitingScreen` note quand le plan envisagé puis la 1re slide en
 *    brouillon s'affichent, et capture l'écran d'attente pour le REGARDER.
 * Le flux de la page reste intact (tee).
 */
import type { Page } from "@playwright/test";

export async function tapCarouselSse(page: Page): Promise<void> {
  page.on("console", (m) => { if (m.text().startsWith("[SSE]")) console.log(`   ${m.text()}`); });
  await page.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = async (...args: any[]) => {
      const res = await orig.apply(window, args as any);
      const url = typeof args[0] === "string" ? args[0] : (args[0] as any)?.url || "";
      const edge = url.match(/functions\/v1\/(carousel-ai)/)?.[1];
      if (!edge || !res.body || !(res.headers.get("content-type") || "").includes("event-stream")) return res;
      const t0 = performance.now();
      const [forPage, forLog] = res.body.tee();
      (async () => {
        const reader = forLog.getReader(), decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            let ev: any = {};
            try { ev = JSON.parse(buffer.slice(0, end).replace(/^data: /, "")); } catch { /* fragment illisible */ }
            buffer = buffer.slice(end + 2);
            if (!ev.type || ev.type === "heartbeat") continue;
            let detail = ev.stage ? `:${ev.stage}` : "";
            if (ev.stage === "outline") detail += ` (${ev.titles?.length ?? 0} titres)`;
            if (ev.stage === "draft") detail += ` (${ev.slides?.length ?? 0} slides)`;
            if (ev.type === "done") {
              try { detail = ` durées=${JSON.stringify(JSON.parse(ev.full).timings || "non renvoyées")}`; } catch { /* done sans JSON */ }
            }
            console.log(`[SSE] ${edge} +${((performance.now() - t0) / 1000).toFixed(1)}s ${ev.type}${detail}`);
          }
        }
      })().catch(() => {});
      return new Response(forPage, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
  });
}

/** À appeler juste après le clic « Générer ». Ne bloque jamais la spec. */
export function watchWaitingScreen(page: Page, shotPrefix: string): void {
  const t0 = Date.now();
  const since = () => ((Date.now() - t0) / 1000).toFixed(1);
  page.getByTestId("carousel-outline").waitFor({ state: "visible", timeout: 180000 }).then(async () => {
    console.log(`⏲ 🗂️  PLAN envisagé affiché après ${since()}s`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${shotPrefix}-plan.png` });
  }).catch(() => console.log("⚠️ aucun plan envisagé affiché"));
  page.getByRole("list", { name: "Slides en cours d'écriture" }).locator("li").first().waitFor({ state: "visible", timeout: 300000 }).then(async () => {
    console.log(`⏲ ✏️  1re slide BROUILLON affichée après ${since()}s`);
    await page.waitForTimeout(15000);
    await page.screenshot({ path: `${shotPrefix}-brouillon.png` });
  }).catch(() => console.log("⚠️ aucune slide brouillon affichée"));
  page.getByTestId("publish-or-schedule").first().waitFor({ state: "visible", timeout: 800000 })
    .then(() => console.log(`⏲ 📝 RÉSULTAT affiché après ${since()}s`)).catch(() => {});
}
