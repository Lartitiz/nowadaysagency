import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadFlowState, saveFlowState } from "@/hooks/use-flow-persistence";
import { externalizeCarouselMedia } from "@/lib/carousel-media";
import { deriveCanalFromState, mapFormatToContentType } from "@/features/creer/format-mappers";
import {
  CREER_DRAFT_KEY, draftFlowOf, draftPreviewText, draftSignature, ideaAcceptsDraft, isCreerDraftStage,
  type CreerDraftPhoto, type CreerDraftSnapshot,
} from "@/features/creer/creer-draft-idea";

// Range le contenu commencé dans Mes idées dès la 2e étape (creer-draft-idea.ts).
// Écrit 1,2 s après la dernière modification, et tout de suite quand on quitte
// la page. Une écriture qui échoue ne bloque rien : la fenêtre « Tu as déjà un
// contenu en cours » protège alors le brouillon, comme avant.
const DEBOUNCE_MS = 1200;

// Écriture encore en route au moment où la page suivante s'ouvre (départ de /creer).
let inflight: Promise<void> = Promise.resolve();
export function waitForPendingDraftWrites(): Promise<void> {
  return inflight;
}

type Photo = { id?: string; base64?: string; preview?: string; userPhotoId?: string; edited?: boolean; missingLocalPhoto?: boolean; [k: string]: any };

async function draftPhotos(photos: Photo[], userId: string): Promise<CreerDraftPhoto[] | null> {
  const out: CreerDraftPhoto[] = [];
  for (const [index, p] of photos.entries()) {
    const meta: CreerDraftPhoto = {
      id: String(p.id || `photo-${index + 1}`), name: p.name, mimeType: p.mimeType, context: p.context, libraryContext: p.libraryContext,
      edited: !!p.edited, stockSource: p.stockSource, stockPhotographer: p.stockPhotographer, stockSourceUrl: p.stockSourceUrl,
      ...(p.stockAmbient ? { stockAmbient: true } : {}),
    };
    if (p.userPhotoId && !p.edited) { out.push({ ...meta, userPhotoId: p.userPhotoId }); continue; }
    const source = p.base64 || "";
    if (!source || p.missingLocalPhoto) return null; // photo pas encore relue : on attend
    const dataUrl = source.startsWith("data:") ? source : `data:${p.mimeType || "image/jpeg"};base64,${source}`;
    const url = await externalizeCarouselMedia(dataUrl, userId);
    // Lien public, ou petite image gardée telle quelle. Une grosse photo non rangée : pas d'écriture.
    if (!url.startsWith("https://") && url.length > 40_000) return null;
    out.push({ ...meta, url, ...(p.userPhotoId ? { userPhotoId: p.userPhotoId } : {}) });
  }
  return out;
}

/**
 * Écrit le brouillon dans sa fiche de Mes idées (ou en crée une). Renvoie l'id
 * de la fiche, ou null si le brouillon n'a pas pu être rangé (photo pas encore
 * relue, fiche qui porte un contenu écrit, réseau…).
 */
