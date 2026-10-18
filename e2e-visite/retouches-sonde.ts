/**
 * Sondes des retouches du carrousel (18/10/2026, accord de Laetitia, après #1767 et #1763).
 *
 * Appelées TOUT À LA FIN du carrousel texte figé (contenus-figes.spec.ts), déjà rejoué
 * chaque matin sans crédit. Elles n'échouent jamais : chacune écrit une ligne lue par la
 * visite du matin (consigne 7sexdecies) :
 *   📝 Modifier le texte ✅ (slide 2 corrigée, 13 autres inchangées, Annuler ✅)
 *   🗓️ Calendrier suit les retouches ✅ (mis à jour en 14 s) · 🧹 OK
 *
 * Pourquoi :
 *  - « Plus d'options › Modifier le texte » (chantier X, #1767) pose chaque correction dans
 *    sa slide sans toucher au design. Les tests CI vérifient la fonction, rien ne
 *    regardait le site en ligne (menu caché, fenêtre vide, mot posé dans la mauvaise slide).
 *  - Une retouche faite après « Garder au calendrier » part toute seule au calendrier tant
 *    que le contenu n'est pas publié (chantier Y, #1763). Avant, le calendrier gardait
 *    l'ancienne version sans rien dire, et aucune routine ne refaisait ce chemin.
 *
 * Le contenu de test posé au calendrier de Camille est TOUJOURS supprimé à la fin (ligne
 * du calendrier, fiches créées en route, images du dossier calendar-visuals), même en échec.
 */
import type { Locator, Page } from "@playwright/test";
import { configSupabase, supprimeLignesCreees, traceurDeCreations } from "./nettoyage-camille";

const vignettes = (page: Page) => page.locator('[aria-label="Slides du carrousel"] > button');

/** Texte de chaque vignette (une iframe par slide), dans l'ordre. */
const texteVignettes = (page: Page) =>
  vignettes(page).evaluateAll((boutons) => boutons.map((b) => {
    const f = b.querySelector("iframe") as HTMLIFrameElement | null;
    try { return (f?.contentDocument?.body?.innerText || "").replace(/\s+/g, " ").trim(); } catch { return ""; }
  }));

/** Attend que l'élément s'affiche (isVisible ne patiente pas). */
const visible = (l: Locator, timeout: number) => l.waitFor({ state: "visible", timeout }).then(() => true, () => false);

const court = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 90);

/** Remplace le premier mot d'au moins 5 lettres par `mot` (null : aucun mot assez long). */
function corrige(texte: string, mot: string): string | null {
  const m = texte.match(/[A-Za-zÀ-ÿ]{5,}/);
  return m ? texte.replace(m[0], mot) : null;
}

/**
 * « Plus d'options › Modifier le texte » : corrige un mot de la slide `index` (0 = slide 1)
 * et enregistre. Renvoie le mot posé. Jette avec un message court si le parcours casse.
 */
async function corrigeUnMot(page: Page, index: number, mot: string) {
  await page.getByTestId("more-actions").first().click();
  const item = page.getByTestId("carousel-edit-text");
  if (!(await visible(item, 5000))) throw new Error("« Modifier le texte » absent du menu « Plus d'options »");
  await item.click();
  const fenetre = page.getByTestId("carousel-text-list");
  if (!(await visible(fenetre, 8000))) throw new Error("la fenêtre « Modifier le texte » ne s'ouvre pas");
  const champ = fenetre.locator(`section[aria-label="Slide ${index + 1}"] textarea:not([disabled])`).first();
  if (!(await champ.count())) throw new Error(`pas de texte modifiable sur la slide ${index + 1}`);
  const avant = await champ.inputValue();
  const apres = corrige(avant, mot);
  if (!apres) throw new Error(`pas de mot à corriger sur la slide ${index + 1}`);
  await champ.fill(apres);
  await fenetre.getByRole("button", { name: "Enregistrer le texte" }).click();
  await fenetre.waitFor({ state: "hidden", timeout: 5000 });
}

