// Recherche d'actus lue en flux (28/11/2026).
//
// Retour de Laetitia : près d'une minute devant un rond qui tourne. La
// réponse du modèle est donc lue au fil de l'eau : chaque recherche web
// lancée et chaque actu terminée partent à l'écran dès qu'elles existent.
// Le flux est reconstruit sous la forme d'une réponse classique (blocs
// `content`, `stop_reason`, `usage`) : la suite du traitement ne change pas.

export interface SuiviFlux {
  /** Une recherche web vient d'être lancée. */
  onRequete?: (requete: string) => void;
  /** Texte visible écrit jusqu'ici dans ce tour (blocs texte joints) et blocs du tour (résultats de recherche compris). */
  onTexte?: (texte: string, blocs: unknown[]) => void;
}

// deno-lint-ignore no-explicit-any
type Bloc = any;

export const texteDesBlocs = (blocs: Bloc[]): string =>
  blocs.filter((b) => b?.type === "text").map((b) => b.text).join("\n");

export async function lireFluxRecherche(body: ReadableStream<Uint8Array>, suivi: SuiviFlux = {}): Promise<{ content: Bloc[]; stop_reason?: string; usage: Record<string, number> }> {
  const reader = body.getReader(), decoder = new TextDecoder();
  const usage: Record<string, number> = {};
  const content: Bloc[] = [];
  const brouillons = new Map<number, string>();
  let stopReason: string | undefined;
  let buffer = "";
  const noterUsage = (u: unknown) => {
    for (const [k, v] of Object.entries(u || {})) if (typeof v === "number") usage[k] = v;
  };
  // L'affichage ne casse jamais la recherche.
  const prevenir = (f: () => void) => { try { f(); } catch { /* ignoré */ } };

  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() + "\n\n" : decoder.decode(value, { stream: true });
    let fin: number;
    while ((fin = buffer.indexOf("\n\n")) >= 0) {
      const ligne = buffer.slice(0, fin).split("\n").find((l) => l.startsWith("data:"));
      buffer = buffer.slice(fin + 2);
      if (!ligne) continue;
      let ev: Bloc;
      try { ev = JSON.parse(ligne.slice(5).trim()); } catch { continue; }
      if (ev.type === "message_start") noterUsage(ev.message?.usage);
      else if (ev.type === "content_block_start") {
        content[ev.index] = { ...ev.content_block };
        if (ev.content_block?.type === "text" && typeof ev.content_block.text !== "string") content[ev.index].text = "";
      } else if (ev.type === "content_block_delta") {
        const bloc = content[ev.index];
        if (!bloc) continue;
        if (ev.delta?.type === "text_delta") {
          bloc.text = (bloc.text || "") + (ev.delta.text || "");
          if (suivi.onTexte) prevenir(() => { const blocs = content.filter(Boolean); suivi.onTexte!(texteDesBlocs(blocs), blocs); });
        } else if (ev.delta?.type === "input_json_delta") {
          brouillons.set(ev.index, (brouillons.get(ev.index) || "") + (ev.delta.partial_json || ""));
        } else if (ev.delta?.type === "citations_delta" && ev.delta.citation) {
          (bloc.citations ??= []).push(ev.delta.citation);
        }
      } else if (ev.type === "content_block_stop") {
        const bloc = content[ev.index];
        const brouillon = brouillons.get(ev.index);
        if (bloc && brouillon) {
          try { bloc.input = JSON.parse(brouillon); } catch { /* entrée illisible : laissée telle quelle */ }
        }
        const requete = bloc?.type === "server_tool_use" ? bloc.input?.query : undefined;
        if (typeof requete === "string" && requete.trim() && suivi.onRequete) prevenir(() => suivi.onRequete!(requete.trim()));
      } else if (ev.type === "message_delta") {
        if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
        noterUsage(ev.usage);
      } else if (ev.type === "error") {
        throw new Error(`flux Anthropic : ${String(ev.error?.type || "erreur").slice(0, 60)}`);
      }
    }
    if (done) break;
  }
  // Flux coupé avant la fin du message : jamais une réponse partielle prise pour la réponse.
  if (!stopReason) throw new Error("flux Anthropic interrompu avant la fin");
  return { content: content.filter(Boolean), stop_reason: stopReason, usage };
}

/**
 * Les actus déjà entièrement écrites dans un JSON `{"actus":[…]}` en cours
 * d'écriture. Une actu à moitié écrite n'est jamais rendue.
 */
export function actusCompletes(texte: string): Record<string, unknown>[] {
  const cle = texte.indexOf('"actus"');
  if (cle < 0) return [];
  const debut = texte.indexOf("[", cle);
  if (debut < 0) return [];
  const actus: Record<string, unknown>[] = [];
  let profondeur = 0, dansChaine = false, echappe = false, depart = -1;
  for (let i = debut + 1; i < texte.length; i++) {
    const c = texte[i];
    if (dansChaine) {
      if (echappe) echappe = false;
      else if (c === "\\") echappe = true;
      else if (c === '"') dansChaine = false;
      continue;
    }
    if (c === '"') dansChaine = true;
    else if (c === "{") { if (profondeur++ === 0) depart = i; }
    else if (c === "}") {
      if (--profondeur === 0 && depart >= 0) {
        try {
          const a = JSON.parse(texte.slice(depart, i + 1));
          if (a && typeof a === "object") actus.push(a);
        } catch { /* objet illisible : ignoré, la liste finale fait foi */ }
        depart = -1;
      }
    } else if (c === "]" && profondeur === 0) break;
  }
  return actus;
}
