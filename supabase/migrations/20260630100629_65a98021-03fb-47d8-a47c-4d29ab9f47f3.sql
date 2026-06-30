
-- 1. Re-revoke SELECT on OAuth tokens
REVOKE SELECT (access_token, refresh_token) ON public.social_connections FROM authenticated, anon;

-- 2. Defense in depth: revoke UPDATE on billing-sensitive columns
REVOKE UPDATE (plan) ON public.workspaces FROM authenticated, anon;
REVOKE UPDATE (bonus_credits) ON public.profiles FROM authenticated, anon;
