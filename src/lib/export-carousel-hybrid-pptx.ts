import { exportFileName } from "./export-file-name";
import { inlineCarouselMedia, inlineSlidesMedia } from "./carousel-media";
import { ExportImageError } from "./export-image-readiness";
import { promoteMixedText } from "./pptx-mixed-text";
import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas-pro";
import * as Sentry from "@sentry/react";
import { RENDER_CONCURRENCY } from "@/lib/export-budget";
import { normalizeHex, pxToInches, extractEditableBlocks, extractAnnotatedBlocks, extractShapeBlocks, extractHeuristicShapes, extractGradientDecoZones, extractStandaloneEmojiZones, type ShapeBlock } from "./pptx-font-mapping";
import { fetchLogoAsBase64 } from "./export-logo";
import {
  type HybridCharter,
  SLIDE_W_PX,
  SLIDE_H_PX,
  type BlockRender,
  PX_PER_IN,
  PPTX_W_IN,
  PPTX_H_IN,
  type VisualSlide,
  type SlideData,
  type OriginalPhoto,
  type PhotoZone,
} from "./export-carousel-hybrid/types";
import { measureImageNatural, cropToRatioBase64 } from "./export-carousel-hybrid/photo-crop";
import { extractPhotoZones, type ClearedBackdrop, stripDataUrlsFromBackground, clearOpaqueBackdropsBehindZone } from "./export-carousel-hybrid/photo-zones";
import { type ScrimSpec, parseScrimStyle, burnScrimsIntoPhoto } from "./export-carousel-hybrid/scrims";
import { findOverlayElement, blockFromElement } from "./export-carousel-hybrid/text-blocks";
import { mountIframe, waitReady } from "./export-carousel-hybrid/iframe";
import { MAX_GRADIENT_CAPTURES, raceTimeout, RASTER_SCALE, MAX_EMOJI_CAPTURES, renderEmojiImage, captureBody } from "./export-carousel-hybrid/capture";
import { desiredTextWidthIn, addBlockToSlide } from "./export-carousel-hybrid/text-layout";
export { isMonoFont, desiredTextWidthIn, parentCardOf, verticalBudgetPx, maxFitPt, addBlockToSlide } from "./export-carousel-hybrid/text-layout";

export { findOverlayElement, applyTextTransform } from "./export-carousel-hybrid/text-blocks";

export { type OriginalPhoto, type PhotoZone, type HybridCharter, type BlockRender, type BlockLayoutContext } from "./export-carousel-hybrid/types";
export { type ScrimSpec, parseScrimStyle } from "./export-carousel-hybrid/scrims";
export { stripDataUrlsFromBackground, extractPhotoZones, type ClearedBackdrop, zoneCoversRect, zoneOverlapsRect, clearOpaqueBackdropsBehindZone } from "./export-carousel-hybrid/photo-zones";

// ---------------------------------------------------------------------------
// main export
// ---------------------------------------------------------------------------

