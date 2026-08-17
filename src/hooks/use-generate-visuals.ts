import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithHeartbeat } from "@/lib/invoke-with-heartbeat";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { posthog } from "@/lib/posthog";
import { stripFontImportLeakFromSlides } from "@/lib/strip-font-import-leak";
import { downscalePhotosForVision } from "@/lib/image-vision";
import { AURIANA_DEMO_SUBJECT } from "@/lib/demo-auriana-data";
import { pickNonEmpty } from "@/features/creer/photo-source";
import type { CarouselColors } from "@/components/creer/formatRenderers/CarouselPhotoResult";

interface UseGenerateVisualsParams {
  result: any;
  visualLoading: boolean;
  aurianaDemoActive: boolean;
  ideaText: string;
  carouselSubMode: "text" | "photo" | "mix" | "pure_photo" | "user_slides" | null;
  uploadedPhotos: any[];
  generatedWithPhotos: any[];
  workspaceId: string;
  session: { user: { id?: string } };
  carouselColors: CarouselColors | null;
  charterData: any;
  qualityMax: boolean;
  coverIllustration: boolean;
  selectedFormat: string | null;
  visualSlides: { slide_number: number; html: string }[];
  step: string;
  setVisualsAutoError: (error: string | null) => void;
  setVisualLoading: (loading: boolean) => void;
  setVisualSlides: (slides: { slide_number: number; html: string }[]) => void;
  setPhotoMissingDialog: (state: { open: boolean; rawType: "photo" | "mix" | null }) => void;
  setVisualChunkProgress: (progress: { done: number; total: number } | null) => void;
  refreshPlan: () => void;
}

/**
 * Génération des visuels d'un carrousel (rendu HTML des slides via l'edge
 * `carousel-visual`) — fonction la plus complexe du fichier : mapping des
 * types de slide, filet anti-photos-dégénérées, vision + luminance, diagnostic
 * télémétrie, ré-hydratation plein format post-edge.
 *
 * Possède aussi son propre effet de pré-génération en arrière-plan : dès que
 * le texte du carrousel est prêt (`result` avec des slides), on tente de
 * générer les visuels sans attendre le clic, avec un budget de 2 essais par
 * résultat avant de laisser la main au bouton manuel.
 *
 * Retourne `{ handleGenerateVisuals }`.
 */
