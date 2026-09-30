-- New receipts are explicit; never guess whether a historical purchase was delivered.
ALTER TABLE public.purchases ADD COLUMN fulfillment_state text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.purchases ADD COLUMN fulfilled_at timestamptz;
ALTER TABLE public.purchases ADD COLUMN credits_granted integer NOT NULL DEFAULT 0;
ALTER TABLE public.purchases ADD CONSTRAINT purchases_fulfillment_state_check
 CHECK(fulfillment_state IN ('legacy','pending','fulfilled'));

CREATE TABLE public.credit_grants (
 checkout_session_id text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
 credits integer NOT NULL CHECK(credits>0),
 price_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_grants FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.credit_grants TO service_role;

CREATE OR REPLACE FUNCTION public.fulfill_credit_pack(
 p_user_id uuid,p_session_id text,p_payment_intent text,p_price_id text,
 p_credits integer,p_amount numeric,p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE grant_row credit_grants; purchase_row purchases;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_user_id IS NULL OR coalesce(p_session_id,'')='' OR coalesce(p_price_id,'')='' OR
 p_credits IS NULL OR p_credits<=0 OR p_credits>10000 OR p_amount IS NULL OR p_amount<0 OR
 coalesce(p_currency,'')='' THEN RAISE EXCEPTION 'invalid_purchase'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id,20261002));
 SELECT * INTO grant_row FROM credit_grants WHERE checkout_session_id=p_session_id;
 IF FOUND THEN
   IF grant_row.user_id IS DISTINCT FROM p_user_id OR grant_row.credits IS DISTINCT FROM p_credits OR
      grant_row.price_id IS DISTINCT FROM p_price_id THEN RAISE EXCEPTION 'purchase_conflict'; END IF;
   RETURN jsonb_build_object('fulfilled',true,'duplicate',true,'credits',grant_row.credits);
 END IF;
 SELECT * INTO purchase_row FROM purchases WHERE stripe_checkout_session_id=p_session_id FOR UPDATE;
 IF FOUND THEN
   -- Old code could commit the purchase before incrementing the profile. Its
   -- absence of a receipt proves neither failure nor success: do not double-pay.
   RAISE EXCEPTION 'legacy_purchase_requires_reconciliation';
 END IF;
 PERFORM 1 FROM profiles WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'purchase_profile_missing'; END IF;
 INSERT INTO purchases(user_id,product_type,stripe_payment_intent_id,stripe_checkout_session_id,
 amount,currency,status,fulfillment_state,fulfilled_at,credits_granted)
 VALUES(p_user_id,'credit_pack_'||p_credits,p_payment_intent,p_session_id,p_amount,p_currency,'paid','fulfilled',now(),p_credits)
 RETURNING * INTO purchase_row;
 UPDATE profiles SET bonus_credits=coalesce(bonus_credits,0)+p_credits WHERE user_id=p_user_id;
 INSERT INTO credit_grants(checkout_session_id,user_id,purchase_id,credits,price_id)
 VALUES(p_session_id,p_user_id,purchase_row.id,p_credits,p_price_id);
 RETURN jsonb_build_object('fulfilled',true,'duplicate',false,'credits',p_credits);
