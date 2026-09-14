import fs from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
 const sql = fs.readFileSync(new URL('./reel-publication.sql', import.meta.url),'utf8').replace(/\\ir (.+)/g,(_,p)=>fs.readFileSync(new URL(p,import.meta.url),'utf8'));
 await db.exec(sql);
 console.log('PASS migration, untouched history, service-only RLS/privileges, unique attempt, null owner, state/receipt constraints and transitions');
} finally { await db.close(); }
