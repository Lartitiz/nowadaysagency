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
 -- Native Lovable bucket provisioning; MIME checks are enforced by the edge.
 INSERT INTO storage.buckets VALUES('visual-studio','visual-studio',false,15000000,NULL);
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
        "../migrations/20260928120835_e16c6bbb-7c86-445f-b682-a3aa900d9629.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      new URL(
        "../migrations/20260928160000_studio_open_chat.sql",
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
  // Source-free generation saves its own immutable first asset, without inventing a source photo.
  const freeSession = id(301),
    freeProposal = id(302);
  await db.query(
    "INSERT INTO visual_studio_sessions(id,workspace_id,user_id,name,source_path,source_ready) VALUES($1,$2,$3,'Illustration',NULL,true)",
    [freeSession, ws, owner],
  );
  await db.query(
    "UPDATE visual_studio_sessions SET proposal=$2::jsonb WHERE id=$1",
    [
      freeSession,
      JSON.stringify({
        id: freeProposal,
        operation: "create",
        original_path: null,
        model: "test-image-model",
        summary: "Illustration",
        image_prompt: "graphical illustration",
        cost: 1,
      }),
    ],
  );
  const freeClaim = await claim(owner, freeSession, freeProposal);
  assert.equal(freeClaim.claimed, true);
  await db.query("INSERT INTO storage.objects VALUES('visual-studio',$1)", [
    freeClaim.version.result_path,
  ]);
  await db.query("SELECT studio_complete_generation($1)", [freeProposal]);
  await db.query("INSERT INTO storage.objects VALUES('user-photos',$1)", [
    `${owner}/studio_${freeProposal}.jpg`,
  ]);
  await db.query("SELECT studio_save_library($1,$2)", [owner, freeProposal]);
  const freePhoto = await value(
    "SELECT to_jsonb(p) AS value FROM user_photos p WHERE id=$1",
    [freeProposal],
  );
  assert.equal(freePhoto.original_storage_path, freePhoto.storage_path);
  assert.equal(
    await value(
      "SELECT model_used AS value FROM ai_usage WHERE action_type='studio_create'",
    ),
    "test-image-model",
  );
  assert.equal((await claim(owner, freeSession, freeProposal)).claimed, false);
  console.log(
    "PASS source-free original, operation/model attribution and replay",
  );
  await db.exec(fs.readFileSync(new URL('../migrations/20260928200000_studio_brand_memory.sql',import.meta.url),'utf8'));
  const memoryId=id(300);
  const remember=(actor=owner,revision=-1,note='Couleurs franches',remove=false,space=ws)=>value('SELECT to_jsonb(studio_write_memory($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)) AS value',[actor,space,memoryId,revision,'preference','Lumière',note,'[]',remove]);
  for(const actor of [null,viewer,outsider]) await assert.rejects(()=>remember(actor),/studio_forbidden/);
  assert.equal((await remember()).revision,0);
  assert.equal((await remember()).revision,0);
  await assert.rejects(()=>remember(owner,-1,'Autre note'),/studio_conflict/);
  assert.equal((await remember(owner,0,'Lumière directe')).revision,1);
  assert.equal((await remember(owner,0,'Lumière directe')).revision,1);
  await assert.rejects(()=>remember(owner,null),/studio_conflict/);
  await assert.rejects(()=>remember(outsider,1,'Autre',false,otherWs),/studio_forbidden/);
  await db.exec('GRANT SELECT ON workspace_members TO authenticated');
  await asRole('authenticated',outsider);
  assert.equal(await value('SELECT count(*)::int AS value FROM studio_brand_memory'),0);
  await asRole('authenticated',viewer);
  assert.equal(await value('SELECT count(*)::int AS value FROM studio_brand_memory'),1);
  await assert.rejects(()=>db.exec("UPDATE studio_brand_memory SET note='intrusion'"),/permission denied/);
  await asRole('service_role',owner);
  assert.equal((await remember(owner,1,'Lumière directe',true)).revision,2);
  assert.equal((await remember(owner,1,'Lumière directe',true)).revision,2);
  await db.exec('RESET ROLE');
  console.log('PASS memory scope, immutable references, replay, edit conflicts and removal');
  await db.exec(fs.readFileSync(new URL('../migrations/20260928201000_studio_image_provider.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../migrations/20260928202000_studio_series.sql',import.meta.url),'utf8'));
  const seriesId=id(401),shotId=id(402);
  await propose(freeSession,seriesId);
  await db.query("UPDATE visual_studio_sessions SET proposal=proposal||$2::jsonb WHERE id=$1",[freeSession,JSON.stringify({operation:'create',image_prompt:'A landscape',shots:[{id:shotId,summary:'Detail',image_prompt:'A close detail',format:'square'}]})]);
  const currentUsage=await value("SELECT count(*)::int AS value FROM ai_usage");
  await assert.rejects(()=>claim(owner,freeSession,seriesId,currentUsage+1,99),/studio_quota/);
  const series=await claim(owner,freeSession,seriesId,999,999);
  assert.equal(series.versions.length,2);
  assert.equal(series.versions[1].proposal.series_index,1);
  assert.equal(series.versions[1].proposal.series_id,seriesId);
  assert.equal((await claim(owner,freeSession,seriesId,999,999)).claimed,false);
  await db.query('INSERT INTO studio_image_requests(version_id,workspace_id) VALUES($1,$2)',[seriesId,ws]);
  await db.query('INSERT INTO studio_image_requests(version_id,workspace_id) VALUES($1,$2)',[shotId,ws]);
  assert.equal(await value('SELECT studio_reserve_image_cost($1,0.6,1) AS value',[seriesId]),true);
  assert.equal(await value('SELECT studio_reserve_image_cost($1,0.6,1) AS value',[seriesId]),false);
  await assert.rejects(()=>db.query('SELECT studio_reserve_image_cost($1,0.6,1)',[shotId]),/studio_provider_budget/);
  await asRole('authenticated',owner);
  await assert.rejects(()=>db.exec('SELECT * FROM studio_image_requests'),/permission denied/);
  await db.exec('RESET ROLE');
  console.log('PASS series total quota and single claim, private provider receipts and atomic cost reservations');
  await db.exec(fs.readFileSync(new URL('../migrations/20260928203000_studio_composition.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../migrations/20260928204000_studio_uncertain_image_outcome.sql',import.meta.url),'utf8'));
  await db.query("UPDATE visual_studio_versions SET status='uncertain' WHERE id IN ($1,$2)",[seriesId,shotId]);
  await assert.rejects(()=>db.query('SELECT studio_complete_generation($1)',[seriesId]),/studio_result_not_stored/);
  assert.equal(await value("SELECT count(*)::int AS value FROM ai_usage"),currentUsage);
  const laterId=id(403);
  await propose(freeSession,laterId);
  assert.equal((await claim(owner,freeSession,laterId,999,999)).claimed,true);
  await db.query("INSERT INTO storage.objects VALUES('visual-studio',$1)",[series.versions[0].result_path]);
  await db.query('SELECT studio_complete_generation($1)',[seriesId]);
  await db.query('SELECT studio_complete_generation($1)',[seriesId]);
  assert.equal(await value("SELECT count(*)::int AS value FROM ai_usage"),currentUsage+1);
  assert.equal(await value("SELECT status AS value FROM visual_studio_versions WHERE id=$1",[seriesId]),'ready');
  console.log('PASS uncertain outcome, no blind retry, later recovery and exactly-once usage');
  await db.exec(fs.readFileSync(new URL('../migrations/20260928205000_studio_durable_image_recovery.sql',import.meta.url),'utf8'));
  await db.query("UPDATE visual_studio_versions SET created_at=now()-interval '21 minutes' WHERE id=$1",[laterId]);
  assert.equal(await value('SELECT studio_reconcile_stale_images() AS value'),1);
  assert.equal(await value('SELECT status AS value FROM visual_studio_versions WHERE id=$1',[laterId]),'uncertain');
  assert.equal(await value("SELECT count(*)::int AS value FROM ai_usage"),currentUsage+1);
  const laterPath=await value('SELECT result_path AS value FROM visual_studio_versions WHERE id=$1',[laterId]);
  await db.query("INSERT INTO storage.objects VALUES('visual-studio',$1)",[laterPath]);
  assert.equal(await value('SELECT studio_reconcile_stale_images() AS value'),1);
  assert.equal(await value('SELECT studio_reconcile_stale_images() AS value'),0);
  assert.equal(await value('SELECT status AS value FROM visual_studio_versions WHERE id=$1',[laterId]),'ready');
  assert.equal(await value("SELECT count(*)::int AS value FROM ai_usage"),currentUsage+2);
  await asRole('authenticated',owner);
  await assert.rejects(()=>value('SELECT studio_reconcile_stale_images() AS value'),/permission denied/);
  await db.exec('RESET ROLE');
  console.log('PASS browser-independent reconciliation, late stored output and restricted execution');
  const beforePhotos=await value("SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) AS value FROM user_photos p");
  const composition={design:{title:'Marché de Noël',footer:'12 décembre',format:'portrait'},background_path:null};
  await db.query('UPDATE visual_studio_sessions SET composition=$2::jsonb WHERE id=$1',[freeSession,JSON.stringify(composition)]);
  assert.deepEqual(await value('SELECT composition AS value FROM visual_studio_sessions WHERE id=$1',[freeSession]),composition);
  await assert.rejects(()=>db.query('UPDATE visual_studio_sessions SET composition=$2::jsonb WHERE id=$1',[freeSession,'[]']),/studio_composition_shape/);
  assert.equal(await value("SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) AS value FROM user_photos p"),beforePhotos);
  console.log('PASS editable composition persistence, schema and untouched library');
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
