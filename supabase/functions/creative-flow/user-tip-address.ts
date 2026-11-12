// Le conseil « personal_tip » (stories, reel) s'adresse à l'UTILISATRICE, que
// l'outil tutoie partout, même quand sa marque vouvoie son public. QA du
// 12/11/2026 : « Montrez le détail du meuble sous l'évier… » sur une marque
// qui vouvoie. Le détecteur commun (audience-address.ts) compte « vous/votre »
// mais pas l'impératif en « -ez » sans pronom : on le repère ici, pour ce seul
// champ, et on demande la passe de correction au tutoiement.
import { checkAudienceAddress } from "../_shared/audience-address.ts";
import { _deps } from "./shared.ts";

// Mot en « -ez » en début de phrase = impératif vouvoyé (« Montrez », « Ajoutez »).
const EZ_IMPERATIVE_RE = /(?:^|[.!?…:]\s+|💡\s*)(?!(?:Chez|Assez|Nez|Rez)\b)(\p{Lu}\p{Ll}+ez)\b/u;

/** Le conseil vouvoie l'utilisatrice (« vous/votre » ou impératif en -ez). */
export function tipVouvoie(tip: string): boolean {
  if (!tip) return false;
  return checkAudienceAddress(tip, "tu").wrong > 0 || EZ_IMPERATIVE_RE.test(tip.trim());
}

const digits = (t: string) => (t.match(/\d+(?:[.,]\d+)?/g) || []).join("|");

/** Repasse `personal_tip` au tutoiement si besoin. Gardé seulement s'il ne vouvoie plus, chiffres intacts. */
// deno-lint-ignore no-explicit-any
export async function tutoieUserTip(parsed: any, opts: { abortTimeoutMs?: number; logger?: (m: string) => void } = {}): Promise<void> {
  const tip = parsed?.personal_tip;
  if (typeof tip !== "string" || !tipVouvoie(tip)) return;
  try {
    const candidate = await _deps.audienceAddressPass(tip, "tu", [tip.trim()], { abortTimeoutMs: opts.abortTimeoutMs ?? 20_000, logger: opts.logger });
    if (candidate && candidate.trim() && !tipVouvoie(candidate) && digits(candidate) === digits(tip)) {
      parsed.personal_tip = candidate.trim();
      opts.logger?.("[personal_tip] passé au tutoiement");
    }
  } catch (e) {
    opts.logger?.(`[personal_tip] passe tu échouée : ${e instanceof Error ? e.message : String(e)}`);
  }
}
