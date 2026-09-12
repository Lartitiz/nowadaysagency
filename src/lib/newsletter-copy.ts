import { stripInlineMarkdown } from "@/lib/strip-markdown";
import { stripCoachingHint } from "@/features/creer/build-calendar-content";

export function newsletterFields(result: any) {
  return {
    subject: stripInlineMarkdown(result?.subject || ""),
    preview: stripInlineMarkdown(result?.preview_text || ""),
    body: stripCoachingHint(stripInlineMarkdown(result?.edited_text || result?.body || result?.content || result?.text || "")),
  };
}

/** Copy the email itself, without the AI's separate coaching/CTA suggestions. */
export function newsletterCopyText(result: any): string {
  const { subject, preview, body } = newsletterFields(result);
  return [subject && `Objet : ${subject}`, preview && `Texte d’aperçu : ${preview}`, body].filter(Boolean).join("\n\n");
}
