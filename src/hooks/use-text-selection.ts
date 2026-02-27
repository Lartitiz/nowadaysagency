import { useState, useEffect, useRef, useCallback } from "react";

interface SelectionData {
  text: string;
}

interface MenuPosition {
  top: number;
  left: number;
}

export function useTextSelection() {
  const [selection, setSelection] = useState<SelectionData | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setIsVisible(false);
    setSelection(null);
  }, []);

  useEffect(() => {
    const handleMouseUp = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      timeoutRef.current = setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim();

        // Only show menu in editable/generated content areas
        const anchorNode = sel?.anchorNode;
        const container = anchorNode?.parentElement?.closest(
          '[data-selection-enabled="true"], textarea, [role="textbox"], .editable-content, .generated-content, [contenteditable="true"]'
        );
        if (!container) return;

        if (text && text.length > 3) {
          const range = sel!.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          setSelection({ text });
          setMenuPosition({
            top: rect.top + window.scrollY,
            left: rect.left + rect.width / 2,
          });
          setIsVisible(true);
        }
      }, 350);
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-selection-menu]")) {
        close();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [close]);

  return { selection, menuPosition, isVisible, close };
}
