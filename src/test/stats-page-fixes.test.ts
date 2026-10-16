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
