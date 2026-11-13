// Vignettes de Mes idées (13/11/2026) : la colonne `cover` est lue avec
// prudence (une valeur inattendue = pas de vignette, jamais de plantage).
import { expect, it } from 'vitest';
import { readCover } from '@/components/ideas/IdeaCover';

it('garde une slide ou une story bien formée, ignore le reste', () => {
  expect(readCover({ kind: 'slide', html: '<div/>', count: 3 })).toEqual({ kind: 'slide', html: '<div/>', count: 3 });
  expect(readCover({ kind: 'story', story: { text: 'a' }, count: 2 })?.kind).toBe('story');
  expect(readCover({ kind: 'slide', html: '   ' })).toBeNull();
  expect(readCover({ kind: 'story', story: null })).toBeNull();
  expect(readCover('texte')).toBeNull();
  expect(readCover(null)).toBeNull();
});
