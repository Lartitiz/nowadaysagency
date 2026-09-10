import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('@/components/AiGeneratedMention', () => ({ default: () => null }));
vi.mock('@/components/creer/formatRenderers/FeedPreview', () => ({ default: ({ text }: { text: string }) => <p data-testid="preview">{text}</p> }));
vi.mock('@/components/RedFlagsChecker', () => ({ default: ({ onFix }: { onFix: (text: string) => void }) => <button onClick={() => onFix('Texte corrigé')}>Corriger</button> }));
import PostResult from '@/components/creer/formatRenderers/PostResult';

it('affiche la retouche sauvegardée et ne renvoie pas une ancienne version au changement de résultat', () => {
  const onTextChange = vi.fn();
  const { rerender } = render(<PostResult result={{ content: 'Original', edited_text: 'Retouche sauvegardée' }} onTextChange={onTextChange} />);
  expect(screen.getByTestId('preview').textContent).toBe('Retouche sauvegardée');
  fireEvent.click(screen.getByText('Corriger'));
  expect(onTextChange).toHaveBeenCalledExactlyOnceWith('Texte corrigé');
  rerender(<PostResult result={{ content: 'Autre résultat' }} onTextChange={onTextChange} />);
  expect(screen.getByTestId('preview').textContent).toBe('Autre résultat');
  expect(onTextChange).toHaveBeenCalledTimes(1);
});
