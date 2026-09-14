-- Disposable PostgreSQL fixture only; never run against a customer database.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111');
CREATE TABLE reel_fixture_history(id integer, content text);
INSERT INTO reel_fixture_history VALUES (1,'untouched');
COMMIT;
\ir ../migrations/20260914170000_reel_publication_receipts.sql
DO $$ BEGIN
  IF (SELECT content FROM reel_fixture_history WHERE id=1) IS DISTINCT FROM 'untouched' THEN RAISE EXCEPTION 'history changed'; END IF;
  IF has_table_privilege('authenticated','reel_publication_receipts','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('anon','reel_publication_receipts','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'client access'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='reel_publication_receipts'::regclass) THEN RAISE EXCEPTION 'missing RLS'; END IF;
END $$;
SET ROLE service_role;
INSERT INTO reel_publication_receipts(id,user_id,workspace_id,account_id,video_url,caption)
VALUES ('attempt','11111111-1111-4111-8111-111111111111',NULL,'ig-a','https://fake/video.mp4','caption');
DO $$ BEGIN
  BEGIN
    INSERT INTO reel_publication_receipts SELECT * FROM reel_publication_receipts WHERE id='attempt';
    RAISE EXCEPTION 'duplicate accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE reel_publication_receipts SET state='published' WHERE id='attempt';
    RAISE EXCEPTION 'success without receipt accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO reel_publication_receipts(id,user_id,account_id,video_url,caption) VALUES ('null',NULL,'ig','video','c');
    RAISE EXCEPTION 'null owner accepted';
  EXCEPTION WHEN not_null_violation THEN NULL; END;
END $$;
UPDATE reel_publication_receipts SET state='publishing' WHERE id='attempt' AND state='preparing';
DO $$ BEGIN
 IF (SELECT count(*) FROM reel_publication_receipts WHERE id='attempt' AND state='preparing') <> 0 THEN RAISE EXCEPTION 'lock transition failed'; END IF;
END $$;
UPDATE reel_publication_receipts SET state='published',post_id='instagram-post' WHERE id='attempt' AND state='publishing';
DO $$ BEGIN
 IF (SELECT post_id FROM reel_publication_receipts WHERE id='attempt') IS DISTINCT FROM 'instagram-post' THEN RAISE EXCEPTION 'receipt lost'; END IF;
END $$;
RESET ROLE;
