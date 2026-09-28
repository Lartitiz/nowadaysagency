// Execute the real migration in an empty disposable PostgreSQL database.
import fs from "node:fs";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [owner, editor, viewer, outsider, ws, otherWs, first, second, expired, foreign] =
  [1, 2, 3, 4, 10, 11, 20, 21, 22, 23].map(id);
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
const claim = (actor, job, limit) => scalar(
  "SELECT studio_video_claim($1,$2,$3) AS value", [actor, job, limit],
);
const insert = (job, workspace, actor, cost, expires = "1 hour") => db.query(`
  INSERT INTO studio_video_jobs(id,workspace_id,user_id,source_kind,source_id,source_name,
    person_free_attested,prompt,duration,resolution,estimated_usd,estimated_credits,input_url,
    webhook_token,status,quote_expires_at)
  VALUES($1,$2,$3,'photo',$4,'Atelier',true,'La lumière traverse l’atelier',5,
    '480p',$5,72,'https://example.com/reference.png',$6,'quoted',now()+$7::interval)
`, [job, workspace, actor, id(50), cost, id(Number(job.slice(-2)) + 70), expires]);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE workspaces(id uuid PRIMARY KEY);
    CREATE TABLE workspace_members(workspace_id uuid,user_id uuid,role text);
    INSERT INTO auth.users VALUES('${owner}'),('${editor}'),('${viewer}'),('${outsider}');
    INSERT INTO workspaces VALUES('${ws}'),('${otherWs}');
    INSERT INTO workspace_members VALUES('${ws}','${owner}','owner'),
      ('${ws}','${editor}','editor'),('${ws}','${viewer}','viewer'),
      ('${otherWs}','${outsider}','owner');
  `);
  await db.exec(fs.readFileSync(new URL(
    "../migrations/20260928163018_5b657a3a-90ec-4ad0-aee7-fd6f84076a9f.sql", import.meta.url,
  ), "utf8"));
  await insert(first, ws, owner, 0.72);
  await insert(second, ws, editor, 0.5);
  await insert(expired, ws, owner, 0.5, "-1 minute");
  await insert(foreign, otherWs, outsider, 0.5);

  await db.exec("SET ROLE authenticated");
  await assert.rejects(() => claim(owner, first, 2), /permission denied/);
  await assert.rejects(() => scalar("SELECT count(*) AS value FROM studio_video_jobs"), /permission denied/);
  await db.exec("RESET ROLE");
  for (const actor of [null, viewer, outsider])
    await assert.rejects(() => claim(actor, first, 2), /video_forbidden/);
  await assert.rejects(() => claim(owner, first, null), /video_budget_unavailable/);
  await assert.rejects(() => claim(owner, expired, 2), /video_quote_expired/);
  assert.equal(await claim(owner, first, 1), true);
  assert.equal(await claim(owner, first, 1), false);
  assert.equal(await scalar("SELECT count(*)::int AS value FROM studio_video_jobs WHERE status='submitting_uncertain'"), 1);
  await assert.rejects(() => claim(editor, second, 1), /video_budget_exceeded/);
  await assert.rejects(() => claim(outsider, foreign, 2), /studio_video_one_active/);

  await db.query("UPDATE studio_video_jobs SET status='ready',result_path='stored/clip.mp4' WHERE id=$1", [first]);
  await assert.rejects(() => claim(editor, second, 1), /video_budget_exceeded/);
  assert.equal(await claim(editor, second, 2), true);
  await db.query("UPDATE studio_video_jobs SET status='failed' WHERE id=$1", [second]);
  assert.equal(await claim(outsider, foreign, 2), true);
  assert.equal(await scalar("SELECT count(*)::int AS value FROM studio_video_jobs WHERE status='failed'"), 1);
  console.log("PASS Studio video SQL: roles, expiry, claim replay, global serialization and monthly budget");
} finally {
  await db.close();
}
