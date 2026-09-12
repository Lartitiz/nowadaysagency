import { useEffect, useState } from "react";
import {
  checkCarouselQuality,
  type QualityIssue,
} from "@/lib/carousel-quality";
export interface CarouselQuality {
  status: "idle" | "checking" | "done" | "error";
  issues: QualityIssue[];
  message?: string;
  disabledReason?: string;
  recheck: () => void;
}
export function useCarouselQuality(
  slides: { html: string }[],
  enabled: boolean,
): CarouselQuality {
  const [run, setRun] = useState(0);
  const [report, setReport] = useState<{
    slides: typeof slides;
    run: number;
    issues: QualityIssue[];
    error?: string;
  }>();
  useEffect(() => {
    if (!enabled || !slides.length) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      checkCarouselQuality(slides, abort.signal)
        .then((issues) => {
          if (!abort.signal.aborted) setReport({ slides, run, issues });
        })
        .catch((error) => {
          if (!abort.signal.aborted)
            setReport({
              slides,
              run,
              issues: [],
              error:
                error.message ||
                "Contrôle indisponible. Relance-le avant publication.",
            });
        });
    }, 1000);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [slides, enabled, run]);
  const current = report?.slides === slides && report.run === run;
  const status =
    !enabled || !slides.length
      ? "idle"
      : !current
        ? "checking"
        : report?.error
          ? "error"
          : "done";
  const issues = current ? report!.issues : [];
  const disabledReason =
    status === "checking"
      ? "Contrôle qualité en cours : attends sa fin avant de publier."
      : status === "error"
        ? "Relance le contrôle qualité avant de publier."
        : issues.some((i) => i.severity === "error")
          ? "Corrige les textes coupés ou les images manquantes avant de publier."
          : undefined;
  return {
    status,
    issues,
    message: current ? report?.error : undefined,
    disabledReason,
    recheck: () => setRun((n) => n + 1),
  };
}
