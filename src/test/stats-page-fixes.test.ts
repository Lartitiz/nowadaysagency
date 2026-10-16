// Corrections de la page « Mes statistiques » (fiche 21 de docs/robustesse/gros-fichiers.md).
// Comme ga4-other-source-preservation.test.ts, on relit le texte de la page et on exécute
// les vrais callbacks en injectant leurs dépendances par leur nom (pas de rendu complet).
import fs from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

const source = fs.readFileSync(process.env.STATS_SOURCE || 'src/pages/InstagramStats.tsx', 'utf8');
const file = ts.createSourceFile('stats.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function compile(expression: string) {
  return ts.transpileModule('return (' + expression + ')', {
    fileName: 'snippet.tsx',
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
}
function find(test: (node: ts.Node) => boolean) {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (test(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(file);
  return found;
}
/** Le corps d'une fonction déclarée `const name = useCallback(fn, deps)` ou `const name = fn`. */
function declared(name: string) {
  const [decl] = find(n => ts.isVariableDeclaration(n) && n.name.getText(file) === name) as ts.VariableDeclaration[];
  if (!decl?.initializer) throw new Error('Missing production code ' + name);
  const init = decl.initializer;
  return (ts.isCallExpression(init) ? init.arguments[0] : init).getText(file);
}
function run(code: string, scope: Record<string, unknown>) {
  return new Function(...Object.keys(scope), compile(code))(...Object.values(scope));
}
const toastSpy = () => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() });

/* ── 1. Configuration : mise à jour de la ligne existante, pas de faux succès ── */
function configTable(error: unknown = null) {
  const update = vi.fn((_payload: any) => ({ eq: vi.fn(async () => ({ error })) }));
  const insert = vi.fn((_payload: any) => ({ select: () => ({ single: async () => ({ data: { id: 'new-row' }, error }) }) }));
  return { update, insert, supabase: { from: () => ({ update, insert }) } };
}
function saveConfigWith(table: ReturnType<typeof configTable>, extra: Record<string, unknown> = {}) {
  const scope = { user: { id: 'me' }, workspaceId: 'me', supabase: table.supabase, toast: toastSpy(),
    config: null, setConfig: vi.fn(), setDraftConfig: vi.fn(), ...extra };
  return { scope, saveConfig: run(declared('saveConfig'), scope) };
}

it('« Configurer » puis enregistrer met à jour la ligne stats_config existante (pas de doublon)', async () => {
  const table = configTable();
  // handleConfigClick a mis `config` à null ; le brouillon garde l'id chargé.
  const { scope, saveConfig } = saveConfigWith(table);
  expect(await saveConfig({ id: 'cfg-1', uses_ga4: true })).toBe(true);
  expect(table.insert).not.toHaveBeenCalled();
  expect(table.update).toHaveBeenCalledTimes(1);
  expect(table.update.mock.results[0].value.eq).toHaveBeenCalledWith('id', 'cfg-1');
  expect(table.update.mock.calls[0][0]).not.toHaveProperty('id');
  expect(scope.setConfig).toHaveBeenCalledWith({ id: 'cfg-1', uses_ga4: true });
});

it('première configuration : insertion, puis l\'id créé est gardé', async () => {
  const table = configTable();
  const { scope, saveConfig } = saveConfigWith(table);
  expect(await saveConfig({ uses_ga4: false })).toBe(true);
  expect(table.insert).toHaveBeenCalledTimes(1);
  expect(table.update).not.toHaveBeenCalled();
  expect(scope.setDraftConfig).toHaveBeenCalledWith({ uses_ga4: false, id: 'new-row' });
});

it('échec d\'enregistrement : le parcours reste ouvert et aucun « Configuration enregistrée »', async () => {
  const { saveConfig } = saveConfigWith(configTable({ message: 'boom' }));
  expect(await saveConfig({ id: 'cfg-1' })).toBe(false);
  // Le onClick du dernier bouton du parcours : la plus petite fonction qui appelle saveConfig(draftConfig).
  const [button] = find(n => ts.isArrowFunction(n) && n.getText(file).includes('saveConfig(draftConfig)'))
    .sort((a, b) => a.getText(file).length - b.getText(file).length);
  const click = (ok: boolean) => {
    const scope = { saveConfig: vi.fn(async () => ok), draftConfig: {}, setShowOnboarding: vi.fn(), toast: toastSpy() };
    return { scope, done: run(button.getText(file), scope)() };
  };
  const failed = click(false); await failed.done;
  expect(failed.scope.setShowOnboarding).not.toHaveBeenCalled();
  expect(failed.scope.toast.success).not.toHaveBeenCalled();
  const succeeded = click(true); await succeeded.done;
  expect(succeeded.scope.setShowOnboarding).toHaveBeenCalledWith(false);
  expect(succeeded.scope.toast.success).toHaveBeenCalledTimes(1);
});

/* ── 2. « Les contenus du mois » : les 5 contenus passés s'affichent ── */
const h = (type: unknown, props: any, ...children: unknown[]) => ({ type, props, children });
function countLi(node: any): number {
  if (Array.isArray(node)) return node.reduce((n, c) => n + countLi(c), 0);
  if (!node || typeof node !== 'object') return 0;
  return (node.type === 'li' ? 1 : 0) + countLi(node.children);
}
function postGroupCall(label: string) {
  const [call] = find(n => ts.isCallExpression(n) && n.expression.getText(file) === 'renderPostGroup'
    && n.arguments[0].getText(file).includes(label)) as ts.CallExpression[];
  if (!call) throw new Error('Missing renderPostGroup call ' + label);
  return call.getText(file);
}
function renderWith(callText: string, scope: Record<string, unknown>) {
  const base = { React: { createElement: h, Fragment: 'frag' }, Button: 'button', Clapperboard: 'i', Images: 'i', Camera: 'i',
    Recycle: 'i', recycleTopPost: vi.fn() };
  const renderPostGroup = run(declared('renderPostGroup'), base);
  return run(callText, { ...base, renderPostGroup, ...scope });
}
const posts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, subject: 'Post ' + i, engagementRate: 0.1 }));