END $$;
REVOKE ALL ON FUNCTION public.fulfill_credit_pack(uuid,text,text,text,integer,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_credit_pack(uuid,text,text,text,integer,numeric,text) TO service_role;

-- Usage and bonus consumption share one commit and one ordering for a scope.
CREATE OR REPLACE FUNCTION public.record_ai_usage(
 p_user_id uuid,p_workspace_id uuid,p_category text,p_action text,p_tokens integer,
 p_model text,p_base_total integer,p_charge_bonus boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE used integer; receipt uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_user_id IS NULL OR p_base_total IS NULL OR p_base_total<0 OR p_charge_bonus IS NULL OR
 coalesce(p_category,'')='' OR coalesce(p_action,'')='' THEN RAISE EXCEPTION 'invalid_usage'; END IF;
 IF p_workspace_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspace_members WHERE user_id=p_user_id AND workspace_id=p_workspace_id)
 THEN RAISE EXCEPTION 'usage_workspace_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(p_workspace_id,p_user_id)::text,282026));
 PERFORM 1 FROM profiles WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'usage_profile_missing'; END IF;
 SELECT count(*) INTO used FROM ai_usage
 WHERE (CASE WHEN p_workspace_id IS NOT NULL THEN workspace_id=p_workspace_id ELSE user_id=p_user_id END)
 AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 INSERT INTO ai_usage(user_id,workspace_id,category,action_type,tokens_used,model_used)
 VALUES(p_user_id,p_workspace_id,p_category,p_action,p_tokens,p_model) RETURNING id INTO receipt;
 IF p_charge_bonus AND used>=p_base_total THEN
   -- A concurrent successful response must never subtract a nonexistent credit.
   UPDATE profiles SET bonus_credits=bonus_credits-1 WHERE user_id=p_user_id AND bonus_credits>0;
 END IF;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.record_ai_usage(uuid,uuid,text,text,integer,text,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_usage(uuid,uuid,text,text,integer,text,integer,boolean) TO service_role;

-- Lock the workspace before the version, like confirmation, to avoid inversions.
CREATE OR REPLACE FUNCTION public.studio_complete_generation(p_version uuid)
RETURNS public.visual_studio_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v visual_studio_versions; used integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO v FROM visual_studio_versions WHERE id=p_version;
 IF v.id IS NULL THEN RAISE EXCEPTION 'studio_missing'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v.workspace_id::text,282026));
 SELECT * INTO v FROM visual_studio_versions WHERE id=p_version FOR UPDATE;
 IF v.status='ready' THEN RETURN v; END IF;
 IF v.status NOT IN ('processing','uncertain') THEN RAISE EXCEPTION 'studio_not_processing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='visual-studio' AND name=v.result_path) THEN RAISE EXCEPTION 'studio_result_not_stored'; END IF;
 IF v.charge_usage THEN
   -- Authorization was checked at confirmation. A revocation during provider
   -- processing must not strand an already stored result or replay its charge.
   PERFORM 1 FROM profiles WHERE user_id=v.user_id FOR UPDATE;
   SELECT count(*) INTO used FROM ai_usage WHERE workspace_id=v.workspace_id
    AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
   INSERT INTO ai_usage(user_id,workspace_id,category,action_type,model_used)
    VALUES(v.user_id,v.workspace_id,'photo_retouch','studio_'||(v.proposal->>'operation'),coalesce(v.proposal->>'model','photoroom-v2'));
   IF used>=v.base_total_limit THEN
     UPDATE profiles SET bonus_credits=bonus_credits-1 WHERE user_id=v.user_id AND bonus_credits>0;
   END IF;
 END IF;
 UPDATE visual_studio_versions SET status='ready',completed_at=now(),error_message=NULL WHERE id=v.id RETURNING * INTO v;
 UPDATE visual_studio_sessions SET updated_at=now() WHERE id=v.session_id;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.studio_complete_generation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_complete_generation(uuid) TO service_role;

