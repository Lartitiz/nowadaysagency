import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import NewsletterResult from '@/components/creer/formatRenderers/NewsletterResult';

vi.mock('@/components/AiGeneratedMention', () => ({ default: () => null }));
afterEach(cleanup);

it('counts the displayed edited body as it changes, including an explicitly empty body', () => {
  const result = { subject: 'Objet hors compteur', preview_text: 'Aperçu séparé', content: 'Ancien corps généré', edited_text: 'Une retouche\n  de **test**', word_count: 358 };
  const view = render(<NewsletterResult result={result} />);
  expect(screen.getByText('4 mots')).toBeInTheDocument();
  expect(screen.queryByText('358 mots')).toBeNull();
  view.rerender(<NewsletterResult result={{ ...result, edited_text: 'Seul' }} />);
  expect(screen.getByText('1 mot')).toBeInTheDocument();
  view.rerender(<NewsletterResult result={{ ...result, edited_text: '' }} />);
  expect(screen.getByText('0 mots')).toBeInTheDocument();
  expect(screen.queryByText('Ancien corps généré')).toBeNull();
  expect(result.word_count).toBe(358);
});

it.each(['body', 'content', 'text'])('counts the visible historical %s body without generated metadata', field => {
  render(<NewsletterResult result={{ [field]: 'Un corps historique' }} />);
  expect(screen.getByText('3 mots')).toBeInTheDocument();
});
