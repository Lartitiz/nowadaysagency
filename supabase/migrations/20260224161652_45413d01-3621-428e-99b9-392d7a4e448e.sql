
-- ══════════════════════════════════════════════
-- Table 1: workspaces
-- ══════════════════════════════════════════════
CREATE TABLE public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  slug TEXT UNIQUE,
  avatar_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════
-- Table 2: workspace_members
-- ══════════════════════════════════════════════
CREATE TABLE public.workspace_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'editor', 'viewer')),
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- ══════════════════════════════════════════════
-- Table 3: workspace_invitations
-- ══════════════════════════════════════════════
CREATE TABLE public.workspace_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'editor', 'viewer')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════
-- Helper function
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
END;
$$;

-- Helper to check workspace role
CREATE OR REPLACE FUNCTION public.user_workspace_role(ws_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = ws_id AND user_id = auth.uid()
  LIMIT 1;
$$;

-- ══════════════════════════════════════════════
-- RLS: workspaces
-- ══════════════════════════════════════════════
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their workspaces"
  ON public.workspaces FOR SELECT
  TO authenticated
  USING (public.user_has_workspace_access(id));

CREATE POLICY "Authenticated users can create workspaces"
  ON public.workspaces FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners and managers can update workspaces"
  ON public.workspaces FOR UPDATE
  TO authenticated
  USING (public.user_workspace_role(id) IN ('owner', 'manager'));

-- ══════════════════════════════════════════════
-- RLS: workspace_members
-- ══════════════════════════════════════════════
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace members"
  ON public.workspace_members FOR SELECT
  TO authenticated
  USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Owners and managers can add members"
  ON public.workspace_members FOR INSERT
  TO authenticated
  WITH CHECK (public.user_workspace_role(workspace_id) IN ('owner', 'manager'));

CREATE POLICY "Owners and managers can remove members"
  ON public.workspace_members FOR DELETE
  TO authenticated
  USING (public.user_workspace_role(workspace_id) IN ('owner', 'manager'));

-- ══════════════════════════════════════════════
-- RLS: workspace_invitations
-- ══════════════════════════════════════════════
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace invitations"
  ON public.workspace_invitations FOR SELECT
  TO authenticated
  USING (
    public.user_has_workspace_access(workspace_id)
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Owners and managers can create invitations"
  ON public.workspace_invitations FOR INSERT
  TO authenticated
  WITH CHECK (public.user_workspace_role(workspace_id) IN ('owner', 'manager'));

CREATE POLICY "Invitee can accept invitation"
  ON public.workspace_invitations FOR UPDATE
  TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- ══════════════════════════════════════════════
-- Trigger: updated_at on workspaces
-- ══════════════════════════════════════════════
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
