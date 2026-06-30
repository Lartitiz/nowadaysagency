CREATE OR REPLACE FUNCTION public.enforce_single_primary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_primary IS TRUE THEN
    EXECUTE format(
      'UPDATE public.%I SET is_primary = false
         WHERE is_primary IS TRUE
           AND id <> $1
           AND user_id = $2
           AND COALESCE(workspace_id, ''00000000-0000-0000-0000-000000000000'')
             = COALESCE($3, ''00000000-0000-0000-0000-000000000000'')',
      TG_TABLE_NAME
    ) USING NEW.id, NEW.user_id, NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_persona_single_primary ON public.persona;
CREATE TRIGGER trg_persona_single_primary
  BEFORE INSERT OR UPDATE OF is_primary ON public.persona
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_primary();

DROP TRIGGER IF EXISTS trg_storytelling_single_primary ON public.storytelling;
CREATE TRIGGER trg_storytelling_single_primary
  BEFORE INSERT OR UPDATE OF is_primary ON public.storytelling
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_primary();