CREATE TABLE public.payment_checkout_attempts (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 attempt_id uuid NOT NULL DEFAULT gen_random_uuid(), params jsonb NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours', stripe_session_id text
);
ALTER TABLE public.payment_checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_checkout_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.payment_checkout_attempts TO service_role;
CREATE OR REPLACE FUNCTION public.reserve_payment_checkout(p_user_id uuid,p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a payment_checkout_attempts;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_user_id IS NULL OR p_params IS NULL OR p_params->>'mode' IS DISTINCT FROM 'payment' THEN RAISE EXCEPTION 'invalid_checkout'; END IF;
 INSERT INTO payment_checkout_attempts(user_id,params) VALUES(p_user_id,p_params) ON CONFLICT(user_id) DO NOTHING;
 SELECT * INTO a FROM payment_checkout_attempts WHERE user_id=p_user_id FOR UPDATE;
 RETURN to_jsonb(a);
END $$;
REVOKE ALL ON FUNCTION public.reserve_payment_checkout(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_payment_checkout(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.studio_confirm_generation(p_actor uuid, p_session uuid, p_proposal uuid, p_total_limit integer, p_image_limit integer, p_charge boolean, p_base_total integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s visual_studio_sessions; v visual_studio_versions; total_used integer; images_used integer; bonus integer;
 n integer; i integer; item jsonb; plan jsonb; created jsonb:='[]'::jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM visual_studio_sessions WHERE id=p_session;
 IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=s.workspace_id
   AND user_id=p_actor AND role IN ('owner','manager','editor')) THEN RAISE EXCEPTION 'studio_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s.workspace_id::text,282026));
 SELECT * INTO s FROM visual_studio_sessions WHERE id=p_session FOR UPDATE;
 SELECT * INTO v FROM visual_studio_versions WHERE id=p_proposal;
 IF v.id IS NOT NULL THEN
   IF v.session_id IS DISTINCT FROM p_session THEN RAISE EXCEPTION 'studio_conflict'; END IF;
   RETURN jsonb_build_object('version',to_jsonb(v),'claimed',false);
 END IF;
 IF NOT s.source_ready OR s.proposal IS NULL OR s.proposal->>'id' IS DISTINCT FROM p_proposal::text
   OR s.proposal->>'operation' IS NULL OR s.proposal->>'operation' NOT IN ('background','create','edit','product') THEN RAISE EXCEPTION 'studio_proposal_changed'; END IF;
 IF EXISTS(SELECT 1 FROM visual_studio_versions WHERE workspace_id=s.workspace_id AND status='processing') THEN RAISE EXCEPTION 'studio_busy'; END IF;
 IF p_charge IS NULL OR p_total_limit IS NULL OR p_image_limit IS NULL OR p_base_total IS NULL THEN RAISE EXCEPTION 'studio_invalid_quota'; END IF;
 plan:=coalesce(s.proposal->'shots','[]'::jsonb);
 IF jsonb_typeof(plan)<>'array' OR jsonb_array_length(plan)>3 THEN RAISE EXCEPTION 'studio_proposal_changed'; END IF;
 n:=1+jsonb_array_length(plan);
 SELECT count(*),count(*) FILTER(WHERE category='photo_retouch') INTO total_used,images_used FROM ai_usage
 WHERE workspace_id=s.workspace_id AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 SELECT coalesce(bonus_credits,0) INTO bonus FROM profiles WHERE user_id=p_actor FOR UPDATE;
 IF p_charge AND (n>greatest(0,p_base_total-total_used)+coalesce(bonus,0) OR images_used+n>p_image_limit) THEN RAISE EXCEPTION 'studio_quota'; END IF;
 FOR i IN 0..n-1 LOOP
  item:=s.proposal-'shots';
  IF i>0 THEN
   item:=item||jsonb_build_object('id',plan->(i-1)->>'id','image_prompt',plan->(i-1)->>'image_prompt','summary',plan->(i-1)->>'summary','format',plan->(i-1)->>'format');
   IF length(coalesce(item->>'image_prompt',''))<3 THEN RAISE EXCEPTION 'studio_proposal_changed'; END IF;
  END IF;
  IF n>1 THEN item:=item||jsonb_build_object('series_id',p_proposal,'series_index',i,'series_size',n); END IF;
  item:=item||jsonb_build_object('cost',1);
  INSERT INTO visual_studio_versions(id,session_id,workspace_id,user_id,status,proposal,result_path,charge_usage,base_total_limit,created_at)
   VALUES((item->>'id')::uuid,s.id,s.workspace_id,p_actor,'processing',item,
    s.workspace_id::text||'/'||s.id::text||'/'||(item->>'id')||'.jpg',p_charge,p_base_total,now()+i*interval '1 millisecond') RETURNING * INTO v;
  created:=created||jsonb_build_array(to_jsonb(v));
 END LOOP;
 UPDATE visual_studio_sessions SET proposal=NULL,revision=revision+1,updated_at=now() WHERE id=s.id;
 RETURN jsonb_build_object('version',created->0,'versions',created,'claimed',true);
END $function$;
