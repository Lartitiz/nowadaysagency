import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StudioComposition } from "./api";
const EMPTY: StudioComposition = {
  title: "",
  body: "",
  footer: "",
  format: "portrait",
  background: "#ffffff",
  foreground: "#242124",
  accent: "#863f67",
  font: "sans-serif",
  align: "left",
};
export function StudioCompositionEditor(
  { open, onOpenChange, initial, backgroundUrl, disabled, onSave, onExport }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    initial?: StudioComposition;
    backgroundUrl?: string | null;
    disabled: boolean;
    onSave: (design: StudioComposition, useImage: boolean) => Promise<unknown>;
    onExport?: (blob: Blob) => Promise<void>;
  },
) {
  const [design, setDesign] = useState<StudioComposition>(initial || EMPTY),
    [useImage, setUseImage] = useState(!!backgroundUrl),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const preview = useRef<HTMLDivElement>(null),
    textBox = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setDesign(initial || EMPTY);
      setUseImage(!!backgroundUrl);
      setError("");
      setSaved(false);
    }
    wasOpen.current = open;
  }, [open, initial, backgroundUrl]); // Keep edits while server acknowledges a save.
  const patch = (key: keyof StudioComposition, value: string | null) => {
    setSaved(false);
    setDesign((old) => ({ ...old, [key]: value }));
  };
  async function raster() {
    const node = preview.current;
    if (!node) throw new Error("Aperçu indisponible.");
    await document.fonts.ready;
    await Promise.all(
      [...node.querySelectorAll("img")].map((image) => image.decode()),
    );
    if (
      textBox.current &&
      textBox.current.scrollHeight > textBox.current.clientHeight + 2
    ) {
      throw new Error(
        "Le texte dépasse le format. Raccourcis-le ou choisis un format plus haut avant d’exporter.",
      );
    }
    const { default: html2canvas } = await import("html2canvas-pro");
    const canvas = await html2canvas(node, {
      scale: 1080 / node.offsetWidth,
      useCORS: true,
      backgroundColor: design.background,
    });
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Export impossible.")),
        "image/png",
      )
    );
  }
  async function run(exportMode?: "download" | "content") {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      if (!await onSave(design, useImage)) {
        throw new Error(
          "La composition n’a pas été enregistrée. Tes modifications restent ici.",
        );
      }
      setSaved(true);
      if (exportMode) {
        const blob = await raster();
        if (exportMode === "content" && onExport) await onExport(blob);
        else {
          const url = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = url;
          a.download = "visuel-studio.png";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }
  const fontFamily = design.font === "sans-serif"
    ? "Arial, sans-serif"
    : design.font === "serif"
    ? "Georgia, serif"
    : design.font;
  const height = design.format === "square"
    ? 360
    : design.format === "story"
    ? 640
    : 450;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-5xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Composer mon visuel</DialogTitle>
          <DialogDescription>
            Les textes restent modifiables. Aucun crédit image pour composer ou
            corriger les informations.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm">
              Titre<Input
                value={design.title}
                maxLength={180}
                disabled={disabled || busy}
                onChange={(e) => patch("title", e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Texte<Textarea
                value={design.body}
                maxLength={1200}
                disabled={disabled || busy}
                onChange={(e) => patch("body", e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Informations pratiques<Textarea
                value={design.footer}
                maxLength={300}
                disabled={disabled || busy}
                onChange={(e) => patch("footer", e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="text-sm">
                Format<select
                  className="block"
                  value={design.format}
                  disabled={disabled || busy}
                  onChange={(e) => patch("format", e.target.value)}
                >
                  <option value="square">Carré · 1:1</option>
                  <option value="portrait">Publication · 4:5</option>
                  <option value="story">Story · 9:16</option>
                </select>
              </label>
              <label className="text-sm">
                Alignement<select
                  className="block"
                  value={design.align}
                  disabled={disabled || busy}
                  onChange={(e) => patch("align", e.target.value)}
                >
                  <option value="left">À gauche</option>
                  <option value="center">Centré</option>
                </select>
              </label>
            </div>
            <div className="flex gap-4">
              {(["background", "foreground", "accent"] as const).map((
                key,
                i,
              ) => (
                <label className="text-xs" key={key}>
                  {["Fond", "Texte", "Accent"][i]}
                  <input
                    type="color"
                    className="block"
                    value={design[key]}
                    disabled={disabled || busy}
                    onChange={(e) => patch(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
            {backgroundUrl && (
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useImage}
                  disabled={disabled || busy}
                  onChange={(e) => setUseImage(e.target.checked)}
                />Utiliser l’image sélectionnée
              </label>
            )}
            <label className="block text-sm">
              Logo à conserver<input
                className="block max-w-full text-xs"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={disabled || busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  try {
                    if (file && file.size <= 5_000_000) {
                      const bitmap = await createImageBitmap(file);
                      const canvas = document.createElement("canvas");
                      const scale = Math.min(
                        1,
                        600 / Math.max(bitmap.width, bitmap.height),
                      );
                      canvas.width = Math.max(
                        1,
                        Math.round(bitmap.width * scale),
                      );
                      canvas.height = Math.max(
                        1,
                        Math.round(bitmap.height * scale),
                      );
                      canvas.getContext("2d")!.drawImage(
                        bitmap,
                        0,
                        0,
                        canvas.width,
                        canvas.height,
                      );
                      bitmap.close();
                      const data = canvas.toDataURL("image/png");
                      if (data.length > 400000) {
                        setError(
                          "Le logo est trop détaillé. Utilise une version plus légère.",
                        );
                      } else patch("logo_data_url", data);
                    } else if (file) {
                      setError("Choisis un logo de moins de 5 Mo.");
                    }
                  } catch {
                    setError(
                      "Ce logo ne peut pas être lu. Choisis un fichier PNG, JPEG ou WebP.",
                    );
                  }
                }}
              />
            </label>
            {design.logo_data_url && (
              <Button
                variant="ghost"
                onClick={() => patch("logo_data_url", null)}
              >
                Retirer le logo
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Le logo et les textes sont conservés avec la composition. Le
              visuel exporté est une image ; les textes se rééditent dans le
              Studio.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={disabled || busy} onClick={() => void run()}>
                Enregistrer la composition
              </Button>
              <Button
                variant="outline"
                disabled={disabled || busy}
                onClick={() => void run("download")}
              >
                Télécharger le PNG
              </Button>
              {onExport && (
                <Button
                  variant="outline"
                  disabled={disabled || busy}
                  onClick={() => void run("content")}
                >
                  Utiliser dans un contenu
                </Button>
              )}
            </div>
            {saved && (
              <p role="status" className="text-sm">
                Composition enregistrée dans cette session.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <div className="overflow-auto bg-muted rounded-xl p-3">
            <div
              ref={preview}
              aria-label="Aperçu de la composition"
              style={{
                width: 360,
                height,
                background: design.background,
                color: design.foreground,
                fontFamily,
                textAlign: design.align,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {useImage && backgroundUrl && (
                <img
                  crossOrigin="anonymous"
                  src={backgroundUrl}
                  alt="Visuel sélectionné"
                  style={{
                    width: "100%",
                    height: height * .4,
                    objectFit: "contain",
                  }}
                />
              )}
              <div
                ref={textBox}
                style={{
                  padding: 26,
                  flex: 1,
                  minHeight: 0,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <h2
                  style={{
                    fontFamily,
                    letterSpacing: 0,
                    fontSize: 30,
                    fontWeight: 700,
                    lineHeight: 1.12,
                    color: design.accent,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {design.title}
                </h2>
                <p
                  style={{
                    fontFamily,
                    fontSize: 16,
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {design.body}
                </p>
                <p
                  style={{
                    fontFamily,
                    fontSize: 13,
                    lineHeight: 1.4,
                    marginTop: "auto",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {design.footer}
                </p>
                {design.logo_data_url && (
                  <img
                    src={design.logo_data_url}
                    alt="Logo"
                    style={{
                      maxWidth: 110,
                      maxHeight: 50,
                      objectFit: "contain",
                      alignSelf: design.align === "center"
                        ? "center"
                        : "flex-start",
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