it('« Les contenus du mois » affiche les 5 contenus, pas 3', () => {
  const tree = renderWith(postGroupCall('Les contenus de'),
    { analysisMonthPosts: posts(8), monthLabel: () => 'octobre 2026', selectedMonth: '2026-10' });
  expect(countLi(tree)).toBe(5);
});

it('le top garde ses 3 contenus au plus', () => {
  const tree = renderWith(postGroupCall('Ce qui a le mieux marché'), { livePosts: { top: posts(5), flop: [] } });
  expect(countLi(tree)).toBe(3);
});

/* ── 3. Analyse IA d'un mois sans relevé : prévenir au lieu de la perdre en silence ── */
function analyze(formId: string | null) {
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  const scope = {
    user: { id: 'me' }, workspaceId: 'me', igConnected: false, allStats: [], formData: { reach: 10 }, formId,
    selectedMonth: '2026-09', monthLabel: () => 'septembre 2026', supabase: { from: () => ({ update }) },
    invokeWithTimeout: vi.fn(async () => ({ data: { insight: 'Bonne analyse' }, error: null })),
    toast: toastSpy(), setIsGenerating: vi.fn(), setAiAnalysis: vi.fn(), setAnalysisMonthPosts: vi.fn(),
  };
  return { scope, update, done: run(declared('handleAnalyze'), scope)() };
}

it('analyse d\'un mois pas encore enregistré : message clair, aucune écriture', async () => {
  const { scope, update, done } = analyze(null); await done;
  expect(scope.setAiAnalysis).toHaveBeenCalledWith('Bonne analyse');
  expect(update).not.toHaveBeenCalled();
  expect(scope.toast.warning).toHaveBeenCalledTimes(1);
  expect(scope.toast.warning.mock.calls[0][0]).toContain('enregistre d\'abord les chiffres de septembre 2026');
});

it('analyse d\'un mois enregistré : elle est gardée sur sa ligne, sans avertissement', async () => {
  const { scope, update, done } = analyze('row-9'); await done;
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.results[0].value.eq).toHaveBeenCalledWith('id', 'row-9');
  expect(scope.toast.warning).not.toHaveBeenCalled();
});

