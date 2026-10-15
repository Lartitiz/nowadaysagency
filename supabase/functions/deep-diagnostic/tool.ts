import type { AnthropicTool } from "../_shared/anthropic.ts";

// Outil `rendre_diagnostic` (fiche 12, lot 1 : sorti d'index.ts à l'identique).
// Le schéma envoyé à Claude doit rester identique octet pour octet (snapshot
// de prompts_snapshot_test.ts).

// Sortie structurée forcée : l'API garantit un `input` conforme — élimine la
// classe d'échecs « JSON tronqué/illisible » du parsing texte (cf #640).
export const DIAGNOSTIC_TOOL: AnthropicTool = {
  name: "rendre_diagnostic",
  description: "Renvoie le diagnostic de communication structuré.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "3-4 phrases qui reformulent les mots de la personne" },
      screenshot_readable: { type: "boolean", description: "Au moins une capture fournie est lisible et permet un constat concret" },
      strengths: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            source: { type: "string", enum: ["website", "profile", "about", "instagram_public", "instagram_screenshot", "linkedin_screenshot", "social_screenshot", "instagram_connected", "instagram_insights", "linkedin", "linkedin_analytics"] },
          },
          required: ["title", "detail"],
        },
      },
      weaknesses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            source: { type: "string", enum: ["website", "profile", "about", "instagram_public", "instagram_screenshot", "linkedin_screenshot", "social_screenshot", "instagram_connected", "instagram_insights", "linkedin", "linkedin_analytics"] },
            fix_hint: { type: "string" },
          },
          required: ["title", "detail"],
        },
      },
      scores: {
        type: "object",
        properties: {
          total: { type: ["number", "null"] },
          branding: { type: ["number", "null"] },
          instagram: { type: ["number", "null"] },
          website: { type: ["number", "null"] },
          linkedin: { type: ["number", "null"] },
        },
        required: ["total", "branding"],
      },
      priorities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            why: { type: "string" },
            first_step: { type: "string", description: "Premier geste réalisable maintenant, précis et vérifiable" },
            example: { type: "string", description: "Exemple de formulation ou de contrôle adapté à cette personne, sans inventer de faits" },
            time: { type: "string" },
            route: { type: "string" },
            impact: { type: "string", enum: ["high", "medium"] },
            source: { type: "string", enum: ["website", "profile", "about", "instagram_public", "instagram_screenshot", "linkedin_screenshot", "social_screenshot", "instagram_connected", "instagram_insights", "linkedin", "linkedin_analytics"] },
          },
          required: ["title", "why", "first_step", "example", "route"],
        },
      },
      branding_prefill: {
        type: "object",
        properties: {
          positioning: { type: ["string", "null"] },
          mission: { type: ["string", "null"] },
          target_description: { type: ["string", "null"] },
          tone_keywords: { type: "array", items: { type: "string" } },
          values: { type: "array", items: { type: "string" } },
          offers: { type: "array" },
        },
      },
    },
    required: ["summary", "strengths", "weaknesses", "scores", "priorities"],
  },
};
