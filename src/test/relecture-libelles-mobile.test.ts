// Relecture du 17/10/2026 des PR #1676 à #1721 : petits défauts de texte et de mise en page.
// - Les rangées de deux boutons aux libellés longs (« Revenir à … », PR #1718) passent
//   à la ligne sur téléphone : les boutons shadcn sont en `whitespace-nowrap`.
// - Le toast d'échec du branding (PR #1714) ne propose plus de réessayer : rien ne le permet.
// - Le ❌ devant « Revenir à la vérification » se lisait « annuler ».
// - La confirmation de suppression d'une slide photo ne parle plus de visuels (retirés, #1676).
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { BRANDING_SAVE_ERROR_TITLE } from '@/features/onboarding/branding-save-error';

const read = (path: string) => fs.readFileSync(path, 'utf8');

/** Classe de la `<div className="…">` la plus proche avant chaque bouton « Revenir à … ». */
function rowsAroundBackButtons(source: string) {
  const rows: string[] = [];
  const re = />\s*(?:❌\s*)?Revenir à [^<]+<\/Button>/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const before = source.slice(0, m.index);
    const div = before.lastIndexOf('<div className="');
    rows.push(before.slice(div + '<div className="'.length, before.indexOf('"', div + '<div className="'.length)));
  }
  return rows;
}

it.each([
  ['src/pages/InstagramStats.tsx', 2],
  ['src/components/stats/ExcelImportDialog.tsx', 2],
])('%s : les rangées avec « Revenir à … » passent à la ligne', (path, expected) => {
  const rows = rowsAroundBackButtons(read(path));
  expect(rows).toHaveLength(expected);
  for (const cls of rows) expect(cls.split(/\s+/)).toContain('flex-wrap');
});

it('ExcelImportDialog : pas de ❌ devant un simple retour', () => {
  expect(read('src/components/stats/ExcelImportDialog.tsx')).not.toContain('❌ Revenir');
});

it("toast d'échec du branding : ne propose pas de réessayer", () => {
  expect(BRANDING_SAVE_ERROR_TITLE).not.toMatch(/réessa/i);
});

it('suppression d’une slide photo : plus de mention des visuels', () => {
  expect(read('src/components/creer/formatRenderers/CarouselPhotoResult.tsx')).not.toContain('mettre à jour les visuels');
});