/** 📝 « Modifier le texte » : un mot corrigé arrive dans SA slide, les autres ne bougent pas, Annuler le retire. */
export async function sondeModifierTexte(page: Page) {
  const MOT = "Sondemot";
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    const avant = await texteVignettes(page);
    if (avant.length < 3) throw new Error(`${avant.length} vignette(s) lisible(s)`);
    const cible = 1; // slide 2 : ni la couverture ni la dernière
    await corrigeUnMot(page, cible, MOT);
    let apres = avant;
    for (let i = 0; i < 20 && !apres[cible]?.includes(MOT); i++) {
      await page.waitForTimeout(500);
      apres = await texteVignettes(page);
    }
    const bougees = avant.map((t, i) => (i !== cible && apres[i] !== t ? i + 1 : 0)).filter(Boolean);
    const recu = !!apres[cible]?.includes(MOT);
    // « Annuler » du message : toute la correction repart d'un coup.
    let annule = "pas essayé";
    const annuler = page.locator("[data-sonner-toast]").filter({ hasText: "Texte mis à jour dans tes slides" }).getByRole("button", { name: "Annuler" });
    if (await visible(annuler, 3000)) {
      await annuler.click();
      let retour = await texteVignettes(page);
      for (let i = 0; i < 20 && retour[cible] !== avant[cible]; i++) {
        await page.waitForTimeout(500);
        retour = await texteVignettes(page);
      }
      annule = retour[cible] === avant[cible] ? "✅" : "❌";
    } else annule = "❌ (bouton absent du message)";
    const ok = recu && !bougees.length && annule === "✅";
    const detail = [
      recu ? `slide ${cible + 1} corrigée` : `mot absent du visuel de la slide ${cible + 1}`,
      bougees.length ? `slide(s) ${bougees.join(", ")} changée(s) aussi` : `${avant.length - 1} autres inchangées`,
      `Annuler ${annule}`,
    ].join(", ");
    console.log(`📝 Modifier le texte ${ok ? "✅" : "❌"} (${detail})${ok ? "" : " 🟠"}`);
  } catch (e) {
    console.log(`📝 Modifier le texte ❌ (${court(e)}) 🟠`);
  } finally {
    await page.keyboard.press("Escape").catch(() => {});
  }
}

/** Jeton et identifiant de la session du navigateur (aucun mot de passe). */
async function sessionDuNavigateur(page: Page): Promise<{ token: string; userId: string } | null> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (!/^sb-.*-auth-token$/.test(k)) continue;
      try {
        const s = JSON.parse(localStorage.getItem(k) || "null");
        if (s?.access_token && s?.user?.id) return { token: s.access_token as string, userId: s.user.id as string };
      } catch { /* suivante */ }
    }
    return null;
  }).catch(() => null);
}

