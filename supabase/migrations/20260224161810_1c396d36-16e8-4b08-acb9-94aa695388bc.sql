
-- Batch 1: Add workspace_id to branding + content tables

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_profiles_workspace_id ON public.profiles(workspace_id);

ALTER TABLE public.brand_profile ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_brand_profile_workspace_id ON public.brand_profile(workspace_id);

ALTER TABLE public.persona ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_persona_workspace_id ON public.persona(workspace_id);

ALTER TABLE public.storytelling ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_storytelling_workspace_id ON public.storytelling(workspace_id);

ALTER TABLE public.brand_proposition ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_brand_proposition_workspace_id ON public.brand_proposition(workspace_id);

ALTER TABLE public.brand_strategy ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_brand_strategy_workspace_id ON public.brand_strategy(workspace_id);

ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_offers_workspace_id ON public.offers(workspace_id);

ALTER TABLE public.calendar_posts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_calendar_posts_workspace_id ON public.calendar_posts(workspace_id);

ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_saved_ideas_workspace_id ON public.saved_ideas(workspace_id);

ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_generated_posts_workspace_id ON public.generated_posts(workspace_id);

ALTER TABLE public.generated_carousels ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_generated_carousels_workspace_id ON public.generated_carousels(workspace_id);

ALTER TABLE public.content_drafts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_content_drafts_workspace_id ON public.content_drafts(workspace_id);

ALTER TABLE public.branding_audits ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_branding_audits_workspace_id ON public.branding_audits(workspace_id);

ALTER TABLE public.instagram_audit ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_instagram_audit_workspace_id ON public.instagram_audit(workspace_id);

ALTER TABLE public.instagram_editorial_line ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_instagram_editorial_line_workspace_id ON public.instagram_editorial_line(workspace_id);
