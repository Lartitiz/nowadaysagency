-- References stay private and immutable; removing memory never removes used media.
ALTER TABLE public.visual_studio_sessions DROP CONSTRAINT studio_references_shape;
ALTER TABLE public.visual_studio_sessions ADD CONSTRAINT studio_references_shape CHECK
 ("references" IS NULL OR (jsonb_typeof("references")='array' AND jsonb_array_length("references")<=8 AND octet_length("references"::text)<32000));
CREATE TABLE public.studio_brand_memory (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('preference','direction','casting')),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 note text NOT NULL CHECK(length(note) BETWEEN 1 AND 1500),
 "references" jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof("references")='array' AND jsonb_array_length("references")<=8 AND octet_length("references"::text)<32000),
 revision integer NOT NULL DEFAULT 0,
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.studio_brand_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY studio_memory_read ON public.studio_brand_memory FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=studio_brand_memory.workspace_id AND m.user_id=auth.uid()));
GRANT SELECT ON public.studio_brand_memory TO authenticated;
GRANT ALL ON public.studio_brand_memory TO service_role;
REVOKE INSERT,UPDATE,DELETE ON public.studio_brand_memory FROM authenticated,anon;
CREATE INDEX studio_memory_workspace ON public.studio_brand_memory(workspace_id,updated_at DESC) WHERE archived_at IS NULL;
CREATE OR REPLACE FUNCTION public.studio_write_memory(p_actor uuid,p_workspace uuid,p_id uuid,p_revision integer,
 p_kind text,p_name text,p_note text,p_references jsonb,p_remove boolean DEFAULT false)
RETURNS public.studio_brand_memory LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m studio_brand_memory;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=p_workspace AND user_id=p_actor AND role IN ('owner','manager','editor'))
 THEN RAISE EXCEPTION 'studio_forbidden' USING ERRCODE='42501'; END IF;
 IF p_remove IS NULL OR p_revision IS NULL OR p_revision < -1 THEN RAISE EXCEPTION 'studio_conflict'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace::text,282027));
 SELECT * INTO m FROM studio_brand_memory WHERE id=p_id FOR UPDATE;
 IF m.id IS NOT NULL THEN
  IF m.workspace_id IS DISTINCT FROM p_workspace THEN RAISE EXCEPTION 'studio_forbidden'; END IF;
  -- Replay exact acknowledgements; an unrelated concurrent edit remains a conflict.
  IF m.revision=p_revision+1 AND ((p_remove AND m.archived_at IS NOT NULL) OR
   (NOT p_remove AND m.archived_at IS NULL AND m.kind=p_kind AND m.name=p_name AND m.note=p_note AND m."references"=p_references)) THEN RETURN m; END IF;
  IF m.revision IS DISTINCT FROM p_revision OR m.archived_at IS NOT NULL THEN RAISE EXCEPTION 'studio_conflict'; END IF;
  UPDATE studio_brand_memory SET name=CASE WHEN p_remove THEN name ELSE p_name END,
   note=CASE WHEN p_remove THEN note ELSE p_note END,
   archived_at=CASE WHEN p_remove THEN now() ELSE NULL END,revision=revision+1,updated_at=now()
   WHERE id=p_id RETURNING * INTO m;
 ELSE
  IF p_remove OR p_revision<>-1 THEN RAISE EXCEPTION 'studio_conflict'; END IF;
  IF (SELECT count(*) FROM studio_brand_memory WHERE workspace_id=p_workspace AND archived_at IS NULL)>=100 THEN RAISE EXCEPTION 'studio_memory_limit'; END IF;
  INSERT INTO studio_brand_memory(id,workspace_id,user_id,kind,name,note,"references")
   VALUES(p_id,p_workspace,p_actor,p_kind,p_name,p_note,p_references) RETURNING * INTO m;
 END IF;
 RETURN m;
END $$;
REVOKE ALL ON FUNCTION public.studio_write_memory(uuid,uuid,uuid,integer,text,text,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_write_memory(uuid,uuid,uuid,integer,text,text,text,jsonb,boolean) TO service_role;
