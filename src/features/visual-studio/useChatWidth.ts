// Largeur réglable de la conversation du Studio (glisser, double-clic, flèches),
// mémorisée dans le navigateur. Fiche 4 de docs/robustesse/gros-fichiers.md,
// lot 1 : déplacé à l'identique depuis src/pages/VisualStudioPage.tsx.
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const CHAT_WIDTH_KEY = "visual-studio-chat-width";
const CHAT_WIDTH_DEFAULT = 430;
const CHAT_WIDTH_MIN = 340;
const CHAT_WIDTH_MAX = 760;

export function useChatWidth() {
  const gridRef = useRef<HTMLDivElement>(null);
  const chatWidthLatest = useRef(CHAT_WIDTH_DEFAULT);
  const [chatWidth, setChatWidth] = useState(() => {
    try {
      const value = Number(localStorage.getItem(CHAT_WIDTH_KEY));
      return Number.isFinite(value) && value >= CHAT_WIDTH_MIN && value <= CHAT_WIDTH_MAX
        ? value
        : CHAT_WIDTH_DEFAULT;
    } catch {
      return CHAT_WIDTH_DEFAULT;
    }
  });
  chatWidthLatest.current = chatWidth;
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const persistChatWidth = useCallback((value: number) => {
    try {
      localStorage.setItem(CHAT_WIDTH_KEY, String(value));
    } catch {
      /* Le réglage de largeur reste pour la session. */
    }
  }, []);
  const startChatResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      handle.dataset.resizing = "true";
      const move = (ev: PointerEvent) => {
        const grid = gridRef.current;
        if (!grid) return;
        const rect = grid.getBoundingClientRect();
        const next = Math.min(
          CHAT_WIDTH_MAX,
          Math.max(CHAT_WIDTH_MIN, Math.round(ev.clientX - rect.left)),
        );
        chatWidthLatest.current = next;
        setChatWidth(next);
      };
      const end = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        delete handle.dataset.resizing;
        persistChatWidth(chatWidthLatest.current);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    },
    [persistChatWidth],
  );
  const resetChatWidth = useCallback(() => {
    setChatWidth(CHAT_WIDTH_DEFAULT);
    chatWidthLatest.current = CHAT_WIDTH_DEFAULT;
    persistChatWidth(CHAT_WIDTH_DEFAULT);
  }, [persistChatWidth]);
  const onResizerKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setChatWidth((w) => {
      const next = Math.min(
        CHAT_WIDTH_MAX,
        Math.max(CHAT_WIDTH_MIN, w + (e.key === "ArrowLeft" ? -24 : 24)),
      );
      chatWidthLatest.current = next;
      persistChatWidth(next);
      return next;
    });
  };
  return { gridRef, chatWidth, wide, startChatResize, resetChatWidth, onResizerKey };
}
