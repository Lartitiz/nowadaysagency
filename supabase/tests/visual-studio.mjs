// Empty disposable PostgreSQL (PGlite); no network and no customer data.
import fs from "node:fs";
import assert from "node:assert/strict";
const { PGlite } = await import(
  process.env.PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [
  owner,
  viewer,
  outsider,
  editor,
  ws,
  otherWs,
  photo,
  session,
  second,
  proposal,
] = [1, 2, 3, 4, 10, 11, 20, 30, 31, 40].map(id);
const value = async (sql, args = []) =>
  (await db.query(sql, args)).rows[0]?.value;
const propose = async (s, p) =>
  db.query("UPDATE visual_studio_sessions SET proposal=$2::jsonb WHERE id=$1", [
    s,
    JSON.stringify({
      id: p,
      operation: "background",
      summary: "Un fond crème",
      background_prompt: "cream background",
      cost: 1,
    }),
  ]);
const claim = (
  actor = owner,
  s = session,
  p = proposal,
  total = 23,
  images = 5,
) =>
  value("SELECT studio_confirm_generation($1,$2,$3,$4,$5,true,23) AS value", [
    actor,
    s,
    p,
    total,
    images,
  ]);
const asRole = async (role, actor) => {
  await db.exec(`RESET ROLE; SET ROLE ${role}`);
  await db.query("SELECT set_config('test.uid',$1,false)", [actor || ""]);
};
try {
  await db.exec(`
 CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon;
 CREATE TABLE workspaces(id uuid PRIMARY KEY);
 CREATE TABLE workspace_members(workspace_id uuid,user_id uuid,role text);
 CREATE FUNCTION user_has_workspace_access(w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND user_id=auth.uid()) $$;
 CREATE TABLE user_photos(id uuid PRIMARY KEY,user_id uuid NOT NULL,workspace_id uuid NOT NULL,name text,status text NOT NULL DEFAULT 'ready',storage_path text NOT NULL,original_storage_path text NOT NULL,source_type text NOT NULL DEFAULT 'upload',description text,kind text,tags text[] DEFAULT '{}');
 CREATE TABLE ai_usage(id uuid DEFAULT gen_random_uuid(),user_id uuid NOT NULL,workspace_id uuid,category text NOT NULL,action_type text NOT NULL,model_used text,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(bucket_id text,name text,UNIQUE(bucket_id,name));
 CREATE TABLE bonus_receipts(user_id uuid);
 CREATE FUNCTION consume_bonus_credit(p_user_id uuid) RETURNS void LANGUAGE sql AS $$ INSERT INTO bonus_receipts VALUES(p_user_id) $$;
 INSERT INTO auth.users VALUES('${owner}'),('${viewer}'),('${outsider}'),('${editor}');
 INSERT INTO workspaces VALUES('${ws}'),('${otherWs}');
 INSERT INTO workspace_members VALUES('${ws}','${owner}','owner'),('${ws}','${viewer}','viewer'),('${ws}','${editor}','editor'),('${otherWs}','${outsider}','owner');
 INSERT INTO user_photos(id,user_id,workspace_id,name,storage_path,original_storage_path) VALUES('${photo}','${owner}','${ws}','Ma tasse','existing/final','existing/original');
 `);
  const historical = await value(
    "SELECT to_jsonb(p) AS value FROM user_photos p",
  );
  await db.exec(
    fs.readFileSync(
      new URL(
        "../migrations/20260928140000_visual_studio.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(
    await value("SELECT to_jsonb(p) AS value FROM user_photos p"),
    historical,
  );
  for (const s of [session, second])
    await db.query(
      "INSERT INTO visual_studio_sessions(id,workspace_id,user_id,source_photo_id,name,source_path,source_ready) VALUES($1,$2,$3,$4,'Tasse','source',true)",
      [s, ws, owner, photo],
    );
  await propose(session, proposal);
  await propose(second, id(41));
  for (const actor of [null, viewer, outsider])
    await assert.rejects(() => claim(actor), /studio_forbidden/);
  await assert.rejects(
    () => claim(owner, session, id(99)),
    /studio_proposal_changed/,
  );
  await assert.rejects(
    () => claim(owner, session, proposal, 0, 5),
    /studio_quota/,
  );
  await assert.rejects(
    () => claim(owner, session, proposal, 23, 0),
    /studio_quota/,
  );
  const first = await claim();
  assert.equal(first.claimed, true);
  assert.equal((await claim()).claimed, false);
  await assert.rejects(() => claim(owner, second, id(41)), /studio_busy/);
  await assert.rejects(() => claim(owner, second, proposal), /studio_conflict/);
  assert.equal(await value("SELECT count(*)::int AS value FROM ai_usage"), 0);
  await assert.rejects(
    () => db.query("SELECT studio_complete_generation($1)", [proposal]),
    /studio_result_not_stored/,
  );
  assert.equal(await value("SELECT count(*)::int AS value FROM ai_usage"), 0);
  await db.query("INSERT INTO storage.objects VALUES('visual-studio',$1)", [
    first.version.result_path,
  ]);
  for (let n = 0; n < 2; n++)
    await db.query("SELECT studio_complete_generation($1)", [proposal]);
  assert.equal(await value("SELECT count(*)::int AS value FROM ai_usage"), 1);
  assert.equal(
    await value("SELECT count(*)::int AS value FROM user_photos"),
    1,
  );
  console.log(
    "PASS confirmation replay, workspace serialization, quota and durable exactly-once charge",
  );
  for (const actor of [null, viewer, outsider])
    await assert.rejects(
      () => db.query("SELECT studio_save_library($1,$2)", [actor, proposal]),
      /studio_forbidden/,
    );
  await assert.rejects(
    () => db.query("SELECT studio_save_library($1,$2)", [owner, proposal]),
    /studio_library_files_missing/,
  );
  for (const suffix of ["", "_original"])
    await db.query("INSERT INTO storage.objects VALUES('user-photos',$1)", [
      `${owner}/studio_${proposal}${suffix}.jpg`,
    ]);
  for (const actor of [owner, editor])
    assert.equal(
      await value("SELECT studio_save_library($1,$2) AS value", [
        actor,
        proposal,
      ]),
      proposal,
    );
  assert.equal(
    await value("SELECT count(*)::int AS value FROM user_photos"),
    2,
  );
  assert.deepEqual(
    await value("SELECT to_jsonb(p) AS value FROM user_photos p WHERE id=$1", [
      photo,
    ]),
    historical,
  );
  console.log(
    "PASS explicit library save is idempotent and preserves original media",
  );
  await asRole("authenticated", viewer);
  assert.equal(
    await value("SELECT count(*)::int AS value FROM visual_studio_sessions"),
    2,
  );
  await assert.rejects(
    () => db.query("UPDATE visual_studio_sessions SET name='unsafe'"),
    /permission denied/,
  );
  await assert.rejects(() => claim(owner), /permission denied/);
  await asRole("authenticated", outsider);
  assert.equal(
    await value("SELECT count(*)::int AS value FROM visual_studio_sessions"),
    0,
  );
  assert.equal(
    await value("SELECT count(*)::int AS value FROM visual_studio_versions"),
    0,
  );
  await asRole("anon", null);
  await assert.rejects(
    () => db.query("SELECT * FROM visual_studio_sessions"),
    /permission denied/,
  );
  await db.exec("RESET ROLE");
  console.log(
    "PASS viewer read-only, foreign workspace isolation, client RPC denial",
  );
  for (let n = 0; n < 6; n++)
    assert.equal(
      await value("SELECT studio_reserve_interpretation($1,$2,$3) AS value", [
        owner,
        session,
        id(60 + n),
      ]),
      true,
    );
  assert.equal(
    await value("SELECT studio_reserve_interpretation($1,$2,$3) AS value", [
      owner,
      session,
      id(60),
    ]),
    false,
  );
  await assert.rejects(
    () =>
      db.query("SELECT studio_reserve_interpretation($1,$2,$3)", [
        owner,
        session,
        id(70),
      ]),
    /studio_interpretation_limit/,
  );
  await assert.rejects(
    () =>
      db.query("SELECT studio_reserve_interpretation($1,$2,$3)", [
        viewer,
        session,
        id(70),
      ]),
    /studio_forbidden/,
  );
  await db.exec(
    "UPDATE visual_studio_interpretations SET created_at=now()-interval '2 minutes'",
  );
  for (let n = 6; n < 100; n++)
    await db.query(
      "INSERT INTO visual_studio_interpretations VALUES($1,$2,$3,now()-interval '2 minutes')",
      [id(100 + n), owner, session],
    );
  await assert.rejects(
    () =>
      db.query("SELECT studio_reserve_interpretation($1,$2,$3)", [
        owner,
        session,
        id(70),
      ]),
    /studio_interpretation_limit/,
  );
  console.log("PASS paid interpretation replay and durable minute/day limits");
  // Account/workspace removal must not acquire blocking foreign keys.
  await db.query("DELETE FROM workspaces WHERE id=$1", [ws]);
  assert.equal(
    await value("SELECT count(*)::int AS value FROM visual_studio_sessions"),
    0,
  );
  assert.equal(
    await value("SELECT count(*)::int AS value FROM visual_studio_versions"),
    0,
  );
  assert.equal(
    await value(
      "SELECT count(*)::int AS value FROM visual_studio_interpretations",
    ),
    0,
  );
  console.log("ALL STUDIO SQL CHECKS PASS");
} finally {
  await db.close();
}
