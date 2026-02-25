
-- Create beta_feedback table
CREATE TABLE public.beta_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  type TEXT NOT NULL CHECK (type IN ('bug', 'suggestion')),
  content TEXT NOT NULL,
  details TEXT,
  page_url TEXT,
  severity TEXT CHECK (severity IN ('blocking', 'annoying', 'minor')),
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'in_progress', 'done', 'wont_fix')),
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

-- Users can only insert their own feedback
CREATE POLICY "Users can insert own feedback"
  ON public.beta_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all feedback
CREATE POLICY "Admins can view all feedback"
  ON public.beta_feedback
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update feedback (status, admin_notes)
CREATE POLICY "Admins can update feedback"
  ON public.beta_feedback
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create storage bucket for screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('beta-feedback', 'beta-feedback', false);

-- Storage: authenticated users can upload to their own folder
CREATE POLICY "Users can upload feedback screenshots"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'beta-feedback' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Admins can view all screenshots
CREATE POLICY "Admins can view feedback screenshots"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'beta-feedback' AND public.has_role(auth.uid(), 'admin'));
