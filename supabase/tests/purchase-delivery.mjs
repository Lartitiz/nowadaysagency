// Real PostgreSQL semantics in a disposable database; never connects to production.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const user='00000000-0000-4000-8000-000000000001';
const ws='00000000-0000-4000-8000-000000000010';
const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].v;
try {
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('test.role',true)$$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE TABLE profiles(user_id uuid PRIMARY KEY,bonus_credits integer DEFAULT 0);
 CREATE TABLE workspace_members(user_id uuid,workspace_id uuid,role text);
 CREATE TABLE purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,product_type text,stripe_payment_intent_id text,stripe_checkout_session_id text,amount numeric,currency text,status text,metadata jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE ai_usage(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,workspace_id uuid,category text,action_type text,tokens_used integer,model_used text,created_at timestamptz DEFAULT now());
 CREATE TABLE visual_studio_sessions(id uuid PRIMARY KEY,workspace_id uuid,source_ready boolean,proposal jsonb,revision integer DEFAULT 0,updated_at timestamptz);
 CREATE TABLE visual_studio_versions(id uuid PRIMARY KEY,user_id uuid,workspace_id uuid,session_id uuid,status text,result_path text,charge_usage boolean,base_total_limit integer,proposal jsonb,completed_at timestamptz,error_message text,created_at timestamptz DEFAULT now());
 CREATE TABLE storage.objects(bucket_id text,name text);
 INSERT INTO auth.users VALUES('${user}'); INSERT INTO profiles VALUES('${user}',0);
 INSERT INTO workspace_members VALUES('${user}','${ws}','owner');
 SELECT set_config('test.role','service_role',false);
 `);
 await db.exec(fs.readFileSync(new URL('../migrations/20261002090000_purchase_delivery_and_usage.sql',import.meta.url),'utf8'));
 const pack=(session='cs_test_pack',credits=10)=>scalar('SELECT fulfill_credit_pack($1,$2,$3,$4,$5,$6,$7) AS v',[user,session,'pi_test','price_test',credits,3.9,'eur']);
 // Roll back BOTH receipt and profile update on failure in the middle.
 await db.exec(`CREATE FUNCTION fail_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('test.fail',true)='yes' THEN RAISE EXCEPTION 'temporary_failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER failure BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION fail_credit(); SELECT set_config('test.fail','yes',false);`);
 await assert.rejects(()=>pack(),/temporary_failure/);
 assert.equal(await scalar('SELECT count(*)::int AS v FROM purchases'),0);
 assert.equal(await scalar('SELECT count(*)::int AS v FROM credit_grants'),0);
 assert.equal(await scalar('SELECT bonus_credits AS v FROM profiles'),0);
 await db.exec("SELECT set_config('test.fail','no',false)");
 assert.equal((await pack()).fulfilled,true);
 assert.equal((await pack()).duplicate,true);
 assert.equal(await scalar('SELECT bonus_credits AS v FROM profiles'),10);
 await assert.rejects(()=>pack('cs_test_pack',30),/purchase_conflict/);
 assert.equal(await scalar('SELECT count(*)::int AS v FROM purchases'),1);
 // Historical receipts without evidence must never be credited again by guesswork.
 await db.exec(`INSERT INTO purchases(user_id,product_type,stripe_checkout_session_id,amount,status) VALUES('${user}','credit_pack_10','cs_legacy',3.9,'paid');`);
 await assert.rejects(()=>pack('cs_legacy'),/legacy_purchase_requires_reconciliation/);
 // Exact bonus consumption after monthly base; serialized even with overlapping calls.
 await db.exec(`INSERT INTO ai_usage(user_id,workspace_id,category,action_type) SELECT '${user}','${ws}','content','old' FROM generate_series(1,23);`);
 const usage=()=>scalar("SELECT record_ai_usage($1,$2,'content','test',NULL,'fake',23,true) AS v",[user,ws]);
 await Promise.all(Array.from({length:10},usage));
 assert.equal(await scalar('SELECT bonus_credits AS v FROM profiles'),0);
 assert.equal(await scalar('SELECT count(*)::int AS v FROM ai_usage'),33);
 await usage();
 assert.equal(await scalar('SELECT bonus_credits AS v FROM profiles'),0); // never negative
 await assert.rejects(()=>scalar("SELECT record_ai_usage($1,$2,'content','test',NULL,'fake',23,true) AS v",[user,'00000000-0000-4000-8000-000000000099']),/usage_workspace_forbidden/);

 // The actual Studio RPC re-reads the balance under lock, then completes once,
 // even if membership was revoked after the provider accepted the job.
 const studio='00000000-0000-4000-8000-000000000020';
 const version='00000000-0000-4000-8000-000000000021';
 await db.exec(`UPDATE profiles SET bonus_credits=10; INSERT INTO visual_studio_sessions(id,workspace_id,source_ready,proposal) VALUES('${studio}','${ws}',true,'{"id":"${version}","operation":"create"}');`);
 const claim=()=>scalar('SELECT studio_confirm_generation($1,$2,$3,23,30,true,23) AS v',[user,studio,version]);
 assert.equal((await claim()).claimed,true); // old absolute threshold 23 is intentionally stale
 assert.equal((await claim()).claimed,false);
 await assert.rejects(()=>scalar('SELECT to_jsonb(studio_complete_generation($1)) AS v',[version]),/studio_result_not_stored/);
 await db.exec(`INSERT INTO storage.objects VALUES('visual-studio','${ws}/${studio}/${version}.jpg'); DELETE FROM workspace_members WHERE user_id='${user}';`);
 const complete=()=>scalar('SELECT to_jsonb(studio_complete_generation($1)) AS v',[version]);
 assert.equal((await complete()).status,'ready');
 assert.equal((await complete()).status,'ready');
 assert.equal(await scalar('SELECT bonus_credits AS v FROM profiles'),9);
 assert.equal(await scalar("SELECT count(*)::int AS v FROM ai_usage WHERE category='photo_retouch'"),1);
 await db.exec(`INSERT INTO workspace_members VALUES('${user}','${ws}','owner');`);
 // New attempt stable until expiration; NULLs and client roles refused.
 const params={mode:'payment',line_items:[{price:'price_test',quantity:1}]};
 const attempt=()=>scalar('SELECT reserve_payment_checkout($1,$2::jsonb) AS v',[user,JSON.stringify(params)]);
 assert.equal((await attempt()).attempt_id,(await attempt()).attempt_id);
 await assert.rejects(()=>scalar('SELECT reserve_payment_checkout($1,NULL) AS v',[user]),/invalid_checkout/);
 await db.exec("SELECT set_config('test.role','authenticated',false)");
 await assert.rejects(()=>pack('cs_other'),/forbidden/);
 await assert.rejects(usage,/forbidden/);
 assert.equal(await scalar("SELECT has_function_privilege('authenticated','public.fulfill_credit_pack(uuid,text,text,text,integer,numeric,text)','EXECUTE') AS v"),false);
 console.log('PASS: atomic purchase, retry, duplicate, conflict, legacy preservation, usage/bonus, workspace, checkout, roles and NULL contracts');
} finally { await db.close(); }
