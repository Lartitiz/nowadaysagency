// ---------------------------------------------------------------------------
// Voiles de lisibilité (gabarits photo composés) : fusion dans la photo native.
//
// Les gabarits photo injectent un voile [data-injected-scrim] (dégradé noir ou
// voile uniforme) entre la photo et le texte. Dans l'export, ce voile partait
// dans le PNG de fond semi-transparent posé PAR-DESSUS la photo native — fidèle
// dans PowerPoint, mais l'IMPORT CANVA ne rend pas ce calque de façon fiable :
// le calque est bien importé (visible dans le panneau Calques, transparence
// normale, géométrie pleine slide) mais son rendu est aléatoirement absent ou
// déplacé, dans l'éditeur COMME dans les exports serveur Canva (vérifié le
// 22/07 sur 4 fichiers de bissection + un export live). Résultat : texte blanc
// posé à nu sur photo claire.
//
// Parade déterministe : retirer le voile du raster et le CUIRE dans le JPEG de
// la photo native (une seule image opaque — toujours rendue). Seuls les voiles
// au format connu (générés par photo-overlay-templates) et contenus dans une
// zone photo réellement posée en natif sont fusionnés ; tout autre voile reste
// dans le raster (comportement historique).
// ---------------------------------------------------------------------------

export interface ScrimSpec {
  /** Rect du voile dans le repère de la slide (px iframe). */
  rect: { x: number; y: number; w: number; h: number };
  kind: "gradient" | "uniform";
  /** gradient : bord porteur du noir ("bottom" = alpha max en bas). */
  anchor?: "top" | "bottom";
  /** Alpha max du voile (pic du dégradé ou opacité du voile uniforme). */
  alpha: number;
  /** Couleur du voile "r,g,b" : noir historique ou teinte foncée de la marque. */
  rgb?: string;
}

/**
 * Parse le style d'un [data-injected-scrim]. Formats générés par NOTRE code
 * (photo-overlay-templates.ts : gradientScrim / fullDim) :
 *   linear-gradient(0deg,   rgba(R,G,B,P) 0%, rgba(R,G,B,0) 100%)  → pic en bas
 *   linear-gradient(180deg, rgba(R,G,B,P) 0%, rgba(R,G,B,0) 100%)  → pic en haut
 *   background-color rgba(R,G,B,A) sans background-image            → uniforme
 * R,G,B = noir (historique) ou teinte foncée de la marque (02/10/2026) ; les
 * deux arrêts du dégradé doivent porter la MÊME couleur.
 * ⚠️ getComputedStyle OMET l'angle quand c'est la direction par défaut :
 * `180deg` (= to bottom) sérialise SANS angle → angle absent = pic en haut.
 * Retourne null si le style ne matche pas — le voile reste alors dans le raster.
 */
export function parseScrimStyle(
  backgroundImage: string,
  backgroundColor: string,
): Omit<ScrimSpec, "rect"> | null {
  const grad = (backgroundImage || "").match(
    /linear-gradient\(\s*(?:(0|180)deg\s*,\s*)?rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([\d.]+)\s*\)(?:\s*0%)?\s*,\s*rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*0\s*\)(?:\s*100%)?\s*\)/i,
  );
  if (grad) {
    const alpha = parseFloat(grad[5]);
    if (!(alpha > 0 && alpha <= 1)) return null;
    const from = [grad[2], grad[3], grad[4]].map(Number), to = [grad[6], grad[7], grad[8]].map(Number);
    if (from.some((v, i) => v !== to[i] || v > 255)) return null;
    // CSS : 0deg = dégradé orienté vers le haut → premier stop (opaque) au BAS.
    // Angle absent (défaut 180deg = to bottom) → premier stop (opaque) en HAUT.
    return { kind: "gradient", anchor: grad[1] === "0" ? "bottom" : "top", alpha, ...(from.some(Boolean) ? { rgb: from.join(",") } : {}) };
  }
  if (!backgroundImage || backgroundImage === "none") {
    const uni = (backgroundColor || "").match(/rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([\d.]+)\s*\)/i);
    if (uni) {
      const alpha = parseFloat(uni[4]);
      const rgb = [uni[1], uni[2], uni[3]].map(Number);
      if (alpha > 0 && alpha < 0.99 && rgb.every(v => v <= 255)) return { kind: "uniform", alpha, ...(rgb.some(Boolean) ? { rgb: rgb.join(",") } : {}) };
    }
  }
  return null;
}

/**
 * Dessine les voiles par-dessus la photo déjà recadrée au ratio de la zone,
 * et renvoie un JPEG (data URL). `zoneRect` et `scrims[].rect` sont dans le
 * repère de la slide (px iframe) ; le mapping vers les pixels du canvas est
 * proportionnel (le ratio de la photo recadrée = ratio de la zone).
 */
export async function burnScrimsIntoPhoto(
  photoDataUrl: string,
  zoneRect: { x: number; y: number; w: number; h: number },
  scrims: ScrimSpec[],
  timeoutMs = 5000,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ""; resolve(null); }, timeoutMs);
    img.onload = () => {
      clearTimeout(t);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width || !canvas.height || !zoneRect.w || !zoneRect.h) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const sx = canvas.width / zoneRect.w;
        const sy = canvas.height / zoneRect.h;
        for (const s of scrims) {
          const rx = (s.rect.x - zoneRect.x) * sx;
          const ry = (s.rect.y - zoneRect.y) * sy;
          const rw = s.rect.w * sx;
          const rh = s.rect.h * sy;
          if (rw <= 0 || rh <= 0) continue;
          const rgb = s.rgb || "0,0,0";
          if (s.kind === "uniform") {
            ctx.fillStyle = `rgba(${rgb},${s.alpha})`;
          } else {
            const from = s.anchor === "top" ? ry : ry + rh;
            const to = s.anchor === "top" ? ry + rh : ry;
            const g = ctx.createLinearGradient(0, from, 0, to);
            g.addColorStop(0, `rgba(${rgb},${s.alpha})`);
            g.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = g;
          }
          ctx.fillRect(rx, ry, rw, rh);
        }
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = photoDataUrl;
  });
}
