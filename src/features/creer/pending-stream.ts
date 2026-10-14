// Récupération d'un texte coupé en pleine génération (reload mi-streaming).
// Sorti à l'identique de CreerUnifie.tsx (lot C, docs/robustesse/gros-fichiers.md, fiche 1).
// Le toast et la purge de `pendingStream` restent dans la page.

// Le stream étant coupé net, le JSON est souvent TRONQUÉ : JSON.parse échoue
// et le repli { content: texte brut } affichait le JSON tel quel dans la préviz
// (vu au re-test live 04/07). On extrait donc "content" même d'un JSON incomplet.
export function parsePendingStreamText(text: string): any {
  let parsed: any;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    const contentMatch = text.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (contentMatch) {
      try {
        parsed = { content: JSON.parse(`"${contentMatch[1]}"`) };
      } catch {
        parsed = { content: contentMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') };
      }
    } else {
      parsed = { content: text.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "") };
    }
  }
  return parsed;
}
