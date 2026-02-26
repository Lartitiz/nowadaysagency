
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const PINK = [233, 30, 140] as const;   // #E91E8C
const DARK = [26, 26, 46] as const;     // #1A1A2E
const GREY = [120, 120, 140] as const;
const WHITE = [255, 255, 255] as const;
const GREEN_BG = [230, 245, 230] as const;
const ORANGE_BG = [255, 240, 220] as const;
const PINK_BG = [255, 230, 245] as const;

const MARGIN = 20;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;

function scoreColor(score: number): readonly [number, number, number] {
  if (score >= 70) return [34, 139, 34];
  if (score >= 50) return [210, 140, 0];
  return [200, 30, 30];
}

function drawSectionHeader(doc: InstanceType<typeof import("jspdf").default>, y: number, title: string, bgColor: readonly [number, number, number]): number {
  doc.setFillColor(...bgColor);
  doc.roundedRect(MARGIN, y, CONTENT_W, 12, 3, 3, "F");
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text(title, MARGIN + 5, y + 8.5);
  return y + 18;
}

function addWrappedText(doc: any, text: string, x: number, y: number, maxW: number, lineH: number): number {
  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    if (y > 270) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, x, y);
    y += lineH;
  }
  return y;
}

function drawSeparator(doc: any, y: number): number {
  doc.setDrawColor(220, 220, 230);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 4;
}

// TODO: type mirrorData with a proper MirrorResult interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportMirrorPDF(mirrorData: any) {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const dateStr = format(new Date(), "d MMMM yyyy", { locale: fr });

  // ── PAGE 1 — Couverture ──
  let y = 60;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...DARK);
  doc.text("Branding Mirror", PAGE_W / 2, y, { align: "center" });
  y += 10;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(...GREY);
  doc.text("Diagnostic de cohérence de marque", PAGE_W / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(10);
  doc.text(dateStr, PAGE_W / 2, y, { align: "center" });
  y += 30;

  // Score
  const score = mirrorData.coherence_score ?? 0;
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(48);
  doc.setTextColor(...scoreColor(score));
  doc.text(`${score}/100`, PAGE_W / 2, y, { align: "center" });
  y += 12;

  doc.setFontSize(11);
  doc.setTextColor(...GREY);
  doc.text("Score de cohérence", PAGE_W / 2, y, { align: "center" });
  y += 15;

  // Summary
  if (mirrorData.summary) {
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    y = addWrappedText(doc, mirrorData.summary, MARGIN + 10, y, CONTENT_W - 20, 5);
  }

  // ── PAGE 2 — Alignements ──
  doc.addPage();
  y = MARGIN;
  y = drawSectionHeader(doc, y, "✅  Ce qui est aligné", GREEN_BG);
  y += 2;

  if (mirrorData.alignments?.length) {
    for (let i = 0; i < mirrorData.alignments.length; i++) {
      const a = mirrorData.alignments[i];
      if (y > 255) { doc.addPage(); y = MARGIN; }

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...DARK);
      y = addWrappedText(doc, a.aspect || `Point ${i + 1}`, MARGIN, y, CONTENT_W, 5);

      if (a.detail) {
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...GREY);
        y = addWrappedText(doc, a.detail, MARGIN, y, CONTENT_W, 4.5);
      }
      y += 2;
      y = drawSeparator(doc, y);
      y += 2;
    }
  } else {
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...GREY);
    doc.text("Aucun alignement identifié.", MARGIN, y);
  }

  // ── PAGE 3 — Écarts ──
  doc.addPage();
  y = MARGIN;
  y = drawSectionHeader(doc, y, "⚠️  Écarts identifiés", ORANGE_BG);
  y += 2;

  if (mirrorData.gaps?.length) {
    for (let i = 0; i < mirrorData.gaps.length; i++) {
      const g = mirrorData.gaps[i];
      if (y > 240) { doc.addPage(); y = MARGIN; }

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...DARK);
      y = addWrappedText(doc, g.aspect || `Écart ${i + 1}`, MARGIN, y, CONTENT_W, 5);

      if (g.declared) {
        doc.setFont("Helvetica", "italic");
        doc.setFontSize(9.5);
        doc.setTextColor(...GREY);
        y = addWrappedText(doc, `Ce que tu déclares : ${g.declared}`, MARGIN, y, CONTENT_W, 4.5);
      }
      if (g.observed) {
        doc.setFont("Helvetica", "italic");
        doc.setFontSize(9.5);
        doc.setTextColor(...GREY);
        y = addWrappedText(doc, `Ce que tu fais : ${g.observed}`, MARGIN, y, CONTENT_W, 4.5);
      }
      if (g.suggestion) {
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...PINK);
        y = addWrappedText(doc, `Suggestion : ${g.suggestion}`, MARGIN, y, CONTENT_W, 4.5);
      }
      y += 2;
      y = drawSeparator(doc, y);
      y += 2;
    }
  } else {
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...GREY);
    doc.text("Aucun écart identifié.", MARGIN, y);
  }

  // ── PAGE 4 — Quick wins ──
  doc.addPage();
  y = MARGIN;
  y = drawSectionHeader(doc, y, "⚡  Quick wins", PINK_BG);
  y += 2;

  if (mirrorData.quick_wins?.length) {
    for (let i = 0; i < mirrorData.quick_wins.length; i++) {
      if (y > 255) { doc.addPage(); y = MARGIN; }
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...PINK);
      doc.text(`${i + 1}.`, MARGIN, y);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...DARK);
      y = addWrappedText(doc, mirrorData.quick_wins[i], MARGIN + 8, y, CONTENT_W - 8, 5);
      y += 3;
    }
  }

  // Footer box
  y = Math.max(y + 10, 240);
  if (y > 260) { doc.addPage(); y = 240; }

  doc.setFillColor(245, 245, 250);
  doc.roundedRect(MARGIN, y, CONTENT_W, 18, 3, 3, "F");
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text(`Généré par L'Assistant Com' — Nowadays Agency • ${dateStr}`, PAGE_W / 2, y + 10, { align: "center" });

  doc.save(`branding-mirror-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