/* ── 4. Remplir depuis Instagram / LinkedIn / 12 mois : invokeWithTimeout (délai 60 s, étiquetage Sentry) ── */
function liveScope(answer: { data: unknown; error: unknown }) {
  const invoke = vi.fn(async () => { throw new Error('supabase.functions.invoke appelé directement'); });
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  const insert = vi.fn(async () => ({ error: null }));
  return {
    user: { id: 'me' }, workspaceId: 'ws-1', currentMonthDate: '2026-10-01', allStats: [], now: new Date(2026, 9, 16),
    monthKey: (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
    invokeWithTimeout: vi.fn(async () => answer), toast: toastSpy(), loadStats: vi.fn(async () => {}),
    supabase: { from: () => ({ update, insert }), functions: { invoke } },
    setFetchingLive: vi.fn(), setFetchingLiStats: vi.fn(), setBackfilling: vi.fn(), setAudience: vi.fn(),
    setLivePosts: vi.fn(), setLiStats: vi.fn(), setSelectedMonth: vi.fn(),
    saveStatsPatch: vi.fn(async (..._args: unknown[]) => ({ id: 'row' })),
  };
}

it.each([
  ['fetchFromInstagram', 'instagram-insights-fetch', { workspace_id: 'ws-1' }],
  ['fetchFromLinkedIn', 'linkedin-insights-fetch', { workspace_id: 'ws-1' }],
])('%s passe par invokeWithTimeout (60 s)', async (name, fn, body) => {
  const scope = liveScope({ data: { metrics: { followers: 10 } }, error: null });
  await run(declared(name), scope)();
  expect(scope.supabase.functions.invoke).not.toHaveBeenCalled();
  expect(scope.invokeWithTimeout).toHaveBeenCalledWith(fn, { body }, 60000);
});

it('backfillHistory passe par invokeWithTimeout (60 s) pour chacun des 12 mois', async () => {
  const scope = liveScope({ data: { monthMetrics: null }, error: null });
  await run(declared('backfillHistory'), scope)();
  expect(scope.supabase.functions.invoke).not.toHaveBeenCalled();
  expect(scope.invokeWithTimeout).toHaveBeenCalledTimes(12);
  expect(scope.invokeWithTimeout).toHaveBeenCalledWith('instagram-insights-fetch',
    { body: { workspace_id: 'ws-1', month: '2026-09-01' } }, 60000);
});

it('connexion à renouveler (409) : « Reconnexion requise », lu dans la réponse rendue par invokeWithTimeout', async () => {
  const scope = liveScope({ data: { error: 'Reconnecte ton compte Instagram pour autoriser la lecture de tes statistiques.' },
    error: { code: 'SERVER_ERROR', message: 'Reconnecte ton compte Instagram…' } });
  await run(declared('fetchFromInstagram'), scope)();
  expect(scope.toast.error).toHaveBeenCalledWith('Reconnexion requise', expect.anything());
});

it('backfillHistory enregistre par save_monthly_stats, source « instagram » (la base ne remplit que les cases vides)', async () => {
  const scope = liveScope({ data: { monthMetrics: { reach: 50, views: 9 } }, error: null });
  await run(declared('backfillHistory'), scope)();
  expect(scope.saveStatsPatch).toHaveBeenCalledTimes(12);
  expect(scope.saveStatsPatch).toHaveBeenCalledWith('ws-1', '2026-09-01', null, { reach: 50, views: 9 }, 'instagram');
});

/* ── 5. « Ce qui marche pour toi » : user_id de la ligne gardé, comme les 3 autres écritures ── */
function contentScope(allStats: unknown[]) {
  const update = vi.fn((_p: any) => ({ eq: vi.fn(async () => ({ error: null })) }));
  const insert = vi.fn(async (_p: any) => ({ error: null }));
  const scope = { user: { id: 'me' }, workspaceId: 'ws-1', currentMonthDate: '2026-10-01', allStats,
    invokeWithTimeout: vi.fn(async () => ({ data: { analysis: { sampleSize: 12 } }, error: null })),
    toast: toastSpy(), loadStats: vi.fn(async () => {}), supabase: { from: () => ({ update, insert }) },
    setAnalyzingContent: vi.fn(), setContentInsights: vi.fn() };
  return { scope, update, insert };
}

it('analyzeContent garde le user_id de la ligne existante', async () => {
  const { scope, update } = contentScope([{ id: 'row-10', month_date: '2026-10-01', user_id: 'owner', custom_data: { ig: 1 } }]);
  await run(declared('analyzeContent'), scope)();
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0][0].user_id).toBe('owner');
  expect(update.mock.calls[0][0].custom_data.ig).toBe(1);
});

it('analyzeContent sans ligne du mois : insertion au nom de la personne connectée', async () => {
  const { scope, insert } = contentScope([]);
  await run(declared('analyzeContent'), scope)();
  expect(insert.mock.calls[0][0].user_id).toBe('me');
});
