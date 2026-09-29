import fs from "node:fs";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = name => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const historical = id(20), session = id(30), ws = id(10), other = id(11), owner = id(1);
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE workspaces(id uuid PRIMARY KEY);
    CREATE TABLE workspace_members(workspace_id uuid,user_id uuid,role text);
    INSERT INTO auth.users VALUES ('${owner}');
    INSERT INTO workspaces VALUES ('${ws}'),('${other}');`);
  await db.exec(migration("20260928163018_5b657a3a-90ec-4ad0-aee7-fd6f84076a9f.sql"));
  await db.exec(migration("20260928210000_studio_video_text_references.sql"));
  await db.exec(migration("20260929124427_39b3a3af-1da7-4004-8e85-99703a04de19.sql"));
  await db.query(`INSERT INTO studio_video_jobs(id,workspace_id,user_id,source_kind,source_id,source_name,
    person_free_attested,prompt,duration,resolution,estimated_usd,estimated_credits,input_url,
    webhook_token,status,quote_expires_at,result_path,preparation)
    VALUES ($1,$2,$3,'photo',$4,'Image de référence',true,'Prompt technique conservé',5,'480p',1,10,
      'https://example.com/image.png',$5,'ready',now()+interval '1 hour','stored/clip.mp4',
      '{"idea":"Un bol tourne doucement sur une table rouge"}'::jsonb)`,
    [historical, ws, owner, id(50), id(60)]);
  await db.exec(migration("20260929220000_studio_video_sessions_library.sql"));
  const old = (await db.query("SELECT session_id,display_name,result_path FROM studio_video_jobs WHERE id=$1", [historical])).rows[0];
  assert.equal(old.session_id, null);
  assert.equal(old.display_name, "Un bol tourne doucement sur une table rouge");
  assert.equal(old.result_path, "stored/clip.mp4");
  await db.query("UPDATE studio_video_jobs SET quote_key='same-preparation' WHERE id=$1", [historical]);
  await assert.rejects(() => db.query(`INSERT INTO studio_video_jobs(id,workspace_id,user_id,source_kind,source_id,source_name,
    person_free_attested,prompt,duration,resolution,estimated_usd,estimated_credits,input_url,
    webhook_token,status,quote_expires_at,quote_key)
    VALUES($1,$2,$3,'photo',$4,'Image de référence',true,'Prompt technique conservé',5,'480p',1,10,
      'https://example.com/image.png',$5,'quoted',now()+interval '1 hour','same-preparation')`,
    [id(21), ws, owner, id(50), id(61)]), /unique/);
  await db.query("INSERT INTO studio_video_sessions(id,workspace_id,user_id,title) VALUES($1,$2,$3,'Bol en mouvement')",
    [session, ws, owner]);
  await db.query("UPDATE studio_video_jobs SET session_id=$1 WHERE id=$2", [session, historical]);
  await db.query("INSERT INTO studio_video_session_events(id,session_id,workspace_id,user_id,kind,content) VALUES($1,$2,$3,$4,'request',$5)",
    [id(40), session, ws, owner, JSON.stringify({ idea: "Un bol tourne" })]);
  await assert.rejects(() => db.query("UPDATE studio_video_jobs SET workspace_id=$1 WHERE id=$2", [other, historical]),
    /foreign key/);
  await assert.rejects(() => db.query("INSERT INTO studio_video_session_events(id,session_id,workspace_id,user_id,kind,content) VALUES($1,$2,$3,$4,'request','{}')",
    [id(41), session, other, owner]), /foreign key/);
  await db.exec("SET ROLE authenticated");
  await assert.rejects(() => db.query("SELECT * FROM studio_video_sessions"), /permission denied/);
  await assert.rejects(() => db.query("SELECT * FROM studio_video_session_events"), /permission denied/);
  await db.exec("RESET ROLE");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM studio_video_jobs WHERE status='ready' AND workspace_id=$1", [ws])).rows[0].n, 1);
  console.log("PASS Studio video sessions: historical clip preserved, workspace FK and private tables");
} finally { await db.close(); }
