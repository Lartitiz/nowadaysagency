// La récupération automatique Instagram ne remplace jamais un chiffre saisi à la main.
// Depuis le 16/10/2026, la fusion est faite par la base (save_monthly_stats, source
// « instagram », testée dans supabase/tests/stats-provenance.mjs) ; ici la page.
// (fiche 21 de docs/robustesse/gros-fichiers.md, décision produit du 16/10/2026).
// 1) la fonction pure ; 2) le vrai `fetchFromInstagram` de la page, relu dans son texte
// et exécuté en injectant ses dépendances par leur nom (même méthode que
// ga4-other-source-preservation.test.ts).
import fs from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { fillEmptyFields, instagramMonthPatch, instagramSaveReport } from '@/features/stats/merge-fetched-stats';

describe('fillEmptyFields', () => {
  it('remplit seulement les champs null ou absents ; 0 compte comme rempli', () => {
    const existing = { followers: 1200, reach: null, views: 0 };
    const { patch, kept } = fillEmptyFields(existing, { followers: 1500, reach: 900, views: 40, interactions: 12 });
    expect(patch).toEqual({ reach: 900, interactions: 12 });
    expect(kept).toEqual(['followers', 'views']);
  });
  it('sans relevé existant : tout est rempli', () => {
    expect(fillEmptyFields(null, { followers: 3 })).toEqual({ patch: { followers: 3 }, kept: [] });
  });
});

describe('instagramMonthPatch', () => {
  const m = { followers: 1500, reach30d: 900, views30d: 4000, totalInteractions30d: 80,
    accountsEngaged30d: 60, profileViews30d: 30, followerGrowth30d: -5, postsMonthCount: 8 };
  it('mappe les 8 colonnes (abonnés gagnés négatifs ignorés) sur un mois vide', () => {
    const r = instagramMonthPatch(m, {});
    expect(r.patch).toEqual({ followers: 1500, reach: 900, views: 4000, interactions: 80,
      accounts_engaged: 60, profile_visits: 30, posts_count: 8 });
    expect(r.filled).toEqual(['abonnés', 'portée (28 j)', 'vues', 'interactions', 'comptes engagés', 'visites du profil', 'posts publiés']);
    expect(r.kept).toEqual([]);
  });
  it('garde les chiffres saisis à la main', () => {
    const r = instagramMonthPatch(m, { followers: 1234, posts_count: 0, reach: null });
    expect(r.patch).not.toHaveProperty('followers');
    expect(r.patch).not.toHaveProperty('posts_count');
    expect(r.patch.reach).toBe(900);
    expect(r.kept).toEqual(['abonnés', 'posts publiés']);
  });
  it('aucune métrique numérique : patch vide', () => {
    expect(instagramMonthPatch({ followers: 'x' }, null)).toEqual({ patch: {}, filled: [], kept: [] });
  });
});

/* ── Le vrai callback de la page ── */
const source = fs.readFileSync(process.env.STATS_SOURCE || 'src/pages/InstagramStats.tsx', 'utf8');
function callback(name: string) {
  const file = ts.createSourceFile('stats.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer && ts.isCallExpression(node.initializer))
      expression = node.initializer.arguments[0].getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!expression) throw new Error('Missing production callback ' + name);
  return ts.transpileModule('return ' + expression, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

describe('instagramSaveReport', () => {
  it('rempli si la base a gardé la valeur envoyée, sinon gardé tel quel ; custom_data ignoré', () => {
    expect(instagramSaveReport({ followers: 1500, reach: 900, custom_data: {} }, { followers: 1234, reach: 900 }))
      .toEqual({ filled: ['portée (28 j)'], kept: ['abonnés'] });
  });
});

it('« Remplir depuis Instagram » passe par save_monthly_stats (source instagram) et rend compte de ce qui est gardé', async () => {
  // La base simulée fait comme save_monthly_stats : seuls les compteurs vides sont remplis.
  const row: any = { id: 'row', user_id: 'me', month_date: '2026-10-01', followers: 1234, reach: null, custom_data: { li_stats: { keep: true } } };
  const saveStatsPatch = vi.fn(async (_ws: unknown, _month: string, _expected: unknown, patch: any, _source?: string) => {
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'custom_data') row.custom_data = { ...row.custom_data, ...(v as object) };
      else if (row[k] == null) row[k] = v;
    }
    return { ...row };
  });
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() });
  const noop = vi.fn();
  const scope: Record<string, unknown> = {
    user: { id: 'me' }, setFetchingLive: noop, workspaceId: 'me',
    invokeWithTimeout: async () => ({ data: { metrics: { followers: 1500, reach30d: 900, audience: { age: [1] } } }, error: null }),
    toast, setAudience: noop, setLivePosts: noop, currentMonthDate: '2026-10-01', allStats: [{ ...row }],
    instagramMonthPatch, instagramSaveReport, saveStatsPatch, setSelectedMonth: noop,
    loadStats: async () => {}, monthLabel: (k: string) => k,
  };
  await new Function(...Object.keys(scope), callback('fetchFromInstagram'))(...Object.values(scope))();
  expect(saveStatsPatch).toHaveBeenCalledTimes(1);
  const [ws, month, expected, patch, source] = saveStatsPatch.mock.calls[0];
  expect([ws, month, expected, source]).toEqual([null, '2026-10-01', null, 'instagram']);
  expect(patch).toMatchObject({ followers: 1500, reach: 900 });
  expect(Object.keys(patch.custom_data)).toEqual(['ig_audience']);
  expect(row.followers).toBe(1234);
  expect(row.reach).toBe(900);
  expect(row.custom_data.li_stats).toEqual({ keep: true });
  const { description } = toast.success.mock.calls[0][1];
  expect(description).toContain('Rempli automatiquement : portée (28 j)');
  expect(description).toContain('Gardé tel quel (déjà rempli) : abonnés');
});
