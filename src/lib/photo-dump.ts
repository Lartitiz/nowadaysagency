/**
 * photo-dump — orchestration front du « photo dump » (lot 3 mise en scène).
 *
 * Complète une séquence carrousel pure_photo : l'edge photo-dump-plan compose
 * l'arc narratif, puis chaque slide est résolue séquentiellement vers la
 * source la moins chère qui raconte le beat :
 *   - "library"        → vraie photo de la bibliothèque (gratuit)
 *   - "photoroom"      → vraie photo, fond refait via photoroom-edit (1 crédit)
 *   - "generate_porte" → produit porté, product-on-model (1 crédit) — le même
 *                        mannequin est conservé d'une slide à l'autre via
 *                        reference_person_b64 (la 1re image générée fait foi)
 *   - "generate_pose"  → objet/lieu sans personne, product-on-model (1 crédit)
 *   - "missing"        → pas de slide, le beat part dans la wishlist
 *
 * Erreurs : premium_required → PremiumRequiredError (abandon propre côté
 * appelant) ; limit_reached → les slides payantes restantes sont sautées ;
 * échec d'UNE slide → sautée (toast discret) et on continue.
 */

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { userPhotoToBase64, type UserPhotoRow } from "@/lib/photo-storage";

/** Timeout par appel edge (les générations gpt-image sont longues). */
const CALL_TIMEOUT_MS = 160_000;

export type DumpSource = "library" | "photoroom" | "generate_porte" | "generate_pose" | "missing";

export interface DumpPlanSlide {
  beat: string;
  source: DumpSource;
  photo_id: string | null;
  scene_en: string | null;
  blurry: boolean;
}

export interface DumpProgressItem {
  beat: string;
  source: DumpSource;
  status: "pending" | "active" | "done" | "skipped";
}

/** Photo résolue, au shape PhotoItem attendu par le flux carrousel existant. */
export interface ResolvedDumpPhoto {
  base64: string;
  preview: string;
  name: string;
  context?: string;
  mimeType?: string;
  id?: string;
  userPhotoId?: string;
}

/** product-on-model / photoroom-edit ont renvoyé premium_required : abandon propre. */
export class PremiumRequiredError extends Error {
  constructor() {
    super("premium_required");
    this.name = "PremiumRequiredError";
  }
}

export interface RunPhotoDumpOptions {
  /** Le sujet du post (3-600 caractères côté edge). */
  sujet: string;
  /** Ids bibliothèque (user_photos) des photos attachées par l'utilisatrice. */
  attachedPhotoIds: string[];
  /** workspace_id à envoyer aux edges (undefined = espace perso). */
  workspaceId?: string;
  /** Lignes bibliothèque déjà chargées (cache) — complétées par fetch si absentes. */
  libraryRows: UserPhotoRow[];
  /** État d'avancement pour l'écran de progression. */
  onProgress: (narrativeThread: string, items: DumpProgressItem[]) => void;
  /** Beat introuvable → wishlist « Photos à prendre ». */
  onWishlist: (beat: string) => Promise<void>;
}

export interface RunPhotoDumpResult {
  photos: ResolvedDumpPhoto[];
  narrativeThread: string;
  skipped: number;
}

/**
 * Déroule le photo dump complet. Retourne null si la planification échoue
 * (l'appelant continue alors le flux normal avec les photos attachées).
 * Lève PremiumRequiredError si une slide payante tombe sur le gate Premium.
 */

/**
 * Redimensionne une data URL en JPEG ≤ 1440 px (qualité 0,82). Les photos de
 * bibliothèque arrivent à leur taille stockée (jusqu'à 5 Mo) : sans cette
 * passe, le corps envoyé à carousel-ai dépasse la limite de l'edge — rejet
 * avant les en-têtes CORS (vu au re-test live du 10/07, erreur « CORS »).
 */
