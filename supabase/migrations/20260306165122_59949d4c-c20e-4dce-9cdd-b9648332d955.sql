-- Table des désinscriptions email (RGPD)
CREATE TABLE public.email_unsubscribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT,
  unsubscribed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;

-- L'utilisatrice peut se désinscrire elle-même
CREATE POLICY "Users can insert own unsubscribe"
ON public.email_unsubscribes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- L'utilisatrice peut voir son propre statut
CREATE POLICY "Users can view own unsubscribe"
ON public.email_unsubscribes FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- L'utilisatrice peut se réinscrire (supprimer sa désinscription)
CREATE POLICY "Users can delete own unsubscribe"
ON public.email_unsubscribes FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- L'admin peut tout voir et gérer
CREATE POLICY "Admin can manage unsubscribes"
ON public.email_unsubscribes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));