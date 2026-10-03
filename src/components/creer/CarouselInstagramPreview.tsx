import { useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Heart, MessageCircle, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Une slide affichée à une largeur donnée (rendu exact du visuel exporté). */
function SlideView({ html, width }: { html: string; width: number }) {
  return (
    <div className="relative overflow-hidden bg-white" style={{ width, height: width * 1.25 }} aria-hidden="true">
      <iframe
        title=""
        tabIndex={-1}
        sandbox="allow-same-origin"
        srcDoc={`<!doctype html><html><head><style>html,body{margin:0;width:1080px;height:1350px;overflow:hidden}</style></head><body>${html}</body></html>`}
        style={{ position: "absolute", width: 1080, height: 1350, border: 0, transform: `scale(${width / 1080})`, transformOrigin: "top left", pointerEvents: "none" }}
      />
    </div>
  );
}

/**
 * Aperçu Instagram : la slide dans le fil (avec la légende), et le recadrage
 * de la grille du profil (3:4 aujourd'hui, carré pour l'ancien format) pour
 * vérifier que rien d'important n'est coupé.
 */
export default function CarouselInstagramPreview({
  open,
  onOpenChange,
  slides,
  caption,
  start = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slides: { html: string }[];
  caption: string;
  start?: number;
}) {
  const [view, setView] = useState<"fil" | "grille">("fil");
  const [index, setIndex] = useState(start);
  const [more, setMore] = useState(false);
  const [square, setSquare] = useState(false);
  const i = Math.min(index, slides.length - 1);
  const W = 320;
  // Recadrage de la grille : 3:4 coupe les côtés, l'ancien carré coupe haut et bas.
  const cut = square ? { x: 0, y: (1350 - 1080) / 2 / 1350 } : { x: (1080 - 1350 * 0.75) / 2 / 1080, y: 0 };
  const tab = (id: "fil" | "grille", label: string) => (
    <button
      type="button"
      aria-pressed={view === id}
      onClick={() => setView(id)}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${view === id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
    >
      {label}
    </button>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aperçu Instagram</DialogTitle>
          <DialogDescription>Ta publication telle qu’elle apparaîtra, avant de publier.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          {tab("fil", "Dans le fil")}
          {tab("grille", "Dans la grille du profil")}
        </div>
        {view === "fil" ? (
          <div className="mx-auto overflow-hidden rounded-xl border bg-background" style={{ width: W }}>
            <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold">
              <span className="h-7 w-7 rounded-full bg-gradient-to-tr from-amber-400 to-pink-600" aria-hidden="true" />
              ton_compte
            </div>
            <div className="relative">
              {slides[i] && <SlideView html={slides[i].html} width={W} />}
              {i > 0 && (
                <button type="button" aria-label="Slide précédente" onClick={() => setIndex(i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 shadow">
                  <ChevronLeft size={16} />
                </button>
              )}
              {i < slides.length - 1 && (
                <button type="button" aria-label="Slide suivante" onClick={() => setIndex(i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 shadow">
                  <ChevronRight size={16} />
                </button>
              )}
              <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-2xs text-white">
                {i + 1}/{slides.length}
              </span>
            </div>
            <div className="flex items-center gap-3 px-3 pt-2" aria-hidden="true">
              <Heart size={20} />
              <MessageCircle size={20} />
              <Send size={20} />
              <span className="flex flex-1 justify-center gap-1">
                {slides.map((_, k) => (
                  <span key={k} className={`h-1.5 w-1.5 rounded-full ${k === i ? "bg-primary" : "bg-muted-foreground/30"}`} />
                ))}
              </span>
              <Bookmark size={20} />
            </div>
            <p className="whitespace-pre-line px-3 pb-3 pt-2 text-xs">
              <span className="font-semibold">ton_compte </span>
              {more || caption.length <= 125 ? caption : `${caption.slice(0, 125).trimEnd()}… `}
              {!more && caption.length > 125 && (
                <button type="button" className="text-muted-foreground" onClick={() => setMore(true)}>
                  plus
                </button>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="mx-auto grid grid-cols-3 gap-0.5" style={{ width: W }}>
              {Array.from({ length: 6 }, (_, k) => (
                <div key={k} className="relative overflow-hidden bg-muted" style={{ aspectRatio: square ? "1 / 1" : "3 / 4" }}>
                  {k === 0 && slides[0] && (
                    <div className="absolute left-1/2 top-1/2" style={{ transform: "translate(-50%, -50%)" }}>
                      <SlideView html={slides[0].html} width={square ? W / 3 - 1 : ((W / 3 - 1) * 4) / 3 / 1.25} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              La grille montre la 1re slide recadrée. Ce qui est grisé ci-dessous n’y apparaît pas.
            </p>
            <div className="relative mx-auto" style={{ width: 200 }}>
              {slides[0] && <SlideView html={slides[0].html} width={200} />}
              {cut.x > 0 && (
                <>
                  <span className="absolute inset-y-0 left-0 bg-black/50" style={{ width: `${cut.x * 100}%` }} aria-hidden="true" />
                  <span className="absolute inset-y-0 right-0 bg-black/50" style={{ width: `${cut.x * 100}%` }} aria-hidden="true" />
                </>
              )}
              {cut.y > 0 && (
                <>
                  <span className="absolute inset-x-0 top-0 bg-black/50" style={{ height: `${cut.y * 100}%` }} aria-hidden="true" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/50" style={{ height: `${cut.y * 100}%` }} aria-hidden="true" />
                </>
              )}
            </div>
            <label className="flex items-center justify-center gap-2 text-xs">
              <input type="checkbox" checked={square} onChange={(e) => setSquare(e.target.checked)} />
              Ancienne grille carrée
            </label>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
