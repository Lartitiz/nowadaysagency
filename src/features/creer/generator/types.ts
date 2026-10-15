// Sorti de src/hooks/use-content-generator.ts à l'identique (fiche 17 de
// docs/robustesse/gros-fichiers.md, lot 1). Le hook réexporte ces types :
// les appelants importent toujours depuis @/hooks/use-content-generator.

export interface GenerateParams {
  format: "carousel" | "reel" | "story" | "post" | "linkedin" | "newsletter";
  subject: string;
  objective?: string;
  editorialAngle?: string;
  answers?: Record<string, string>;
  workspaceId?: string;
  channel?: "instagram" | "linkedin";
  // Reel-specific
  faceCam?: string;
  timeAvailable?: string;
  selectedHook?: any;
  preGenAnswers?: any;
  // Carousel-specific
  slideCount?: number;
  carouselType?: string;
  // pure_photo (photo dump) court-circuite la vision — cf. usage dans generate()
  carouselSubMode?: "text" | "photo" | "mix" | "pure_photo" | "user_slides";
  // Photo-related
  photos?: { base64: string; context?: string; libraryContext?: string; mimeType?: string; userPhotoId?: string }[];
  photoDescription?: string;
  photoMode?: boolean;
  slideStructure?: Array<{
    slide_number: number;
    type: "photo_full" | "photo_integrated" | "text_only";
    photo_index?: number;
    photo_layout?: string;
  }>;
  confirmedStructure?: Array<{
    slide_number: number;
    role: string;
    title_suggestion: string;
    strategic_note: string;
    photo_index?: number;
    slide_type?: "photo_full" | "photo_integrated" | "text_only";
    story_beat?: string;
    visual_anchor?: string;
  photo_observation?: string;
  image_relation?: string;
  factual_basis?: string;
    overlay_position?: string;
  }>;
  // Récit transmis du pass structure vers le pass d'écriture (carrousel uniquement)
  narrativeThread?: string;
  editorialIntent?: {mode:string;idea:string;reader_takeaway:string;basis_source_ids:string[];inferred:boolean};
  scenarioOrigin?: "automatic" | "user_validated" | "user_authored";
  // Newsjacking — separate field to avoid bloating `subject`
  newsContext?: string;
  // Régime « texte d'abord » (carrousel mixte sans photos) : l'edge rend des
  // photo_directive par slide photo + matching strict contre le catalogue bibliothèque.
  textFirst?: boolean;
  photoCatalog?: { index: number; description: string; kind?: string | null }[];
  // "Mode qualité Max" : escalade vers Opus pour la rédaction (plus soigné, plus lent)
  qualityMax?: boolean;
  // Carrousel « Tes photos en fond » : photos d'ambiance libres de droit posées
  // par l'app (src/lib/stock-ambient-photos.ts), à ajouter APRÈS les photos
  // envoyées (appelé à chaque génération réussie, liste vide comprise). Sans
  // ce rappel, les propositions du serveur sont ignorées.
  onStockAmbientPhotos?: (added: import("@/components/creer/PhotoUploadZone").PhotoItem[]) => void;
}

export interface GenerateQuestionsParams {
  format: string;
  subject: string;
  editorialAngle?: string;
  objective?: string;
  channel?: "instagram" | "linkedin";
  workspaceId?: string;
  // Photo-related — when present, ask vision-anchored questions
  photos?: Array<{ base64: string; context?: string; libraryContext?: string; mimeType?: string; userPhotoId?: string }>;
  photoDescription?: string;
  carouselSubMode?: "text" | "photo" | "mix" | "pure_photo" | "user_slides";
  photoMode?: boolean;
  // Newsjacking — anchors the questions in the actu instead of generic subject
  newsContext?: string;
}

export interface Question {
  id: string;
  question: string;
  placeholder?: string;
}

export interface ContentResult {
  type: "carousel" | "reel" | "story" | "post" | "linkedin" | "newsletter";
  raw: any;
  [key: string]: any;
}

// ── Streaming params type ──
export interface GenerateStreamParams {
  format: "post" | "linkedin" | "newsletter" | "pinterest";
  subject: string;
  objective?: string;
  editorialAngle?: string;
  answers?: Record<string, string>;
  workspaceId?: string;
  photoMode?: boolean;
  photos?: { base64: string; mimeType?: string; context?: string; libraryContext?: string; userPhotoId?: string }[];
  photoDescription?: string;
  deepResearch?: boolean;
  pinterestLink?: string;
  pinterestBoard?: string;
  // Newsjacking — separate field, not stuffed into `subject`
  newsContext?: string;
}