export async function writeCreerDraft({ userId, workspaceId, flowState, photos, ideaId, skipSignature }: {
  userId: string;
  workspaceId: string;
  flowState: Record<string, any>;
  photos: Photo[];
  ideaId: string | null;
  /** Rien n'a changé depuis la dernière écriture : on ne réécrit pas. */
  skipSignature?: (id: string | null, signature: string) => boolean;
}): Promise<{ id: string; signature: string } | null> {
  const flow = draftFlowOf(flowState);
  const draftPhotosList = await draftPhotos(photos, userId);
  if (!draftPhotosList) return null;
  const snapshot: CreerDraftSnapshot = { version: 1, flow, photos: draftPhotosList };
  const signature = draftSignature(snapshot);
  if (skipSignature?.(ideaId, signature)) return ideaId ? { id: ideaId, signature } : null;
  const content = { [CREER_DRAFT_KEY]: snapshot, resume: draftPreviewText(flow) };
  const selectedFormat = (flow.selectedFormat as string | null) ?? null;
  const contentType = mapFormatToContentType(selectedFormat);
  const format = selectedFormat === "carousel" ? "carousel" : contentType === "story" ? "story_serie" : selectedFormat || "post";
  const canal = deriveCanalFromState(flow as any) || (flow.forcedChannel as string) || "instagram";
  const title = String(flow.ideaText || flow.photoSubject || "").trim().slice(0, 120) || "Contenu en cours";
  if (ideaId) {
    // Fiche existante (idée de départ ou brouillon déjà rangé) : jamais un contenu écrit écrasé.
    const { data, error } = await supabase.from("saved_ideas").select("content_data, format").eq("id", ideaId).maybeSingle();
    if (error || !data || !ideaAcceptsDraft((data as any).content_data, (data as any).format)) return null;
    const previous = (data as any).content_data;
    const base = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
    const ownDraft = !!base[CREER_DRAFT_KEY] || !previous;
    const { error: updateError } = await supabase.from("saved_ideas")
      .update({ content_data: { ...base, ...content }, ...(ownDraft ? { titre: title, format, canal } : {}), updated_at: new Date().toISOString() } as any)
      .eq("id", ideaId);
    return updateError ? null : { id: ideaId, signature };
  }
  const { data, error } = await supabase.from("saved_ideas").insert({
    user_id: userId,
    workspace_id: workspaceId && workspaceId !== userId ? workspaceId : null,
    titre: title,
    angle: "brouillon",
    format,
    canal,
    objectif: (flow.objective as string) || null,
    type: "draft",
    status: "to_explore",
    source_module: "creer",
    content_data: content,
  } as any).select("id").single();
  const id = (data as { id?: string } | null)?.id;
  if (error || typeof id !== "string" || !id) return null;
  return { id, signature };
}

export function useCreerDraftIdea(o: {
  enabled: boolean;
  userId: string | undefined;
  workspaceId: string;
  step: string;
  hasResult: boolean;
  hasEditContent: boolean;
  generating: boolean;
  subject: string;
  photos: Photo[];
  photosReady: boolean;
  editingIdeaId: string | null;
  /** Nouvelle création (« Démarrer le nouveau contenu ») : nouvelle fiche. */
  creationId: string;
  /** Toutes les valeurs du brouillon : un changement relance l'écriture. */
  watch: unknown[];
  onId: (id: string) => void;
}) {
  const latest = useRef(o);
  latest.current = o;
  const lastSaved = useRef<{ id: string; signature: string } | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounting = useRef(false);
  // Fiche créée par ce brouillon, avant même que la page ait reçu son id.
  const created = useRef<{ creationId: string; id: string } | null>(null);

  const eligible = o.enabled && !!o.userId && o.photosReady && isCreerDraftStage({
    step: o.step, hasResult: o.hasResult, hasEditContent: o.hasEditContent, generating: o.generating,
    photoCount: o.photos.length, subject: o.subject,
  });

  const save = () => {
    const s = latest.current;
    const flowState = loadFlowState();
    const photos = s.photos;
    const creationId = s.creationId;
    if (!s.userId || !flowState) return;
    const userId = s.userId;
    queue.current = queue.current.then(async () => {
      const ideaId = s.editingIdeaId ?? (created.current?.creationId === creationId ? created.current.id : null);
      const saved = await writeCreerDraft({
        userId, workspaceId: s.workspaceId, flowState: flowState as Record<string, any>, photos, ideaId,
        skipSignature: (id, signature) => !!id && lastSaved.current?.id === id && lastSaved.current.signature === signature,
      });
      if (!saved) return;
      lastSaved.current = saved;
      if (!ideaId) {
        created.current = { creationId, id: saved.id };
        if (latest.current.creationId === creationId && !unmounting.current) latest.current.onId(saved.id);
        // Page déjà quittée : la copie de l'onglet apprend quand même sa fiche (pas de doublon ensuite).
        else if (loadFlowState()?.creationId === creationId) saveFlowState({ editingIdeaId: saved.id });
      }
    }).catch((error) => console.warn("[creer-draft-idea] brouillon non rangé", error));
    inflight = queue.current;
  };

  // Déclaré avant l'écriture différée : au démontage, ses cleanups passent en premier.
  // Quitter la page (autre contenu, Mes idées…) : la dernière retouche part tout de suite.
  useEffect(() => () => {
    unmounting.current = true;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; save(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!eligible) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; save(); }, DEBOUNCE_MS);
    return () => {
      // Au démontage, la cleanup du dessus a déjà envoyé la dernière retouche.
      if (timer.current && !unmounting.current) { clearTimeout(timer.current); timer.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, o.editingIdeaId, o.photos, ...o.watch]);

}
