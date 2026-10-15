// Navigation entre les 7 cartes de la relecture : carte en cours, flèches du
// clavier et swipe. Sorti de BrandingReview.tsx à l'identique (fiche 14 de
// docs/robustesse/gros-fichiers.md, lot 3). Les flèches sont coupées pendant
// le coaching (`coachingSection`) et dans un champ de saisie.
import { useState, useCallback, useEffect, useRef } from "react";
import { SECTIONS, type SectionKey } from "./types";

export function useReviewCarousel(coachingSection: SectionKey | null) {
  /* ── Carrousel : une section par carte ────────────────────────────────────
     La longue page qui empilait les 7 sections ne disait ni où on en était ni
     ce qu'il restait à faire. Une carte à la fois, avec une réponse explicite
     (« c'est bon » / « à revoir »), rend l'étape lisible ; les « à revoir »
     sont rappelées à la fin au lieu de se perdre dans le scroll.
     Le swipe est un RACCOURCI tactile, jamais le seul moyen de répondre :
     sur ordinateur il n'y a pas de doigt, et un swipe seul ne dit pas si on a
     validé ou seulement regardé. ── */
  const total = SECTIONS.length;
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const finished = index >= total;

  const goTo = useCallback((i: number) => setIndex(Math.max(0, Math.min(total, i))), [total]);
  const goNext = useCallback(() => setIndex((i) => Math.min(total, i + 1)), [total]);
  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (coachingSection) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // On ne vole pas les flèches d'un champ en cours de saisie (couleurs, offres…).
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [coachingSection, goNext, goPrev]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0]?.clientX ?? null; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(dx) < 60) return; // seuil : un scroll vertical ne doit pas changer de carte
    if (dx < 0) goNext(); else goPrev();
  };

  return { total, index, setIndex, finished, goTo, goNext, goPrev, handleTouchStart, handleTouchEnd };
}