export function useGenerateVisuals({
  result,
  visualLoading,
  aurianaDemoActive,
  ideaText,
  carouselSubMode,
  uploadedPhotos,
  generatedWithPhotos,
  workspaceId,
  session,
  carouselColors,
  charterData,
  qualityMax,
  coverIllustration,
  selectedFormat,
  visualSlides,
  step,
  setVisualsAutoError,
  setVisualLoading,
  setVisualSlides,
  setPhotoMissingDialog,
  setVisualChunkProgress,
  refreshPlan,
}: UseGenerateVisualsParams) {
  const luminanceCacheRef = useRef<Map<string, { top: number; center: number; bottom: number }>>(new Map());
  const autoVisualsAttemptRef = useRef<{ result: any; n: number }>({ result: null, n: 0 });

  const handleGenerateVisuals = async (opts?: { forceText?: boolean; background?: boolean }) => {
    if (!result?.raw?.slides || visualLoading) return;
    // Casting texte-d'abord incomplet : chaque slide photo doit avoir son image avant
    // le rendu (sinon le curseur auto poserait des photos arbitraires dessus).
    const uncastCount = (result.raw.slides || []).filter(
      (s: any) =>
        (s?.slide_type === "photo_full" || s?.slide_type === "photo_integrated") &&
        s?.photo_directive &&
        !Number.isInteger(s?.photo_index),
    ).length;
    if (uncastCount > 0) {
      if (!opts?.background) {
        toast(uncastCount === 1
          ? "Choisis d'abord une image pour la slide photo restante."
          : `Choisis d'abord une image pour les ${uncastCount} slides photo restantes.`);
      }
      return;
    }
    setVisualsAutoError(null);
    setVisualLoading(true);

    // ═══ Demo bypass: return pre-built visuals only when user follows the script ═══
    const isAurianaScript = aurianaDemoActive
      && ideaText === AURIANA_DEMO_SUBJECT
      && carouselSubMode === "text"
      && uploadedPhotos.length === 0;
    if (isAurianaScript) {
      const { getAurianaDemoVisualSlides } = await import("@/lib/demo-auriana-data");
      await new Promise(r => setTimeout(r, 1500));
      setVisualSlides(getAurianaDemoVisualSlides());
      setVisualLoading(false);
      toast.success("Visuels générés !");
      return;
    }

    try {
      // ═══ Diagnostic : vérifier la structure des slides ═══
      const rawSlides = result.raw.slides;
      console.log("[carousel-visual] raw slides type:", typeof rawSlides, "isArray:", Array.isArray(rawSlides), "length:", rawSlides?.length);

      if (!Array.isArray(rawSlides) || rawSlides.length === 0) {
        console.error("[carousel-visual] slides invalides:", JSON.stringify(rawSlides).slice(0, 500));
        posthog.capture("carousel_visual_invalid_slides", {
          raw_type: typeof rawSlides,
          raw_is_array: Array.isArray(rawSlides),
          raw_length: rawSlides?.length,
          raw_keys: typeof rawSlides === "object" && rawSlides ? Object.keys(rawSlides) : [],
          raw_preview: JSON.stringify(rawSlides).slice(0, 300),
          result_raw_keys: Object.keys(result?.raw || {}),
        });
        toast.error("Les slides ne sont pas dans un format valide. Essaie de régénérer le carrousel.");
        setVisualLoading(false);
        return;
      }

      const rawCarouselType = result.raw.carousel_type;
      // ═══ Source de vérité photos : snapshot pris au moment de la génération.
      // Si le state UI uploadedPhotos a été reset (changement d'onglet, etc.),
      // on retombe sur generatedWithPhotos pour ne pas perdre les photos.
      const photosForVisuals = pickNonEmpty(uploadedPhotos, generatedWithPhotos);
      const hasActualPhotos = photosForVisuals.length > 0;
      console.log("[carousel-visual] photos source:", {
        ui_state: uploadedPhotos.length,
        snapshot: generatedWithPhotos.length,
        used: photosForVisuals.length,
      });
      // ═══ Downgrade EXPLICITE : si l'IA demande photo/mix mais qu'aucune photo
      // n'est disponible, on n'applique JAMAIS un downgrade silencieux. On ouvre
      // un dialog pour laisser l'utilisateur décider (ajouter des photos OU
      // continuer en texte). Si forceText === true, l'utilisateur a confirmé.
      let downgradeReason: "no_photos_at_generation" | "user_chose_text" | null = null;
      if ((rawCarouselType === "photo" || rawCarouselType === "mix") && !hasActualPhotos) {
        if (!opts?.forceText) {
          setPhotoMissingDialog({ open: true, rawType: rawCarouselType });
          setVisualLoading(false);
          return;
        }
        downgradeReason = "user_chose_text";
      }
      const effectiveCarouselType = (rawCarouselType === "photo" || rawCarouselType === "mix") && !hasActualPhotos
        ? "text"
        : rawCarouselType;

      const isPhotoCarousel = effectiveCarouselType === "photo";
      const isMixCarousel = effectiveCarouselType === "mix";
      const hasPhotos = isPhotoCarousel || isMixCarousel;

      // ═══ Construire le body et le valider avant envoi ═══
      // P0-2: auto-assign photo_index séquentiel si l'IA l'oublie sur photo_full / photo_integrated
      let autoPhotoCursor = 0;
      const totalPhotos = photosForVisuals.length;

      // « Photos brutes » : la promesse du mode (1 photo = 1 slide, AUCUN texte
      // sur la photo) se verrouille ICI, au dernier portillon avant l'edge.
      // L'effet de nettoyage sur result.raw perd la course contre
      // l'auto-déclenchement des visuels (les deux écoutent `result`) : les
      // slides brutes de carousel-ai — 7 slides avec overlay/kicker — partaient
      // telles quelles vers carousel-visual. On ne dépend plus de lui : les
      // slides « photo nue » sont dérivées des photos elles-mêmes, le reste du
      // flux (vision, luminance, charte, réponse) est inchangé.
      const slidesSource =
        carouselSubMode === "pure_photo" && totalPhotos > 0
          ? photosForVisuals.map((_p: any, i: number) => ({
              slide_number: i + 1,
              role: i === 0 ? "hook" : i === totalPhotos - 1 ? "cta" : "body",
              slide_type: "photo_full",
              overlay_text: null,
              photo_index: i + 1,
            }))
          : rawSlides;

      const mappedSlides = slidesSource.map((s: any, slideIdx: number) => {
        const slideType = hasPhotos
          ? (s.slide_type || (isPhotoCarousel ? "photo_full" : "text_only"))
          : "text_only";

        // Résolution photo_index : utilise celui fourni s'il est valide (1-based, dans la range),
        // sinon attribue séquentiellement la prochaine photo dispo et logge.
        let resolvedPhotoIndex: number | undefined;
        if (slideType === "photo_full" || slideType === "photo_integrated") {
          const provided = Number.isInteger(s.photo_index) ? s.photo_index : null;
          if (provided && provided >= 1 && provided <= totalPhotos) {
            resolvedPhotoIndex = provided;
          } else if (totalPhotos > 0) {
            resolvedPhotoIndex = (autoPhotoCursor % totalPhotos) + 1;
            console.warn(
              `[carousel] slide ${s.slide_number ?? slideIdx + 1} (${slideType}) sans photo_index valide (reçu: ${s.photo_index}). Auto-assigné à ${resolvedPhotoIndex}.`
            );
            autoPhotoCursor++;
          }
          if (provided && provided >= 1 && provided <= totalPhotos) {
            autoPhotoCursor = Math.max(autoPhotoCursor, provided);
          }
        }

        return {
          slide_number: s.slide_number,
          role: s.role,
          slide_type: slideType,
          ...(slideType === "photo_full" ? {
            overlay_text: s.overlay_text,
            overlay_position: s.overlay_position || "bottom_center",
            overlay_style: s.overlay_style || "sensoriel",
            note: s.note,
            photo_index: resolvedPhotoIndex,
            // Gabarits composés par code (13/07) : le choix du gabarit et ses
            // champs viennent de la structure — les tronquer ici casserait la
            // composition côté carousel-visual.
            ...(s.template ? { template: s.template } : {}),
            ...(s.kicker ? { kicker: s.kicker } : {}),
            ...(s.detail ? { detail: s.detail } : {}),
            ...(Array.isArray(s.points) && s.points.length > 0 ? { points: s.points } : {}),
            ...(s.big_number ? { big_number: s.big_number } : {}),
            ...(typeof s.step_number === "number" ? { step_number: s.step_number } : {}),
            ...(s.attribution ? { attribution: s.attribution } : {}),
            ...(s.cta_label ? { cta_label: s.cta_label } : {}),
            // Le prompt de carousel-visual s'appuie sur visual_anchor (cadrage du
            // texte hors du détail + zoom narratif sur photo répétée) : le tronquer
            // ici rendait ces règles inertes.
            ...(s.visual_anchor ? { visual_anchor: s.visual_anchor } : {}),
          } : {}),
          ...(slideType === "photo_integrated" ? {
            photo_index: resolvedPhotoIndex,
            photo_layout: s.photo_layout || "top_photo",
            title: s.title || "",
            body: s.body || "",
            note: s.note,
            ...(s.visual_anchor ? { visual_anchor: s.visual_anchor } : {}),
          } : {}),
          ...(slideType === "text_only" ? {
            title: s.title || s.overlay_text || "",
            body: s.body || s.note || "",
            visual_suggestion: s.visual_suggestion,
            ...(s.visual_schema ? { visual_schema: s.visual_schema } : {}),
          } : {}),
        };
      });

      // P1-8 : Validation sequencing post-IA pour mix
      // - Slide 1 doit être visuelle (photo_full / photo_integrated) pour ouvrir fort
      // - Dernière slide doit être text_only (CTA)
      // On corrige silencieusement (log console) sans bloquer l'utilisateur.
      // « Mes slides » : JAMAIS de correction — l'ordre et le type de chaque
      // slide sont un choix de l'utilisatrice, pas une sortie IA à rattraper.
      if (isMixCarousel && carouselSubMode !== "user_slides" && mappedSlides.length >= 2) {
        const first = mappedSlides[0];
        const last = mappedSlides[mappedSlides.length - 1];
        if (first.slide_type === "text_only") {
          console.warn(
            `[carousel] sequencing: slide 1 était text_only — conversion en photo_full pour ouvrir fort.`
          );
          const targetPhoto = totalPhotos > 0 ? 1 : undefined;
          mappedSlides[0] = {
            slide_number: first.slide_number,
            role: first.role,
            slide_type: "photo_full",
            overlay_text: (first as any).title || "",
            overlay_position: "bottom_center",
            overlay_style: "sensoriel",
            note: (first as any).note,
            photo_index: targetPhoto,
          };
        }
        if (
          last.slide_type !== "text_only" &&
          last.slide_type !== undefined &&
          last.role !== "cta"
        ) {
          console.warn(
            `[carousel] sequencing: dernière slide n'était pas text_only — conversion en CTA texte.`
          );
          // Mapping CTA propre : on supprime overlay_text/photo_index/photo_layout
          // pour ne garder que les champs pertinents pour une slide texte CTA.
          mappedSlides[mappedSlides.length - 1] = {
            slide_number: last.slide_number,
            role: "cta",
            slide_type: "text_only",
            title: (last as any).title || (last as any).overlay_text || "",
            body: (last as any).body || (last as any).note || "",
            ...((last as any).visual_suggestion ? { visual_suggestion: (last as any).visual_suggestion } : {}),
          };
        }
      }

      if (!mappedSlides || mappedSlides.length === 0) {
        console.error("[carousel-visual] mapping a produit 0 slides");
        toast.error("Erreur de préparation des slides. Régénère le carrousel.");
        setVisualLoading(false);
        return;
      }

      // Filet anti-dégénéré — source unique de vérité avec l'export PPTX éditable.
      // Si l'IA a mis la même photo partout (ou un index invalide) sur les slides-photo,
      // resolvePhotoIndexes redistribue les photos de façon déterministe AVANT la
      // génération du HTML — sinon la photo se répète sur PNG / hybride / visuel / calendrier
      // (le HTML est figé une fois généré, on ne peut plus corriger à l'export).
      const { resolvePhotoIndexes } = await import("@/lib/resolve-photo-index");
      // « Mes slides » : l'association photo↔slide est un CHOIX explicite de
      // l'utilisatrice (y compris la même photo sur plusieurs slides) — le
      // filet anti-dégénéré la « corrigerait » à tort, on le saute.
      const slidesForVisuals = totalPhotos > 0 && carouselSubMode !== "user_slides"
        ? resolvePhotoIndexes(mappedSlides, totalPhotos)
        : mappedSlides;

      // Photos VISION (allégées ~1024px, upload + analyse rapides). ⚠️ L'edge remplace
      // les placeholders {{PHOTO_N}} par CES versions dans le HTML renvoyé — on garde
      // donc la correspondance vision→master pour ré-hydrater le plein format au retour
      // (audit carrousel photo 12/07 : l'aperçu, le PNG et la publication Instagram
      // partaient des photos dégradées, cf docblock image-vision.ts).
      const visionPhotos = hasPhotos && hasActualPhotos
        ? await downscalePhotosForVision(photosForVisuals.map(p => ({ base64: p.base64, mimeType: p.mimeType })))
        : null;
      // Luminance par bande (gabarits composés 13/07) : mesurée ici car l'edge
      // n'a pas de décodeur d'image. Échec silencieux → l'edge dose le voile au
      // pire cas (photo claire), jamais de texte illisible.
      // Clé de cache = identité de la photo SOURCE (visionPhotos est mappé 1:1 sur
      // photosForVisuals) : photothèque par id, sinon empreinte du base64.
      const luminanceKey = (src: any, i: number): string =>
        src?.id || src?.userPhotoId ||
        (typeof src?.base64 === "string" ? `${src.base64.length}:${src.base64.slice(-48)}` : `idx${i}`);
      const visionPhotosWithLuminance = visionPhotos
        ? await Promise.all(visionPhotos.map(async (p, i) => {
            const key = luminanceKey(photosForVisuals[i], i);
            let luminance = luminanceCacheRef.current.get(key);
            if (!luminance) {
              const { measureLuminanceZones } = await import("@/lib/photo-luminance");
              const measured = await measureLuminanceZones(p.base64);
              if (measured) {
                luminance = measured;
                luminanceCacheRef.current.set(key, measured);
              }
            }
            return luminance ? { ...p, luminance } : p;
          }))
        : null;
      const requestBody: any = {
        slides: slidesForVisuals,
        ...(visionPhotosWithLuminance ? {
          photos: visionPhotosWithLuminance,
          carousel_type: isMixCarousel ? "mix" : "photo",
        } : {
          template_style: null,
        }),
        // Surcharge de couleurs : on renvoie la charte COMPLÈTE (select * de useBrandCharter)
        // avec seulement les 3 couleurs remplacées, pour ne rien perdre (polices, brief,
        // templates…). L'edge `carousel-visual` utilise `charter` du body avant la DB.
        ...(carouselColors && charterData ? {
          charter: {
            ...charterData,
            color_primary: carouselColors.primary,
            color_secondary: carouselColors.secondary,
            color_accent: carouselColors.accent,
          },
        } : {}),
        workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
        // "Mode qualité Max" : Opus pour le rendu des visuels (plus soigné, ~2x plus lent).
        // Par défaut (toggle off) → Sonnet, nettement plus rapide.
        quality_max: qualityMax || undefined,
        // Illustration de couverture (Recraft) — opt-in, jamais envoyé si off.
        cover_illustration: coverIllustration || undefined,
      };

      console.log("[carousel-visual] request body keys:", Object.keys(requestBody), "slides count:", requestBody.slides?.length);

      // ═══ Tracking automatique pour diagnostic à distance ═══
      const diagnosticPayload = {
        raw_keys: Object.keys(result.raw || {}),
        has_slides: !!result.raw?.slides,
        slides_type: typeof result.raw?.slides,
        slides_is_array: Array.isArray(result.raw?.slides),
        slides_count: rawSlides?.length || 0,
        mapped_slides_count: mappedSlides?.length || 0,
        body_keys: Object.keys(requestBody),
        body_has_slides: !!requestBody.slides,
        body_slides_count: requestBody.slides?.length || 0,
        carousel_type: rawCarouselType || "text",
        effective_type: effectiveCarouselType || "text",
        has_photos: hasActualPhotos,
        ui_state_count: uploadedPhotos.length,
        snapshot_count: generatedWithPhotos.length,
        downgrade_reason: downgradeReason,
        format: selectedFormat,
      };
      posthog.capture("carousel_visual_debug", diagnosticPayload);
      if (session?.user?.id) {
        supabase.from("frontend_debug_logs").insert({
          user_id: session.user.id,
          event: "carousel_visual_request",
          payload: diagnosticPayload,
        }).then(() => {}, () => {});
      }

      const visualsStartedAt = performance.now();
      // Les carrousels riches en photos (dump : 6-8 slides pleines images)
      // dépassent régulièrement 180 s côté rendu — plafond élargi dans ce cas
      // (vu au re-test live du 10/07 : texte OK, timeout sur les visuels).
      const visualsTimeout = (requestBody as any)?.photos?.length >= 4 ? 420000 : 180000;
      const { data, error: fnError } = await invokeWithHeartbeat("carousel-visual", {
        body: requestBody,
        onStatus: (stage, info: any) => {
          if (stage === "visuals" && typeof info?.total === "number") {
            setVisualChunkProgress({ done: Number(info.done) || 0, total: info.total });
          }
        },
      }, visualsTimeout);
      // Quota épuisé : ouvrir le QuotaWallModal avec l'objet quota complet,
      // AVANT le throw générique qui perdrait data.quota (en SSE, le 429 arrive
      // avec fnError ET data parsé — le quota se juge donc en premier).
      if (data?.error === "limit_reached" || data?.quota) {
        // Pré-génération silencieuse : ne pas faire surgir le mur quota sans clic,
        // mais le dire près du bouton (le clic ouvrira le mur avec le détail).
        if (opts?.background) {
          setVisualsAutoError("Tes crédits sont épuisés : les visuels n'ont pas pu être créés automatiquement.");
          return;
        }
        if (handleQuotaError({ data })) return;
      }
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      posthog.capture("carousel_visuals_timing", {
        duration_ms: Math.round(performance.now() - visualsStartedAt),
        slides_count: requestBody.slides?.length || 0,
        quality_max: !!requestBody.quality_max,
      });
      // Garde déterministe : ne JAMAIS afficher « Visuels générés ! » sur un résultat
      // vide ou amputé. Sans ça, une slide au HTML vide ou un tableau plus court que
      // demandé passe pour un succès → l'utilisatrice exporte un PPTX avec page(s)
      // blanche(s). On exige un tableau non vide, du HTML réel sur CHAQUE slide, et au
      // moins autant de slides que demandé. À défaut → erreur réessayable (le catch
      // gère le toast en avant-plan et reste silencieux en pré-génération background).
      const producedSlides = stripFontImportLeakFromSlides(data.result?.slides_html || []);
      const expectedCount = requestBody.slides?.length || 0;
      const slidesAreValid =
        Array.isArray(producedSlides) &&
        producedSlides.length > 0 &&
        producedSlides.every((s: any) => typeof s?.html === "string" && s.html.trim().length > 0) &&
        (expectedCount === 0 || producedSlides.length >= expectedCount);
      if (!slidesAreValid) {
        throw new Error("Les visuels n'ont pas été générés correctement (slides manquantes ou vides). Réessaie.");
      }
      // Normalise vers la forme attendue par l'état { slide_number, html } : on garde le
      // numéro fourni par l'IA s'il est présent (JSON généré, pas garanti), sinon on
      // retombe sur l'index (1-based). Fiabilise + corrige l'inférence du helper générique.
      const normalizedSlides = producedSlides.map((s: any, i: number) => ({
        slide_number: typeof s?.slide_number === "number" ? s.slide_number : i + 1,
        html: String(s?.html ?? ""),
      }));
      // Ré-hydratation PLEIN FORMAT (audit 12/07) : resubstitue les masters aux
      // versions vision injectées par l'edge — même forme data URL que lui
      // (raw.startsWith("data:") ? raw : préfixe data:mime;base64,).
      const asDataUrl = (ph: { base64: string; mimeType?: string }) =>
        ph.base64.startsWith("data:") ? ph.base64 : `data:${ph.mimeType || "image/jpeg"};base64,${ph.base64}`;
      const rehydratedSlides = visionPhotos
        ? normalizedSlides.map((s) => {
            let html = s.html;
            visionPhotos.forEach((vp, i) => {
              const master = photosForVisuals[i];
              if (!master?.base64) return;
              const from = asDataUrl(vp);
              const to = asDataUrl(master);
              if (from !== to && html.includes(from)) html = html.split(from).join(to);
            });
            return html === s.html ? s : { ...s, html };
          })
        : normalizedSlides;
      setVisualSlides(rehydratedSlides);
      setVisualsAutoError(null);
      if (!opts?.background) {
        if (downgradeReason === "user_chose_text") {
          toast.success("Carrousel généré en mode texte (aucune photo disponible).");
        } else {
          toast.success("Visuels générés !");
        }
      }
    } catch (e: any) {
      // Quota remonté par throw : ouvrir le mur quota au lieu d'un toast brut.
      // En pré-génération (background), on reste silencieux : pas de mur ni de toast
      // surgissant sans clic — l'utilisatrice pourra relancer manuellement.
      if (!opts?.background && handleQuotaError(e)) return;
      posthog.capture("carousel_visual_error", {
        error_message: e?.message || "unknown",
        had_slides: !!result?.raw?.slides,
        slides_count: result?.raw?.slides?.length || 0,
        background: !!opts?.background,
      });
      if (!opts?.background) {
        toast.error(e?.message || "Erreur lors de la génération des visuels");
      } else {
        // Tentative auto : pas de toast surgissant, mais un état honnête près du
        // bouton — jamais un retour muet à « Créer les visuels ».
        const msg = /fetch|network|réseau|timeout|signal|abort|504|502/i.test(String(e?.message || ""))
          ? "Le réseau a flanché pendant la création des visuels."
          : "La création automatique des visuels n'a pas abouti.";
        setVisualsAutoError(msg);
      }
    } finally {
      setVisualLoading(false);
      // Le débit (ou non-débit sur échec) vient d'être tranché côté serveur :
      // resynchroniser le compteur de crédits affiché.
      refreshPlan();
      setVisualChunkProgress(null);
    }
  };

  // ═══ Pré-génération des visuels du carrousel ═══
  // Dès que le texte du carrousel est prêt, on lance la génération des visuels
  // en arrière-plan pendant que l'utilisatrice lit, pour qu'ils soient déjà là
  // (ou en cours) quand elle scrolle. Frontend only — ne touche pas l'edge.
  // Compteur de tentatives PAR résultat (et non un simple "déjà lancé").
  // Une 1re tentative auto qui échoue ou baile (edge lente/timeout, état
  // transitoire) ne doit PAS désactiver l'auto-génération pour toujours :
  // sinon l'utilisatrice se retrouve sans visuels et doit cliquer
  // "Regénérer visuels" à la main. On retente UNE fois automatiquement,
  // puis on laisse la main au bouton manuel (pas de boucle infinie).
  useEffect(() => {
    if (selectedFormat !== "carousel") return;
    if (step !== "result") return;
    if (!result?.raw?.slides) return;
    if (visualLoading || visualSlides.length > 0) return;
    // Ne PAS auto-déclencher si ça ouvrirait le dialog "photos manquantes"
    // (carrousel photo/mix sans photo dispo) — la décision reste à l'utilisatrice.
    const rawType = result?.raw?.carousel_type;
    const photosAvail = uploadedPhotos.length > 0 || generatedWithPhotos.length > 0;
    const wouldOpenPhotoDialog = (rawType === "photo" || rawType === "mix") && !photosAvail;
    if (wouldOpenPhotoDialog) return;
    // Régime texte d'abord : tant qu'une slide photo (directive présente) n'a pas
    // son image, on ne rend pas les visuels — le curseur auto de handleGenerateVisuals
    // poserait des photos arbitraires sur les slides non castées.
    const hasUncastPhotoSlide = (result?.raw?.slides || []).some(
      (s: any) =>
        (s?.slide_type === "photo_full" || s?.slide_type === "photo_integrated") &&
        s?.photo_directive &&
        !Number.isInteger(s?.photo_index),
    );
    if (hasUncastPhotoSlide) return;
    // Tentatives bornées par résultat : 1 essai + 1 retry sur échec transitoire.
    if (autoVisualsAttemptRef.current.result !== result) {
      autoVisualsAttemptRef.current = { result, n: 0 };
    }
    if (autoVisualsAttemptRef.current.n >= 2) return; // on laisse la main au bouton manuel
    autoVisualsAttemptRef.current.n += 1;
    handleGenerateVisuals({ background: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, selectedFormat, step, visualLoading, visualSlides.length, uploadedPhotos.length, generatedWithPhotos.length]);

  return { handleGenerateVisuals };
}
