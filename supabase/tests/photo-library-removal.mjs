// Run in an EMPTY disposable PGlite database.
import fs from "node:fs";
import assert from "node:assert/strict";

const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const migration = fs.readFileSync(
  new URL("../migrations/20260915130000_safe_photo_library_removal.sql", import.meta.url),
  "utf8",
);
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const photo = "aaaaaaaa-0000-4000-8000-000000000001";
const owner = "11111111-1111-4111-8111-111111111111";
const manager = "22222222-2222-4222-8222-222222222222";
const viewer = "33333333-3333-4333-8333-333333333333";
const outsider = "44444444-4444-4444-8444-444444444444";
const identity = async (who, role = "authenticated") => {
  await db.exec(`RESET ROLE; SET ROLE ${role}`);
  await db.query("SELECT set_config('test.uid',$1,false)", [who]);
};
const visible = async () =>
  (await db.query("SELECT removed_from_library_at FROM user_photos WHERE id=$1", [photo])).rows[0];

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('test.uid', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    CREATE TABLE workspaces(id uuid PRIMARY KEY);
    CREATE TABLE workspace_members(workspace_id uuid, user_id uuid, role text);
    CREATE FUNCTION user_has_workspace_access(ws_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=ws_id AND user_id=auth.uid())
    $$;
    CREATE FUNCTION user_workspace_role(ws_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT role FROM workspace_members WHERE workspace_id=ws_id AND user_id=auth.uid() LIMIT 1
    $$;
    CREATE TABLE user_photos(
      id uuid PRIMARY KEY, user_id uuid NOT NULL, workspace_id uuid NOT NULL REFERENCES workspaces(id),
      storage_path text NOT NULL, original_storage_path text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE user_photos ENABLE ROW LEVEL SECURITY;
    CREATE POLICY workspace_select_user_photos ON user_photos FOR SELECT TO authenticated USING(user_has_workspace_access(workspace_id));
    CREATE POLICY workspace_insert_user_photos ON user_photos FOR INSERT TO authenticated WITH CHECK(user_has_workspace_access(workspace_id));
    CREATE POLICY workspace_update_user_photos ON user_photos FOR UPDATE TO authenticated USING(user_has_workspace_access(workspace_id)) WITH CHECK(user_has_workspace_access(workspace_id));
    CREATE POLICY workspace_delete_user_photos ON user_photos FOR DELETE TO authenticated USING(user_has_workspace_access(workspace_id));
    GRANT SELECT,INSERT,UPDATE,DELETE ON user_photos TO authenticated;
    INSERT INTO workspaces VALUES('${A}'),('${B}');
    INSERT INTO workspace_members VALUES
      ('${A}','${owner}','owner'),('${A}','${manager}','manager'),('${A}','${viewer}','viewer'),('${B}','${outsider}','owner');
    INSERT INTO user_photos VALUES('${photo}','${owner}','${A}','${owner}/final.jpg','${owner}/original.jpg',now());
  `);
  const before = (await db.query("SELECT to_jsonb(p) AS row FROM user_photos p")).rows[0].row;
  await db.exec(migration);
  const afterMigration = (await db.query("SELECT to_jsonb(p)-'removed_from_library_at' AS row FROM user_photos p")).rows[0].row;
  assert.deepEqual(afterMigration, before);
  console.log("PASS migration preserves every historical photo field");

  await identity(owner);
  await db.query("SELECT set_photo_library_visibility($1,true)", [photo]);
  assert.ok((await visible()).removed_from_library_at);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM user_photos")).rows[0].n, 1);
  assert.equal((await db.query("DELETE FROM user_photos WHERE id=$1 RETURNING id", [photo])).rows.length, 0);
  console.log("PASS owner removal keeps row/assets trace and direct physical delete is blocked");

  await db.query("SELECT set_photo_library_visibility($1,true)", [photo]);
  await identity(manager);
  await db.query("SELECT set_photo_library_visibility($1,false)", [photo]);
  assert.equal((await visible()).removed_from_library_at, null);
  console.log("PASS lost-response retry is idempotent and manager can restore");

  await identity(viewer);
  await assert.rejects(() => db.query("SELECT set_photo_library_visibility($1,true)", [photo]));
  await identity(outsider);
  await assert.rejects(() => db.query("SELECT set_photo_library_visibility($1,true)", [photo]));
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(() => db.query("SELECT set_photo_library_visibility($1,true)", [photo]));
  console.log("PASS viewer, foreign workspace and anon are refused");
  console.log("ALL PHOTO LIBRARY SQL CHECKS PASS");
} finally {
  await db.close();
}
