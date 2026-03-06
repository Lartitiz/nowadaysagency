-- email_templates: admin can insert, update, delete
CREATE POLICY "Admin can insert email_templates" ON public.email_templates FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update email_templates" ON public.email_templates FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete email_templates" ON public.email_templates FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- email_sequences: admin can insert, update, delete
CREATE POLICY "Admin can insert email_sequences" ON public.email_sequences FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update email_sequences" ON public.email_sequences FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete email_sequences" ON public.email_sequences FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- email_sequence_steps: admin can insert, update, delete
CREATE POLICY "Admin can insert email_sequence_steps" ON public.email_sequence_steps FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update email_sequence_steps" ON public.email_sequence_steps FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete email_sequence_steps" ON public.email_sequence_steps FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- email_sends: admin can insert, delete
CREATE POLICY "Admin can insert email_sends" ON public.email_sends FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete email_sends" ON public.email_sends FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- email_queue: admin can insert, update, delete
CREATE POLICY "Admin can insert email_queue" ON public.email_queue FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update email_queue" ON public.email_queue FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete email_queue" ON public.email_queue FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));