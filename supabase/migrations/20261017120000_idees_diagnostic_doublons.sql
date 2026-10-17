-- Idées du diagnostic restées « Idée à développer » en double (avant #1725, 17/10/2026).
-- Le contenu créé depuis l'idée a ouvert une seconde fiche (même titre, même espace)
-- et l'idée d'origine est restée vide dans « Mes idées ». Choix de Laetitia du 17/10 :
-- retirer ces idées vides ; le contenu reste intact dans l'autre fiche.
-- Comptage du 17/10 : 4 inscrites, 4 fiches (13/09 → 28/09). Comptes internes exclus
-- (même règle que supabase/functions/_shared/internal-accounts.ts).
-- Rejouable : ne touche que les idées encore vides qui ont un double avec contenu.
DELETE FROM public.saved_ideas d
WHERE d.source_module = 'diagnostic'
  AND d.status = 'to_explore'
  AND d.calendar_post_id IS NULL
  AND d.content_data IS NULL
  AND coalesce(trim(d.content_draft), '') = ''
  AND d.created_at < '2026-10-17'
  AND EXISTS (
    SELECT 1 FROM public.saved_ideas c
    WHERE c.id <> d.id
      AND coalesce(c.workspace_id::text, c.user_id::text) = coalesce(d.workspace_id::text, d.user_id::text)
      AND c.titre = d.titre
      AND (c.content_data IS NOT NULL OR c.calendar_post_id IS NOT NULL)
  )
  AND NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = d.user_id
      AND (
        lower(u.email) IN ('laetitia@nowadaysagency.com', 'laetitiatest@nowadaysagency.com')
        OR lower(u.email) ~ '^laetitia\+[^@]*@nowadaysagency\.com$'
        OR lower(u.email) ~ '@(example\.(com|org|net)|[^@]+\.(test|example|invalid))$'
        OR (lower(u.email) ~ '@(gmail|googlemail)\.com$'
            AND replace(split_part(split_part(lower(u.email), '@', 1), '+', 1), '.', '')
                IN ('laetitiamattioli', 'laetitiamattiolitest'))
      )
  );
