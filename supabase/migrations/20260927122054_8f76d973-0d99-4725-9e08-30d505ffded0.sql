DROP POLICY IF EXISTS "Anyone authenticated can read comments" ON public.community_comments;
CREATE POLICY "Read comments of visible posts"
  ON public.community_comments
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = community_comments.post_id
  ));

DROP POLICY IF EXISTS "Anyone authenticated can read reactions" ON public.community_reactions;
CREATE POLICY "Read reactions of visible posts"
  ON public.community_reactions
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = community_reactions.post_id
  ));

DROP POLICY IF EXISTS "Authenticated users can view lives" ON public.lives;
CREATE POLICY "Admins can view lives"
  ON public.lives
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));