async function downscaleDataUrl(dataUrl: string): Promise<string> {
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("image invalide"));
      img.src = dataUrl;
    });
    const MAX = 1440;
    let { width, height } = img;
    if (width <= MAX && height <= MAX && dataUrl.length < 900_000) return dataUrl;
    if (width > MAX || height > MAX) {
      const r = Math.min(MAX / width, MAX / height);
      width = Math.round(width * r);
      height = Math.round(height * r);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return dataUrl;
  }
}

export async function runPhotoDump(opts: RunPhotoDumpOptions): Promise<RunPhotoDumpResult | null> {
  // 1. Plan narratif (micro-appel, non facturé)
  const { data: planData, error: planError } = await invokeWithTimeout(
    "photo-dump-plan",
    {
      body: {
        workspace_id: opts.workspaceId,
        sujet: opts.sujet,
        attached_photo_ids: opts.attachedPhotoIds,
        target_count: 7,
      },
    },
    CALL_TIMEOUT_MS,
  );
  const slides: DumpPlanSlide[] = Array.isArray(planData?.slides) ? planData.slides : [];
  if (planError || slides.length === 0) return null;

  const narrativeThread =
    typeof planData?.narrative_thread === "string" ? planData.narrative_thread : "";
  const items: DumpProgressItem[] = slides.map((s) => ({
    beat: s.beat,
    source: s.source,
    status: "pending",
  }));
  const report = () => opts.onProgress(narrativeThread, items.map((i) => ({ ...i })));
  report();

  // Cache des lignes bibliothèque (fetch unitaire si le plan cite un id absent)
  const rowCache = new Map(opts.libraryRows.map((r) => [r.id, r]));
  const getRow = async (id: string | null): Promise<UserPhotoRow | null> => {
    if (!id) return null;
    const cached = rowCache.get(id);
    if (cached) return cached;
    const { data } = await supabase.from("user_photos").select("*").eq("id", id).maybeSingle();
    if (data) rowCache.set(id, data as UserPhotoRow);
    return (data as UserPhotoRow | null) ?? null;
  };

  // Photo produit par défaut des slides generate_* quand le plan n'en cite pas
  const fallbackProduct =
    opts.libraryRows.find(
      (r) => r.status === "ready" && (r.kind === "produit" || r.kind === "produit_porte"),
    ) ?? null;

  const photos: ResolvedDumpPhoto[] = [];
  // Même mannequin sur toutes les slides portées : la 1re image générée fait foi
  let referencePersonB64: string | null = null;
  // limit_reached rencontré → inutile de retenter les slides payantes suivantes
  let creditsExhausted = false;
  let skipped = 0;

  const skipToast = () =>
    toast("Une slide n'a pas pu être préparée — on continue sans elle.", {
      id: "photo-dump-skip",
    });

  for (let idx = 0; idx < slides.length; idx++) {
    const slide = slides[idx];
    items[idx].status = "active";
    report();

    const finish = (ok: boolean, silent = false) => {
      items[idx].status = ok ? "done" : "skipped";
      if (!ok) {
        skipped++;
        if (!silent) skipToast();
      }
      report();
    };

    try {
      if (slide.source === "missing") {
        // Pas de slide : le beat part dans la liste « Photos à prendre ».
        await opts.onWishlist(slide.beat).catch(() => {});
        finish(true);
        continue;
      }

      if (slide.source === "library") {
        const row = await getRow(slide.photo_id);
        if (!row) {
          finish(false);
          continue;
        }
        const { base64, mimeType, name } = await userPhotoToBase64(row);
        photos.push({
          base64,
          preview: base64,
          name,
          context: slide.beat,
          mimeType,
          id: crypto.randomUUID(),
          userPhotoId: row.id,
        });
        finish(true);
        continue;
      }

      // Slides payantes à partir d'ici
      if (creditsExhausted) {
        finish(false, true);
        continue;
      }

      if (slide.source === "photoroom") {
        const row = await getRow(slide.photo_id);
        if (!row) {
          finish(false);
          continue;
        }
        const { base64: src, mimeType, name } = await userPhotoToBase64(row);
        const prompt = (slide.scene_en || "").trim();
        if (prompt.length < 3) {
          // Pas de fond décrit : la vraie photo part telle quelle (aucun appel payant)
          photos.push({
            base64: src,
            preview: src,
            name,
            context: slide.beat,
            mimeType,
            id: crypto.randomUUID(),
            userPhotoId: row.id,
          });
          finish(true);
          continue;
        }
        const { data, error } = await invokeWithTimeout(
          "photoroom-edit",
          {
            body: {
              image_base64: src,
              mode: "replace_bg",
              prompt: prompt.slice(0, 500),
              workspace_id: opts.workspaceId,
            },
          },
          CALL_TIMEOUT_MS,
        );
        if (data?.error === "premium_required") throw new PremiumRequiredError();
        if (data?.error === "limit_reached" || error?.isRateLimit) {
          creditsExhausted = true;
          toast.error("Tu as utilisé toutes tes retouches photo du mois", {
            description: "Les slides à générer ont été sautées — la séquence continue sans elles.",
          });
          finish(false, true);
          continue;
        }
        const out = typeof data?.image_base64 === "string" ? data.image_base64 : null;
        if (error || !out) {
          finish(false);
          continue;
        }
        photos.push({
          base64: out,
          preview: out,
          name: `${name} — fond refait`,
          context: slide.beat,
          mimeType: "image/jpeg",
          id: crypto.randomUUID(),
        });
        finish(true);
        continue;
      }

      // generate_porte / generate_pose — mise en scène gpt-image
      const sourceRow = (await getRow(slide.photo_id)) ?? fallbackProduct;
      if (!sourceRow) {
        finish(false);
        continue;
      }
      const isPorte = slide.source === "generate_porte";
      const { data, error } = await invokeWithTimeout(
        "product-on-model",
        {
          body: {
            photo_id: sourceRow.id,
            workspace_id: sourceRow.workspace_id ?? opts.workspaceId,
            mode: isPorte ? "porte" : "pose",
            framing: "auto",
            ambiance: (slide.scene_en || "").trim().slice(0, 300) || null,
            single: true,
            ...(isPorte && referencePersonB64 ? { reference_person_b64: referencePersonB64 } : {}),
          },
        },
        CALL_TIMEOUT_MS,
      );
      if (data?.error === "premium_required") throw new PremiumRequiredError();
      if (data?.error === "limit_reached" || error?.isRateLimit) {
        creditsExhausted = true;
        toast.error("Tu as utilisé toutes tes retouches photo du mois", {
          description: "Les slides à générer ont été sautées — la séquence continue sans elles.",
        });
        finish(false, true);
        continue;
      }
      const img =
        Array.isArray(data?.images) && typeof data.images[0] === "string"
          ? (data.images[0] as string)
          : null;
      if (error || !img) {
        finish(false);
        continue;
      }
      // Cap du schéma edge (4M caractères) — au-delà on n'ancre pas la référence
      if (isPorte && !referencePersonB64 && img.length <= 4_000_000) {
        referencePersonB64 = img;
      }
      photos.push({
        base64: img,
        preview: img,
        name: slide.beat.slice(0, 60) || "Photo générée",
        context: slide.beat,
        mimeType: "image/jpeg",
        id: crypto.randomUUID(),
      });
      finish(true);
    } catch (e) {
      if (e instanceof PremiumRequiredError) throw e;
      finish(false);
    }
  }

  // Passe de compression unique avant de rendre la main au flux carrousel
  for (const p of photos) {
    p.base64 = await downscaleDataUrl(p.base64);
    p.preview = p.base64;
    p.mimeType = "image/jpeg";
  }

  return { photos, narrativeThread, skipped };
}
