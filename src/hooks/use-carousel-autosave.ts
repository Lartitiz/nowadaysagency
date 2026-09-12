import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CarouselAutosaver,
  CarouselConflict,
  type CloudMeta,
  type DraftStore,
  type CarouselVersion,
} from "@/lib/carousel-autosave";

interface Options {
  enabled: boolean;
  userId: string;
  workspaceId: string;
  ideaId: string | null;
  isOwnSpace: boolean;
  raw: any;
  title: string;
  channel: string;
  onId: (id: string) => void;
  onSaved: (meta: CloudMeta) => void;
  onRestore: (raw: any) => void;
}
export function useCarouselAutosave(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [state, setState] = useState<{
    status: string;
    message?: string;
    revision?: string;
  }>({ status: "waiting" });
  const [history, setHistory] = useState<CarouselVersion[]>([]);
  const controller = useRef<CarouselAutosaver>();
  const scope = useRef<{ document: string; key: string }>();
  const controllerKey = useRef("");
  const disposal = useRef<ReturnType<typeof setTimeout>>();
  const identity = options.raw?._carousel_document_id;
  const snapshot = useMemo(() => options.raw, [options.raw]);
  const [copy, setCopy] = useState(0);

  const flush = useCallback(async () => {
    const c = controller.current;
    if (!c || !latest.current.enabled) return false;
    if (
      scope.current?.key !==
      `${latest.current.userId}:${latest.current.workspaceId}`
    )
      return false;
    c.queue(latest.current.raw);
    setState({ status: navigator.onLine ? "saving" : "offline" });
    try {
      await c.flush();
      if (
        controller.current !== c ||
        scope.current?.key !==
          `${latest.current.userId}:${latest.current.workspaceId}`
      )
        return false;
      setState({
        status: c.dirty ? "saving" : "saved",
        revision: c.meta?.revision,
      });
      return !c.dirty;
    } catch (error) {
      if (
        controller.current === c &&
        scope.current?.key ===
          `${latest.current.userId}:${latest.current.workspaceId}`
      )
        setState({
          status:
            error instanceof CarouselConflict
              ? "conflict"
              : navigator.onLine
                ? "error"
                : "offline",
          message:
            error instanceof Error
              ? error.message
              : "Sauvegarde impossible. Réessaie.",
        });
      return false;
    }
  }, []);

  useEffect(() => {
    if (!options.enabled || !identity) return;
    const o = latest.current;
    const currentScope = `${o.userId}:${o.workspaceId}`;
    if (
      scope.current?.document === identity &&
      scope.current.key !== currentScope
    ) {
      setState({
        status: "blocked",
        message:
          "L’espace de travail a changé. Reprends ce brouillon dans son espace d’origine.",
      });
      return;
    }
    const key = `${identity}:${copy}`;
    if (controller.current && controllerKey.current === key) return;
    const previous = controller.current;
    if (previous) {
      previous.detach();
      void previous
        .flush()
        .catch(() => {})
        .finally(() => previous.dispose());
    }
    scope.current = { document: identity, key: currentScope };
    controllerKey.current = key;
    const id = copy ? crypto.randomUUID() : o.ideaId || crypto.randomUUID();
    const scoped = (query: any) =>
      o.workspaceId !== o.userId
        ? o.isOwnSpace
          ? query.or(
              `workspace_id.eq.${o.workspaceId},and(workspace_id.is.null,user_id.eq.${o.userId})`,
            )
          : query.eq("workspace_id", o.workspaceId)
        : query.eq("user_id", o.userId).is("workspace_id", null);
    const store: DraftStore = {
      async read(draftId) {
        const { data, error } = await scoped(
          supabase
            .from("saved_ideas")
            .select("id,updated_at,content_data")
            .eq("id", draftId),
        )
          .abortSignal(AbortSignal.timeout(20_000))
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      async insert(draftId, raw) {
        const { data, error } = await supabase
          .from("saved_ideas")
          .insert({
            id: draftId,
            user_id: o.userId,
            workspace_id: o.workspaceId !== o.userId ? o.workspaceId : null,
            titre: o.title.trim() || "Mon carrousel",
            angle: "Carrousel",
            format: "carousel",
            canal: o.channel,
            type: "draft",
            status: "to_explore",
            source_module: "creer",
            content_data: raw,
          })
          .select("id,updated_at,content_data")
          .abortSignal(AbortSignal.timeout(20_000))
          .single();
        if (error) throw error;
        return data;
      },
      async update(draftId, timestamp, raw) {
        let query = scoped(
          supabase
            .from("saved_ideas")
            .update({ content_data: raw })
            .eq("id", draftId),
        );
        query =
          timestamp === null
            ? query.is("updated_at", null)
            : query.eq("updated_at", timestamp);
        const { data, error } = await query
          .select("id,updated_at,content_data")
          .abortSignal(AbortSignal.timeout(20_000))
          .maybeSingle();
        if (error) throw error;
        return data;
      },
    };
    const c = new CarouselAutosaver(
      id,
      !copy && !!o.ideaId,
      o.raw,
      store,
      (meta) => {
        if (
          controller.current === c &&
          scope.current?.key ===
            `${latest.current.userId}:${latest.current.workspaceId}`
        ) {
          setHistory(meta.history);
          latest.current.onSaved(meta);
        }
      },
    );
    controller.current = c;
    c.queue(o.raw);
    o.onId(id);
    setState({ status: "saving" });
    setHistory([]);
    // ID is reserved once. Its parent echo must not reset an in-flight write.
  }, [options.enabled, identity, options.userId, options.workspaceId, copy]);

  useEffect(() => {
    if (
      !options.enabled ||
      !controller.current ||
      scope.current?.key !== `${options.userId}:${options.workspaceId}`
    )
      return;
    controller.current.queue(snapshot);
    if (!controller.current.dirty) return;
    setState({ status: navigator.onLine ? "saving" : "offline" });
    const timer = window.setTimeout(() => void flush(), 1200);
    return () => window.clearTimeout(timer);
  }, [
    snapshot,
    options.enabled,
    options.userId,
    options.workspaceId,
    copy,
    flush,
  ]);

  useEffect(() => {
    clearTimeout(disposal.current);
    return () => {
      // Survives React's development effect replay; SPA navigation flushes the
      // last debounced edit without delivering state into the departed page.
      disposal.current = setTimeout(() => {
        const c = controller.current;
        if (c) {
          c.detach();
          void c
            .flush()
            .catch(() => {})
            .finally(() => c.dispose());
        }
      }, 0);
    };
  }, []);

  useEffect(() => {
    const online = () => void flush();
    const visibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (controller.current?.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [flush]);
  const restore = async (version: CarouselVersion) => {
    if (!(await flush())) return;
    controller.current?.checkpoint();
    latest.current.onRestore({
      ...version.raw,
      _carousel_document_id: identity,
      _carousel_cloud: controller.current?.meta,
    });
  };
  return {
    ...state,
    history,
    enabled: options.enabled,
    flush,
    restore,
    saveCopy: () => setCopy((n) => n + 1),
  };
}
