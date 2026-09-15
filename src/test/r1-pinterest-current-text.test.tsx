import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PinterestVisualResult from '@/components/creer/formatRenderers/PinterestVisualResult';
const copy = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-copy-to-clipboard', () => ({ useCopyToClipboard: () => copy }));
beforeEach(() => { copy.mockClear(); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const raw = { title: 'Ancien titre', description: 'Ancienne description', pin_html: '<div>Visuel indépendant</div>' };
it('shows current edited SEO fields and copies the whole current edit', () => {
 const edited = '📌 TITRE :\nTitre retouché\n\n📝 DESCRIPTION :\nDeux lignes\nconservées.';
 render(<PinterestVisualResult result={{raw:{...raw, edited_text:edited}}} pinHtml={null}/>);
 expect(screen.getAllByRole('textbox').map(e=>(e as HTMLInputElement).value)).toEqual(['Titre retouché','Deux lignes\nconservées.']);
 fireEvent.click(screen.getByRole('button',{name:'Copier le titre'}));expect(copy).toHaveBeenLastCalledWith('Titre retouché', expect.any(String));
 fireEvent.click(screen.getByRole('button',{name:'Copier la description'}));expect(copy).toHaveBeenLastCalledWith('Deux lignes\nconservées.', expect.any(String));
 fireEvent.click(screen.getByRole('button',{name:'Tout copier'}));expect(copy).toHaveBeenLastCalledWith(edited, expect.any(String));
 expect(screen.getByText('3 mots')).toBeInTheDocument();
});
it.each(['', 'Texte libre sans rubriques'])('preserves an explicit free or empty edit %j without resurrecting old fields', edited => {
 render(<PinterestVisualResult result={{raw:{...raw, edited_text:edited}}} pinHtml={null}/>);
 expect(screen.getAllByRole('textbox').map(e=>(e as HTMLInputElement).value)).toEqual(['',edited]);
 fireEvent.click(screen.getByRole('button',{name:'Tout copier'}));expect(copy).toHaveBeenLastCalledWith(edited,expect.any(String));
});
it('keeps historical title and description when there is no edit',()=>{
 render(<PinterestVisualResult result={{raw}} pinHtml={null}/>);
 expect(screen.getAllByRole('textbox').map(e=>(e as HTMLInputElement).value)).toEqual([raw.title,raw.description]);
 fireEvent.click(screen.getByRole('button',{name:'Tout copier'}));expect(copy).toHaveBeenLastCalledWith('Ancien titre\n\nAncienne description',expect.any(String));
});
