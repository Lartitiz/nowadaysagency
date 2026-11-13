// Brouillon déjà envoyé (13/11/2026) : le champ du Studio garde son texte en
// mémoire locale par session. Si la réponse arrive alors que la page a été
// quittée, rechargée ou a affiché une erreur, le texte revenait au retour alors
// qu'il est déjà dans la conversation. On le reconnaît : il est identique au
// dernier message envoyé dans la session.
type Message = { role: string; text?: string | null };

export function isAlreadySentDraft(draft: string, messages: readonly Message[] | undefined): boolean {
  const text = draft.trim();
  if (!text || !messages?.length) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return (messages[i].text || "").trim() === text;
  }
  return false;
}
