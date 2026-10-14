// Tables copiées par l'export de sécurité mensuel, et celles exclues (avec la
// raison). Toute table de la base doit être dans l'une des deux listes :
// tables_test.ts compare avec src/integrations/supabase/types.ts, pour qu'une
// table ajoutée ne soit jamais oubliée en silence.

// Exclues : secrets, journaux techniques volumineux, caches recalculables.
export const TABLES_EXCLUES: Record<string, string> = {
  social_connections: "jetons de connexion aux réseaux (secrets) — reconnecter suffit",
  oauth_states: "états OAuth temporaires (secrets éphémères)",
  webhook_events: "journal technique Stripe, rejouable depuis Stripe",
  frontend_debug_logs: "journal technique",
  client_error_events: "journal technique (purgé chaque nuit)",
  scrape_cache: "cache recalculable",
  dashboard_clicks: "journal de clics",
  email_queue: "file d'envoi technique",
  email_sends: "journal d'envois",
  studio_video_session_events: "journal technique",
  carousel_media_backfill_backup: "table de transit vidée le 04/10/2026",
  content_quality_events: "mesures de qualité (journal), volumineux",
};

// Tout le reste du schéma public est copié (la liste est calculée par
// l'appelante à partir de TABLES_EXPORTEES, gardée explicite pour que la
// fonction n'ait pas besoin de lire le schéma).
export const TABLES_EXPORTEES = [
  "ai_usage", "assistant_undo_log", "audit_recommendations", "audit_validations", "beta_feedback", "bio_versions",
  "brand_charter", "brand_profile", "brand_proposition", "brand_strategy", "branding_audits", "branding_autofill",
  "branding_coaching_sessions", "branding_mirror_results", "branding_suggestions", "branding_summary",
  "calendar_comments", "calendar_posts", "calendar_shares", "carousel_styles", "chat_guide_conversations",
  "chat_guide_messages", "checkout_attempts", "coach_exercises", "coaching_actions", "coaching_deliverables",
  "coaching_programs", "coaching_sessions", "communication_plans", "community_comments", "community_posts",
  "community_reactions", "contact_interactions", "contacts", "content_briefs", "content_drafts",
  "content_recycling", "content_scores", "credit_grants", "diagnostic_results", "dismissed_suggestions",
  "email_sequence_steps", "email_sequences", "email_templates", "email_unsubscribes", "engagement_checklist_logs",
  "engagement_comments", "engagement_contacts", "engagement_exercise", "engagement_metrics", "engagement_streaks",
  "engagement_weekly", "engagement_weekly_linkedin", "generated_carousels", "generated_posts",
  "higgsfield_image_spend", "highlight_categories", "import_mappings", "inspiration_accounts", "inspiration_notes",
  "instagram_audit", "instagram_audit_posts", "instagram_editorial_line", "instagram_highlights",
  "instagram_highlights_questions", "instagram_inspirations", "instagram_pinned_posts", "instagram_weekly_stats",
  "intake_questionnaires", "launch_plan_contents", "launches", "linkedin_audit", "linkedin_comment_strategy",
  "linkedin_experiences", "linkedin_profile", "linkedin_recommendations", "live_questions", "live_reminders",
  "lives", "mini_audit_attempts", "monthly_stats", "notifications", "offers", "payment_checkout_attempts",
  "persona", "photo_wishlist", "photo_workflows", "pinterest_boards", "pinterest_keywords", "pinterest_pins",
  "pinterest_profile", "pinterest_routine", "plan_step_overrides", "plan_step_visibility", "plan_tasks",
  "profiles", "promo_codes", "promo_redemptions", "prospect_interactions", "prospects", "purchases",
  "reel_inspirations", "reel_publication_receipts", "reels_metrics", "reels_scripts", "routine_completions",
  "routine_tasks", "sales_page_optimizations", "saved_ideas", "series", "shared_branding_links", "stats_config",
  "stories_metrics", "stories_sequences", "storytelling", "studio_binomes", "studio_brand_memory",
  "studio_coachings", "studio_deliverables", "studio_image_requests", "studio_video_cohort_access",
  "studio_video_jobs", "studio_video_sessions", "subscriptions", "suggested_contents", "tasks", "user_badges",
  "user_documents", "user_offers", "user_photos", "user_plan_config", "user_plan_overrides", "user_rhythm",
  "user_roles", "visual_studio_compositions", "visual_studio_interpretations", "visual_studio_sessions",
  "visual_studio_versions", "voice_guides", "voice_profile", "website_about", "website_audit",
  "website_homepage", "website_inspirations", "website_profile", "weekly_batches", "weekly_missions",
  "workspace_invitations", "workspace_members", "workspaces",
];
