export interface ExtractedField {
  value: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface BrandingExtraction {
  positioning: ExtractedField;
  mission: ExtractedField;
  voice_description: ExtractedField;
  values: ExtractedField;
  unique_proposition: ExtractedField;
  for_whom: ExtractedField;
  target_description: ExtractedField;
  target_frustrations: ExtractedField;
  target_desires: ExtractedField;
  story: ExtractedField;
  content_pillars: ExtractedField;
  key_expressions: ExtractedField;
  things_to_avoid: ExtractedField;
  combat_cause: ExtractedField;
  channels: ExtractedField;
  offers: ExtractedField;
}

export const FIELD_META: Record<keyof BrandingExtraction, { emoji: string; label: string; section: string }> = {
  positioning: { emoji: "🎯", label: "Positionnement", section: "Positionnement" },
  mission: { emoji: "🎯", label: "Mission", section: "Positionnement" },
  voice_description: { emoji: "🎙️", label: "Ton de communication", section: "Mon ton" },
  values: { emoji: "❤️", label: "Valeurs", section: "Proposition de valeur" },
  unique_proposition: { emoji: "❤️", label: "Proposition de valeur unique", section: "Proposition de valeur" },
  for_whom: { emoji: "❤️", label: "Pour qui", section: "Proposition de valeur" },
  target_description: { emoji: "👤", label: "Ma cible", section: "Ma cible" },
  target_frustrations: { emoji: "👤", label: "Frustrations de ma cible", section: "Ma cible" },
  target_desires: { emoji: "👤", label: "Désirs de ma cible", section: "Ma cible" },
  story: { emoji: "📖", label: "Mon histoire", section: "Mon histoire" },
  content_pillars: { emoji: "🍒", label: "Piliers de contenu", section: "Stratégie" },
  key_expressions: { emoji: "🎙️", label: "Expressions clés", section: "Mon ton" },
  things_to_avoid: { emoji: "🎙️", label: "À éviter", section: "Mon ton" },
  combat_cause: { emoji: "🎙️", label: "Mon combat", section: "Mon ton" },
  channels: { emoji: "📱", label: "Canaux actifs", section: "Canaux" },
  offers: { emoji: "🎁", label: "Mes offres", section: "Offres" },
};

export const DEFAULT_EXTRACTION: BrandingExtraction = Object.fromEntries(
  Object.keys(FIELD_META).map((k) => [k, { value: null, confidence: 'low' as const }])
) as unknown as BrandingExtraction;