/** Supprime la ligne du calendrier et ses images (dossier `<user>/<post>/` de calendar-visuals). */
async function effaceContenuCalendrier(postId: string, auth: { token: string; userId: string } | null, autres: Awaited<ReturnType<ReturnType<typeof traceurDeCreations>["collectees"]>>) {
  const lignes = [...autres.filter((l) => !(l.table === "calendar_posts" && l.id === postId)), { table: "calendar_posts", id: postId }];
  const { url, anon } = configSupabase();
  let images = "images non vérifiées";
  if (auth && url && anon) {
    const h = { apikey: anon, Authorization: `Bearer ${auth.token}`, "content-type": "application/json" };
    try {
      // Images rangées par version : `<user>/<post>/slides/<version>/slide-N.jpg`.
      const chemins: string[] = [];
      const parcours = async (dossier: string, profondeur: number) => {
        const r = await fetch(`${url}/storage/v1/object/list/calendar-visuals`, { method: "POST", headers: h, body: JSON.stringify({ prefix: dossier, limit: 200 }), signal: AbortSignal.timeout(15_000) });
        const liste = r.ok ? await r.json() : [];
        for (const o of Array.isArray(liste) ? liste : []) {
          if (!o?.name) continue;
          if (o.id) chemins.push(`${dossier}/${o.name}`);
          else if (profondeur < 3) await parcours(`${dossier}/${o.name}`, profondeur + 1);
        }
      };
      await parcours(`${auth.userId}/${postId}`, 0);
      if (chemins.length) {
        const r = await fetch(`${url}/storage/v1/object/calendar-visuals`, { method: "DELETE", headers: h, body: JSON.stringify({ prefixes: chemins }), signal: AbortSignal.timeout(15_000) });
        images = r.ok ? `${chemins.length} image(s)` : `images KO ${r.status}`;
      } else images = "0 image";
    } catch (e) {
      images = `images KO ${court(e).slice(0, 40)}`;
    }
    // Lignes : avec le jeton du navigateur d'abord (pas de mot de passe), sinon le nettoyage commun.
    const echecs: string[] = [];
    for (const l of [...lignes].reverse()) {
      const r = await fetch(`${url}/rest/v1/${l.table}?id=eq.${l.id}`, { method: "DELETE", headers: { ...h, Prefer: "return=representation" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (!r?.ok) echecs.push(l.table);
    }
    if (!echecs.length) return `OK (${lignes.map((l) => l.table).join(", ")} · ${images})`;
  }
  return `${await supprimeLignesCreees(lignes)} · ${images}`;
}

/**
 * 🗓️ « Garder au calendrier », puis rouvrir depuis le calendrier (« Modifier le carrousel »),
 * corriger un mot : « Mis à jour dans ton calendrier » doit s'afficher et le contenu du
 * calendrier doit porter le mot. Le contenu de test est supprimé à la fin, toujours.
 */
export async function sondeCalendrierSuit(page: Page) {
  const MOT = "Sondecalendrier";
  const debut = Date.now();
  const traceur = traceurDeCreations();
  traceur.branche(page);
  let postId: string | null = null;
  // Filet : l'identifiant part dans l'appel de création, avant même la redirection.
  page.on("request", (r) => {
    if (postId || !r.url().includes("/rpc/save_calendar_content")) return;
    try { const b = r.postDataJSON(); if (b?.p_create && typeof b.p_post_id === "string") postId = b.p_post_id; } catch { /* rien */ }
  });
  let ligne = "";
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, 0));
    // 1. Garder au calendrier, sans publication.
    await page.getByTestId("publish-or-schedule").first().click();
    const brouillon = page.getByTestId("publish-draft-option");
    if (!(await visible(brouillon, 8000))) throw new Error("« Garder au calendrier » absent");
    await brouillon.click();
    await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await page.waitForURL(/\/calendrier\?.*post=/, { timeout: 60_000 }).catch(() => {});
    traceur.ajouteDepuisUrl(page.url());
    postId ||= page.url().match(/[?&]post=([0-9a-f-]{36})/i)?.[1] || null;
    if (!postId) throw new Error("contenu pas posé au calendrier (pas de redirection)");

    // 2. Rouvrir depuis le calendrier.
    const modifier = page.getByRole("button", { name: /Modifier le carrousel/ }).first();
    if (!(await visible(modifier, 20_000))) throw new Error("« Modifier le carrousel » absent de la fiche du calendrier");
    await modifier.click();
    await vignettes(page).first().waitFor({ timeout: 60_000 });
    const suivi = page.getByTestId("calendar-follow-status");
    if (!(await visible(suivi.filter({ hasText: "tes retouches y iront toutes seules" }), 30_000))) {
      throw new Error(`éditeur rouvert sans suivi du calendrier (« ${(await suivi.innerText().catch(() => "rien")).slice(0, 60)} »)`);
    }

    // 3. Une retouche : un mot de la slide 1.
    await corrigeUnMot(page, 0, MOT);
    const t0 = Date.now();
    const misAJour = await suivi.filter({ hasText: "Mis à jour dans ton calendrier" }).waitFor({ timeout: 90_000 }).then(() => true, () => false);
    const secondes = Math.round((Date.now() - t0) / 1000);
    if (!misAJour) throw new Error(`pas de « Mis à jour dans ton calendrier » après 90 s (« ${(await suivi.innerText().catch(() => "rien")).slice(0, 70)} »)`);

    // 4. Le contenu du calendrier porte la retouche (lu en base).
    const auth = await sessionDuNavigateur(page);
    const { url, anon } = configSupabase();
    if (!auth || !url || !anon) throw new Error("session du navigateur illisible : contenu du calendrier non vérifié");
    const r = await fetch(`${url}/rest/v1/calendar_posts?id=eq.${postId}&select=story_sequence_detail,media_urls,status`, { headers: { apikey: anon, Authorization: `Bearer ${auth.token}` }, signal: AbortSignal.timeout(15_000) });
    const post = r.ok ? (await r.json())?.[0] : null;
    const html = JSON.stringify(post?.story_sequence_detail?.visual_html || []);
    if (!post) throw new Error("contenu du calendrier introuvable en base");
    if (!html.includes(MOT)) throw new Error(`« Mis à jour » affiché mais la retouche n'est pas dans le calendrier`);
    // Seuil : 16 à 18 s le 18/10/2026 ; au-delà d'une minute, quelque chose ralentit l'envoi.
    ligne = `🗓️ Calendrier suit les retouches ✅ (mis à jour en ${secondes} s, ${post.media_urls?.length ?? 0} visuels)${secondes > 60 ? " lent 🟠" : ""}`;
  } catch (e) {
    ligne = `🗓️ Calendrier suit les retouches ❌ (${court(e)}) 🟠`;
  } finally {
    let menage = "rien à supprimer";
    if (postId) {
      try {
        menage = await effaceContenuCalendrier(postId, await sessionDuNavigateur(page), await traceur.collectees());
      } catch (e) {
        menage = `KO ${court(e).slice(0, 50)} : laissé au calendrier`;
      }
    }
    if (postId && !menage.startsWith("OK")) menage += ` (contenu ${postId})`;
    console.log(`${ligne} · ${Math.round((Date.now() - debut) / 1000)} s · 🧹 ${menage}`);
  }
}