export async function exportCarouselHybridPptx(
  visualSlides: VisualSlide[],
  slidesData: SlideData[] | null | undefined,
  charter: HybridCharter | null | undefined,
  fileName = "carrousel-editable",
  originalPhotos?: OriginalPhoto[],
  logoUrl?: string | null,
  opts?: {
    returnBlob?: boolean;
    /** Appelé après chaque slide rastérisée, pour un avancement visible. */
    onProgress?: (faites: number, total: number) => void;
  },
): Promise<Blob | void> {
  // Photos rangées à part (liens) : remises en data URL, dont dépend le
  // repérage des zones photo ; une photo d'origine retrouvée par son seul
  // lien (base64 vide) est rechargée de la même façon.
  visualSlides = await inlineSlidesMedia(visualSlides);
  if (originalPhotos) originalPhotos = await Promise.all(originalPhotos.map(async (photo: OriginalPhoto & { preview?: string }) =>
    photo && !photo.base64 && photo.preview?.includes("/carousel-media/")
      ? { ...photo, base64: await inlineCarouselMedia(photo.preview) }
      : photo));
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "INSTAGRAM", width: PPTX_W_IN, height: PPTX_H_IN });
  pptx.layout = "INSTAGRAM";
  pptx.author = "L'Assistant Com'";

  // Pré-charge le logo une seule fois (sera ajouté en top layer sur chaque slide)
  const logoBase64 = await fetchLogoAsBase64(logoUrl);
  const logoSize = logoBase64 ? await measureImageNatural(logoBase64) : null;

  // Cache des recadrages photo, clé par (photoIndex + ratio cadre arrondi).
  // Une même photo peut servir plusieurs cadres de ratios différents → on cache par ratio.
  const cropCache = new Map<string, string | null>();




  // Pré-création des slides DANS L'ORDRE → l'ordre du carrousel est figé, même si les
  // rendus (parallélisés plus bas) se terminent dans le désordre.
  const slideObjs = visualSlides.map(() => pptx.addSlide());

  async function renderSlideAt(i: number) {
    const vs = visualSlides[i];
    const data = slidesData?.find((s) => s.slide_number === vs.slide_number) || slidesData?.[i];
    const slide = slideObjs[i];
    const tSlide0 = performance.now(); // perf instrumentation
    const perf: Record<string, number> = {}; // perf instrumentation (sous-phases)

    const iframe = await mountIframe(vs.html, charter);
    perf.mount = Math.round(performance.now() - tSlide0);
    try {
      const tReady = performance.now();
      await waitReady(iframe);
      perf.waitReady = Math.round(performance.now() - tReady);
      const doc = iframe.contentDocument!;
      const win = doc.defaultView!;

      promoteMixedText(doc);
      const blocks: BlockRender[] = [];

      // ---- Strategy A (priority): explicit [data-pptx-editable] annotations
      const annotated = extractAnnotatedBlocks(doc);
      if (annotated.length > 0) {
        for (const ab of annotated) {
          if (ab.rect.y > SLIDE_H_PX || ab.rect.x > SLIDE_W_PX) continue;
          if (ab.rect.y + ab.rect.h < 0) continue;
          blocks.push({ el: ab.el, text: ab.text, runs: ab.runs, rect: ab.rect, style: ab.style, kind: ab.kind });
          (ab.el as HTMLElement).setAttribute("data-pptx-hide", "true");
        }
      } else {
        // ---- Strategy B (fallback) : short overlay_text on photo slides
        const overlayText = (data?.overlay_text || "").trim();
        if (overlayText && overlayText.length <= 200) {
          const el = findOverlayElement(doc, overlayText);
          if (el) {
            const blk = blockFromElement(el, doc, "overlay");
            if (blk) {
              blk.text = overlayText;
              blocks.push(blk);
              el.setAttribute("data-pptx-hide", "true");
            }
          }
        } else {
          // ---- Strategy C (fallback) : heuristic detection
          const detected = extractEditableBlocks(doc, {
            minFontPx: 20,
            minTextLen: 3,
            maxBlocks: 8,
          });
          for (const eb of detected) {
            if (eb.rect.y > SLIDE_H_PX || eb.rect.x > SLIDE_W_PX) continue;
            if (eb.rect.y + eb.rect.h < 0) continue;
            blocks.push({ el: eb.el, text: eb.text, rect: eb.rect, style: eb.style, kind: eb.kind });
            (eb.el as HTMLElement).setAttribute("data-pptx-hide", "true");
          }
        }
      }

      // ---- FILET texte : balaye le texte visible NON encore capturé.
      // Strategy A est "tout ou rien" : dès qu'un bloc est annoté data-pptx-editable,
      // les légendes/textes NON annotés restaient cuits dans le PNG (non éditables).
      // On complète donc avec le détecteur heuristique (déjà éprouvé en Strategy C),
      // en n'ajoutant QUE ce qui n'a pas déjà été capturé (data-pptx-hide).
      const supplementalText = extractEditableBlocks(doc, {
        minFontPx: 12,
        minTextLen: 2,
        maxBlocks: 16,
        skipAnnotated: true,
      });
      for (const eb of supplementalText) {
        if (eb.rect.y > SLIDE_H_PX || eb.rect.x > SLIDE_W_PX) continue;
        if (eb.rect.y + eb.rect.h < 0) continue;
        // Déjà capturé par Strategy A/B/C (le texte porte alors data-pptx-hide).
        if ((eb.el as HTMLElement).closest('[data-pptx-hide="true"]')) continue;
        // CONTENEUR d'un bloc déjà capturé : son textContent répète le texte du
        // descendant annoté/capturé → deux calques superposés dans le PPTX (vu en
        // prod : eyebrow annoté "caption" + son wrapper pleine largeur re-capturé
        // ici). On saute le conteneur ; son éventuel texte propre reste cuit dans
        // le PNG de fond (visible, juste non éditable) — échec sûr.
        if ((eb.el as HTMLElement).querySelector('[data-pptx-editable],[data-pptx-hide="true"]')) continue;
        blocks.push({ el: eb.el, text: eb.text, rect: eb.rect, style: eb.style, kind: eb.kind });
        (eb.el as HTMLElement).setAttribute("data-pptx-hide", "true");
      }

      // ---- Strategy D : extract structural shapes (background, card, pill, highlight)
      // Doit s'exécuter APRÈS extractAnnotatedBlocks (qui pose data-pptx-hide sur les
      // textes — sans impact sur la géométrie des shapes parents) et AVANT captureBody.
      // Le CSS [data-pptx-hide="true"] *  ne touche PAS aux background-color, donc lire
      // cs.backgroundColor sur un parent shape reste valide.
      const SHAPE_CAP_PER_SLIDE = 20;
      // Annotés (data-pptx-shape) + FILET heuristique (traits/barres + pastilles
      // non annotés). Les heuristiques passent par le même pipeline de masquage
      // (data-pptx-shape-hide) et de rendu natif que les annotés.
      const allShapes = [...extractShapeBlocks(doc), ...extractHeuristicShapes(doc)];
      const usableShapes: ShapeBlock[] = [];
      for (const sb of allShapes) {
        if (sb.type !== "background") {
          if (sb.rect.y > SLIDE_H_PX || sb.rect.x > SLIDE_W_PX) continue;
          if (sb.rect.y + sb.rect.h < 0 || sb.rect.x + sb.rect.w < 0) continue;
        }
        usableShapes.push(sb);
      }
      if (usableShapes.length > SHAPE_CAP_PER_SLIDE) {
        console.warn(`[hybrid] ${usableShapes.length} shapes annotés sur slide ${vs.slide_number}, capé à ${SHAPE_CAP_PER_SLIDE}`);
        // On garde priorité à background + plus grands shapes (les plus visibles)
        usableShapes.sort((a, b) => {
          if (a.type === "background") return -1;
          if (b.type === "background") return 1;
          return b.rect.w * b.rect.h - a.rect.w * a.rect.h;
        });
        usableShapes.length = SHAPE_CAP_PER_SLIDE;
      }
      for (const sb of usableShapes) {
        (sb.el as HTMLElement).setAttribute("data-pptx-shape-hide", "true");
      }

      // ---- Dégradés déco → IMAGES séparées déplaçables (décision produit).
      // pptxgenjs ne fait pas de fond dégradé natif : au lieu de laisser ces éléments
      // cuits dans le PNG de fond monolithique, on capture chacun en image indépendante
      // (déplaçable dans Canva). On capture AVANT de masquer (sinon l'élément est vidé) ;
      // en cas d'échec on NE masque PAS → l'élément reste dans le fond = sûr (pas de trou).
      const gradientImages: { data: string; x: number; y: number; w: number; h: number }[] = [];
      // Plafonné aux N plus GRANDES zones (les plus visibles) : chaque capture est
      // une passe html2canvas (re-clone DOM complet) → coût qui explose sinon sur
      // les slides-schéma. Le reste est laissé cuit dans le fond (sûr, juste non
      // déplaçable individuellement dans Canva).
      // Court-circuit perf : si plafond = 0, on saute TOUT (même le DOM-walk) → les
      // dégradés restent cuits dans le PNG de fond (rendu identique). C'était le goulot.
      const gradientZones = MAX_GRADIENT_CAPTURES > 0
        ? [...extractGradientDecoZones(doc)]
            .sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)
            .slice(0, MAX_GRADIENT_CAPTURES)
        : [];
      for (const gz of gradientZones) {
        try {
          const gcanvas = await raceTimeout(
            html2canvas(gz.el, {
              scale: RASTER_SCALE,
              backgroundColor: null,
              useCORS: true,
              allowTaint: true,
              logging: false,
              imageTimeout: 8000,
            }),
            15000,
            null,
          );
          if (!gcanvas) continue; // capture trop longue → laissé cuit dans le fond (sûr)
          const gdata = gcanvas.toDataURL("image/png");
          if (!gdata || gdata.length < 64) continue; // capture vide → laissé cuit (sûr)
          const x = Math.max(0, pxToInches(gz.rect.x, PX_PER_IN));
          const y = Math.max(0, pxToInches(gz.rect.y, PX_PER_IN));
          const w = Math.min(PPTX_W_IN - x, pxToInches(gz.rect.w, PX_PER_IN));
          const h = Math.min(PPTX_H_IN - y, pxToInches(gz.rect.h, PX_PER_IN));
          if (w <= 0 || h <= 0) continue;
          // Succès → masquer du PNG de fond (data-pptx-shape-hide vide background/bg-image)
          // puis mémoriser pour pose en couche séparée après le fond.
          (gz.el as HTMLElement).setAttribute("data-pptx-shape-hide", "true");
          gradientImages.push({ data: gdata, x, y, w, h });
        } catch (e) {
          console.warn("[hybrid] capture dégradé déco échouée, laissé dans le fond", e);
        }
      }

      // ---- Emojis ISOLÉS → petite image détourée déplaçable (au lieu d'un texte-emoji
      // que Canva rastérise à l'import). Rendu via canvas 2D `fillText` (PAS html2canvas
      // → aucun clone DOM, coût négligeable). Les emojis COLLÉS à du texte restent en
      // texte éditable (gérés par les blocs texte, pas ici). On rend AVANT de masquer ;
      // en cas d'échec de rendu on NE masque PAS → l'emoji reste cuit dans le fond (sûr).
      const emojiImages: { data: string; x: number; y: number; w: number; h: number }[] = [];
      const emojiZones = extractStandaloneEmojiZones(doc).slice(0, MAX_EMOJI_CAPTURES);
      for (const ez of emojiZones) {
        // Anti-doublon : un emoji déjà à l'intérieur d'un bloc texte capturé (annoté ou
        // via le filet → l'ancêtre porte data-pptx-hide) est rendu en texte natif. On
        // tourne APRÈS les passes texte, donc ce test attrape ces cas → pas de double.
        if (ez.el.closest('[data-pptx-hide="true"]')) continue;
        const rendered = renderEmojiImage(ez, RASTER_SCALE);
        if (!rendered) continue; // emoji non rendu → laissé dans le fond (sûr)
        const x = Math.max(0, pxToInches(rendered.x, PX_PER_IN));
        const y = Math.max(0, pxToInches(rendered.y, PX_PER_IN));
        const w = Math.min(PPTX_W_IN - x, pxToInches(rendered.w, PX_PER_IN));
        const h = Math.min(PPTX_H_IN - y, pxToInches(rendered.h, PX_PER_IN));
        if (w <= 0 || h <= 0) continue;
        // Succès → masquer l'emoji du PNG de fond (visibility : préserve le layout, et
        // cache bien un emoji COULEUR, contrairement à color:transparent qui ne le
        // masquerait pas) puis mémoriser pour pose en image séparée après le fond.
        ez.el.style.setProperty("visibility", "hidden", "important");
        emojiImages.push({ data: rendered.data, x, y, w, h });
      }

      // ---- Photo zones extraction + filtering on availability
      // Si originalPhotos n'est pas fourni → usableZones vide → fallback total :
      // les photos restent visibles dans le rasterisé (comportement legacy).
      // Edited photos carry their final source/crop/zoom in HTML. Replacing them
      // with a numbered original would undo the user's framing or even use an
      // unrelated replacement asset. Keep that exact photo raster; text stays native.
      const allZones = (data as any)?.editor_id ? [] : extractPhotoZones(doc, (data as any)?.photo_index);
      const usableZones: PhotoZone[] = [];
      for (const zone of allZones) {
        let photo = originalPhotos?.[zone.photoIndex - 1];
        if (!photo?.base64 && originalPhotos && originalPhotos.length > 0 && originalPhotos[0]?.base64) {
          // Index orphelin : même repli que l'aperçu (photo 1). Sans lui, la zone
          // était droppée → la racine charbon des gabarits composés n'était jamais
          // neutralisée ni recouverte → slide entièrement noire en export.
          try {
            Sentry.captureMessage("[hybrid] photo native introuvable → repli photo 1", {
              level: "warning",
              extra: {
                photoIndex: zone.photoIndex,
                slideNumber: vs.slide_number,
                providedCount: originalPhotos.length,
              },
            });
          } catch {
            /* Sentry non initialisé : noop */
          }
          zone.photoIndex = 1;
          photo = originalPhotos[0];
        }
        if (!photo?.base64) {
          // Pas de photo native dispo : on warn (P4) seulement si l'appelant a tenté
          // de fournir des photos (sinon c'est juste le mode legacy).
          if (originalPhotos && originalPhotos.length > 0) {
            try {
              Sentry.captureMessage("[hybrid] photo native introuvable", {
                level: "warning",
                extra: {
                  photoIndex: zone.photoIndex,
                  slideNumber: vs.slide_number,
                  providedCount: originalPhotos.length,
                },
              });
            } catch {
              /* Sentry non initialisé : noop */
            }
          }
          continue;
        }
        usableZones.push(zone);
      }

      // ---- Mask usable zones in iframe so captureBody produit du transparent dessus
      // Fond opaque derrière une zone masquée (racine charbon des gabarits photo
      // composés) : neutralisé pour que le trou du raster reste transparent au-dessus
      // de la photo native, et reporté en fond NATIF de slide (cf. helper).
      const clearedBackdrops = new Map<HTMLElement, ClearedBackdrop>();
      for (const zone of usableZones) {
        if (zone.type === "img") {
          const target = zone.el.parentElement || zone.el;
          target.setAttribute("data-pptx-photo-hide", "true");
        } else {
          // background : retirer l'url(data:...) inline tout en conservant gradients
          const cs = win.getComputedStyle(zone.el);
          const cleaned = stripDataUrlsFromBackground(cs.backgroundImage || "");
          // !important via setProperty pour battre les classes Tailwind / CSS overlay
          zone.el.style.setProperty("background-image", cleaned, "important");
        }
        // Un même ancêtre peut servir deux zones : la 2e passe le lit déjà
        // transparent, donc la 1re entrée (la seule) fait foi.
        for (const cb of clearOpaqueBackdropsBehindZone(zone, doc)) {
          if (!clearedBackdrops.has(cb.el)) clearedBackdrops.set(cb.el, cb);
        }
      }
      // Le PLUS GRAND fond neutralisé devient le fond NATIF de la slide
      // (comportement historique : filet visuel si la photo native manque). S'il
      // déborde de la photo, ce même report le repeint AUSSI pour de bon — donc
      // pas de shape à poser pour lui, sauf si un shape `background` annoté
      // revendique déjà ce slot avec sa propre couleur.
      const backdropsBySize = [...clearedBackdrops.values()].sort(
        (a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h,
      );
      const slotLibre = !usableShapes.some((sb) => sb.type === "background");
      const backdropDeSlide = slotLibre ? backdropsBySize[0] : undefined;
      const photoBackdrop: string | null = backdropDeSlide?.color ?? null;
      /**
       * Fonds débordants à REPEINDRE en shape natif SOUS les photos : tout ce que
       * ni la photo (recouvrement total) ni slide.background ne remet en place.
       * Du plus grand au plus petit → l'imbrication HTML est respectée.
       */
      const backdropShapes = backdropsBySize.filter(
        (cb) => cb.needsRepaint && cb !== backdropDeSlide,
      );

      // ---- Voiles de lisibilité : retirés du raster, fusionnés dans la photo
      // native (cf. bloc « Voiles de lisibilité » en tête de fichier — l'import
      // Canva ne rend pas fiablement un calque PNG de voile séparé).
      const scrimsByZone = new Map<PhotoZone, ScrimSpec[]>();
      if (usableZones.length > 0) {
        const scrimEls = Array.from(doc.querySelectorAll<HTMLElement>("[data-injected-scrim]"));
        for (const sEl of scrimEls) {
          const r = sEl.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          const cs = win.getComputedStyle(sEl);
          const spec = parseScrimStyle(cs.backgroundImage || "", cs.backgroundColor || "");
          if (!spec) continue;
          // Fusion uniquement si une zone photo posée en natif CONTIENT le
          // voile (à 2 px près) — sinon on le laisse dans le raster.
          const zone = usableZones.find(
            (z) =>
              r.left >= z.rect.x - 2 &&
              r.top >= z.rect.y - 2 &&
              r.left + r.width <= z.rect.x + z.rect.w + 2 &&
              r.top + r.height <= z.rect.y + z.rect.h + 2,
          );
          if (!zone) continue;
          sEl.style.setProperty("visibility", "hidden", "important");
          const list = scrimsByZone.get(zone) || [];
          list.push({ rect: { x: r.left, y: r.top, w: r.width, h: r.height }, ...spec });
          scrimsByZone.set(zone, list);
        }
      }

      // Force layout flush après masquage texte + photos
      void win.document.body.offsetHeight;
      await new Promise((r) => setTimeout(r, 50));

      const tCapture = performance.now();
      const bg = await captureBody(doc);
      perf.captureBody = Math.round(performance.now() - tCapture);

      // ---- Z-ORDER (bottom → top) :
      // 0. Fonds opaques débordants repeints en natif (couche sous-photo)
      // 1. Photos natives
      // 2. Fond rasterisé transparent sur zones photo (couche middle)
      // 3. Blocs texte éditables (couche top)
      //
      // La couche 0 DOIT rester avant les photos : les shapes structurels
      // habituels (couche middle-bas, plus bas) sont posés APRÈS les photos et
      // les couvriraient — c'est exactement pourquoi le prompt interdit
      // d'annoter `data-pptx-shape` un élément qui contient une photo.
      for (const cb of backdropShapes) {
        const x = Math.max(0, pxToInches(cb.rect.x, PX_PER_IN));
        const y = Math.max(0, pxToInches(cb.rect.y, PX_PER_IN));
        const w = Math.min(PPTX_W_IN - x, pxToInches(cb.rect.w, PX_PER_IN));
        const h = Math.min(PPTX_H_IN - y, pxToInches(cb.rect.h, PX_PER_IN));
        if (w <= 0 || h <= 0) continue;
        const radius = Math.min(pxToInches(cb.borderRadiusPx, PX_PER_IN), Math.min(w, h) / 2);
        try {
          slide.addShape(cb.borderRadiusPx > 0 ? "roundRect" : "rect", {
            x, y, w, h,
            fill: { color: cb.color },
            line: { type: "none" },
            rectRadius: radius,
          });
        } catch (e) {
          console.warn("[hybrid] addShape(fond sous photo) failed", e);
        }
      }

      for (const zone of usableZones) {
        const photo = originalPhotos![zone.photoIndex - 1]; // garanti par filtre ci-dessus
        // Clamp dans les limites de la slide pour éviter les coordonnées négatives
        const xRaw = pxToInches(zone.rect.x, PX_PER_IN);
        const yRaw = pxToInches(zone.rect.y, PX_PER_IN);
        const wRaw = pxToInches(zone.rect.w, PX_PER_IN);
        const hRaw = pxToInches(zone.rect.h, PX_PER_IN);
        const x = Math.max(0, xRaw);
        const y = Math.max(0, yRaw);
        const w = Math.min(PPTX_W_IN - x, wRaw - (x - xRaw));
        const h = Math.min(PPTX_H_IN - y, hRaw - (y - yRaw));
        if (w <= 0 || h <= 0) continue;
        const frameRatio = w / h;
        const cacheKey = `${zone.photoIndex}:${frameRatio.toFixed(3)}`;
        let cropped = cropCache.get(cacheKey);
        if (cropped === undefined) {
          cropped = await cropToRatioBase64(photo.base64, frameRatio);
          cropCache.set(cacheKey, cropped);
        }
        // Fusion des voiles dans la photo recadrée. Le voile dépend de la
        // slide (dosé par luminance) alors que le crop est partagé par
        // (photo, ratio) → clé de cache étendue par la signature des voiles.
        // Si la fusion échoue (photo indécodable — le crop aurait échoué
        // aussi), la photo part sans voile : même dégradation qu'avant.
        let fused: string | null = null;
        const zoneScrims = scrimsByZone.get(zone);
        if (cropped && zoneScrims?.length) {
          const sig = zoneScrims
            .map((s) => `${s.kind}:${s.anchor || ""}:${s.alpha}:${Math.round(s.rect.y)}x${Math.round(s.rect.h)}`)
            .join("|");
          const fuseKey = `${cacheKey}|voiles:${sig}`;
          if (cropCache.has(fuseKey)) {
            fused = cropCache.get(fuseKey) ?? null;
          } else {
            fused = await burnScrimsIntoPhoto(cropped, zone.rect, zoneScrims);
            cropCache.set(fuseKey, fused);
          }
        }
        try {
          slide.addImage({
            data: fused ?? cropped ?? photo.base64,
            x, y, w, h,
            ...(cropped ? {} : { sizing: { type: "cover", w, h } }),
          });
        } catch (e) {
          console.warn("[hybrid] addImage(originalPhoto) failed", e);
        }
      }

      // ---- Pose des shapes natifs (couche middle-bas) entre photos (bottom)
      // et PNG de fond (middle-haut). Le PNG sera transparent là où les shapes
      // ont été masqués via data-pptx-shape-hide → les shapes natifs restent visibles.
      // Le texte ENFANT non annoté reste rendu dans le PNG (pas masqué) → il s'affiche
      // par-dessus le shape natif visuellement (PNG posé après).
      const drawNativeShape = (sb: ShapeBlock, wMul = 1, centered = false) => {
        const wBase = pxToInches(sb.rect.w, PX_PER_IN);
        const wRaw = wBase * wMul;
        // Élargissement symétrique quand le label interne est centré (pilule CTA
        // au milieu d'une carte) — sinon on étend à droite (label ancré à gauche).
        const xRaw = pxToInches(sb.rect.x, PX_PER_IN) - (centered ? (wRaw - wBase) / 2 : 0);
        const yRaw = pxToInches(sb.rect.y, PX_PER_IN);
        const hRaw = pxToInches(sb.rect.h, PX_PER_IN);
        const x = Math.max(0, xRaw);
        const y = Math.max(0, yRaw);
        const w = Math.min(PPTX_W_IN - x, wRaw - (x - xRaw));
        const h = Math.min(PPTX_H_IN - y, hRaw - (y - yRaw));
        if (w <= 0 || h <= 0) return;
        const radiusInches = pxToInches(sb.borderRadiusPx, PX_PER_IN);
        const cappedRadius = Math.min(radiusInches, Math.min(w, h) / 2);
        try {
          slide.addShape(sb.borderRadiusPx > 0 ? "roundRect" : "rect", {
            x, y, w, h,
            // L'alpha CSS devient une transparency native : une carte-voile
            // rgba(255,255,255,0.06) sur fond sombre reste un voile (et pas un
            // aplat blanc opaque qui rend son texte clair illisible).
            fill: {
              color: sb.fill,
              ...(sb.fillAlpha !== undefined && sb.fillAlpha < 1
                ? { transparency: Math.round((1 - sb.fillAlpha) * 100) }
                : {}),
            },
            line: sb.border
              ? { color: sb.border.color, width: sb.border.widthPt, dashType: sb.border.dashType }
              : { type: "none" },

            rectRadius: cappedRadius,
            ...(sb.shadow && {
              shadow: {
                type: "outer" as const,
                blur: sb.shadow.blurPt,
                offset: sb.shadow.offsetPt,
                angle: sb.shadow.angle,
                color: sb.shadow.color,
                opacity: sb.shadow.opacity,
              },
            }),
          });
        } catch (e) {
          console.warn("[hybrid] addShape failed for shape type", sb.type, e);
        }
      };
      // PILULES à label une-ligne : le texte est posé en wrap:false (il ne
      // re-wrappe jamais) mais les métriques PowerPoint (mono + letter-spacing)
      // le rendent jusqu'à ~30 % plus large que le HTML → il déborderait de la
      // pilule (« ENTREPRI|SES » dont la fin atterrit en blanc sur fond clair,
      // vu en prod). On élargit ces pilules d'autant ET on les pose AU-DESSUS
      // du PNG de fond : dessinée dessous, l'extension serait cachée par les
      // pixels opaques du PNG (le trou du masquage est à la taille HTML). Leur
      // visuel étant entièrement retiré du PNG (bg/bordure/ombre via
      // data-pptx-shape-hide), les poser au-dessus est visuellement équivalent.
      const deferredPills: Array<{ sb: ShapeBlock; centered: boolean; wMul: number }> = [];
      for (const sb of usableShapes) {
        if (sb.type === "background") {
          // Fond unique : on l'applique directement à slide.background plutôt
          // qu'un addShape pleine slide (plus léger + édition "Format de l'arrière-plan").
          slide.background = { color: sb.fill };
          continue;
        }
        // Photo reading panels contain native text only. If the photo stays
        // rasterized (no separate original supplied), the PNG is opaque beneath
        // the removed panel: drawing the card below it would hide the card.
        // Restore this foreground surface above the PNG at its exact size.
        if (sb.el.hasAttribute("data-photo-reading-panel")) {
          deferredPills.push({ sb, centered: false, wMul: 1 });
          continue;
        }
        const innerLabel =
          sb.type === "pill"
            ? blocks.find(
                (b) =>
                  !b.text.includes("\n") &&
                  b.rect.h < b.style.lineHeight * 1.6 &&
                  b.rect.x >= sb.rect.x && b.rect.y >= sb.rect.y &&
                  b.rect.x + b.rect.w <= sb.rect.x + sb.rect.w + 1 &&
                  b.rect.y + b.rect.h <= sb.rect.y + sb.rect.h + 1,
              )
            : undefined;
        if (innerLabel) {
          // Largeur cible = largeur CIBLE du label (estimation mono exacte ou
          // slack, cf. desiredTextWidthIn) + le padding horizontal HTML des
          // deux côtés — au lieu d'un ×1.3 forfaitaire qui restait court sur
          // les labels longs (« MÉCANISME SYSTÉMIQUE » débordant, vu en prod).
          const padIn = Math.max(0, pxToInches(innerLabel.rect.x - sb.rect.x, PX_PER_IN));
          const pillRawIn = pxToInches(sb.rect.w, PX_PER_IN);
          const pillDesired = desiredTextWidthIn(innerLabel) + padIn * 2;
          deferredPills.push({
            sb,
            centered: innerLabel.style.textAlign === "center",
            wMul: Math.max(1, pillDesired / Math.max(0.01, pillRawIn)),
          });
          continue;
        }
        drawNativeShape(sb);
      }
      // Fond neutralisé derrière les photos → fond NATIF de la slide (derrière la
      // photo native ; visible seulement si celle-ci manque). Un shape background
      // annoté garde la priorité (slides mix : déjà posé ci-dessus).
      if (photoBackdrop && !usableShapes.some((s) => s.type === "background")) {
        slide.background = { color: photoBackdrop };
      }
      const shadowedCount = usableShapes.filter((s) => s.type !== "background" && s.shadow).length;
      if (shadowedCount > 0) {
        console.debug(`[hybrid] shapes natifs ombrés sur slide ${vs.slide_number} : ${shadowedCount}/${usableShapes.length}`);
      }


      slide.addImage({ data: bg, x: 0, y: 0, w: PPTX_W_IN, h: PPTX_H_IN });

      // Pilules élargies (cf. deferredPills) : au-dessus du PNG, sous le texte.
      for (const dp of deferredPills) drawNativeShape(dp.sb, dp.wMul, dp.centered);

      // Dégradés déco : posés APRÈS le fond (donc visibles + déplaçables individuellement
      // dans Canva) et AVANT le texte (qui reste au-dessus).
      for (const gi of gradientImages) {
        try {
          slide.addImage({ data: gi.data, x: gi.x, y: gi.y, w: gi.w, h: gi.h });
        } catch (e) {
          console.warn("[hybrid] addImage(dégradé déco) failed", e);
        }
      }

      // Emojis isolés : petites images détourées, posées après le fond → élément
      // indépendant déplaçable/redimensionnable dans Canva (vrai emoji couleur).
      for (const ei of emojiImages) {
        try {
          slide.addImage({ data: ei.data, x: ei.x, y: ei.y, w: ei.w, h: ei.h });
        } catch (e) {
          console.warn("[hybrid] addImage(emoji) failed", e);
        }
      }

      for (const b of blocks) {
        try {
          addBlockToSlide(slide, b, charter, { siblings: blocks, cards: usableShapes });
        } catch (e) {
          console.warn("[hybrid] addBlockToSlide failed", e);
        }
      }

      // ---- Logo de marque (top layer, opt-in via logoUrl) ----
      if (logoBase64) {
        try {
          const padding = 0.3;
          const hLogo = PPTX_H_IN * 0.07;            // hauteur fixe (7% de la slide)
          const ratio = logoSize && logoSize.h > 0 ? logoSize.w / logoSize.h : 2.2; // fallback
          const wLogo = hLogo * ratio;               // largeur déduite du ratio réel
          const xLogo = PPTX_W_IN - wLogo - padding;
          const yLogo = PPTX_H_IN - hLogo - padding;
          slide.addImage({ data: logoBase64, x: xLogo, y: yLogo, w: wLogo, h: hLogo });
        } catch (e) {
          console.warn("[hybrid] addImage(logo) failed", e);
        }
      }
    } catch (e) {
      if (e instanceof ExportImageError) throw e;
      console.error("[hybrid] slide capture failed", e);
      slide.background = { color: normalizeHex(charter?.color_background, "FFFFFF") };
    } finally {
      iframe.remove();
      console.log(`[hybrid][perf] slide ${vs.slide_number} rendue en ${Math.round(performance.now() - tSlide0)}ms — mount=${perf.mount ?? "?"} waitReady=${perf.waitReady ?? "?"} captureBody=${perf.captureBody ?? "?"}`);
    }
  }

  // Rendu par LOTS CONCURRENTS : la rastérisation html2canvas (scale 3) est le poste le
  // plus lourd ; en traiter quelques-unes en parallèle réduit fortement le temps total.
  // L'ordre du deck est garanti par la pré-création des slides ci-dessus, et chaque slide
  // a son propre iframe (aucun état partagé hormis cropCache, sûr en mono-thread JS).
  const tAll0 = performance.now(); // perf instrumentation
  let slidesFaites = 0;
  for (let start = 0; start < visualSlides.length; start += RENDER_CONCURRENCY) {
    await Promise.all(
      visualSlides
        .slice(start, start + RENDER_CONCURRENCY)
        .map((_, k) =>
          renderSlideAt(start + k).then(() => {
            slidesFaites += 1;
            opts?.onProgress?.(slidesFaites, visualSlides.length);
          }),
        ),
    );
  }
  console.log(`[hybrid][perf] ${visualSlides.length} slides rasterisées en ${Math.round(performance.now() - tAll0)}ms (scale ${RASTER_SCALE}, gradient-captures ${MAX_GRADIENT_CAPTURES})`);

  // Pour le pont Canva : renvoyer le PPTX en Blob (à uploader puis importer) plutôt
  // que de déclencher un téléchargement.
  if (opts?.returnBlob) {
    return (await pptx.write({ outputType: "blob" })) as Blob;
  }
  await pptx.writeFile({ fileName: exportFileName(fileName, "pptx") });
}