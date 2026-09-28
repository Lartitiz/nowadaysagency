import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {StudioCompositionEditor} from '@/features/visual-studio/StudioCompositionEditor';
afterEach(cleanup);
it('a changed date saves editable text without calling an image provider',async()=>{
 const save=vi.fn().mockResolvedValue({});
 render(<StudioCompositionEditor open onOpenChange={vi.fn()} disabled={false} onSave={save} initial={{title:'Marché de Noël',body:'Céramiques faites main',footer:'12 décembre · Lyon',format:'portrait',background:'#ffffff',foreground:'#000000',accent:'#aa2200',font:'sans-serif',align:'left'}}/>);
 fireEvent.change(screen.getByLabelText('Informations pratiques'),{target:{value:'19 décembre · Lyon'}});
 fireEvent.click(screen.getByRole('button',{name:'Enregistrer la composition'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({footer:'19 décembre · Lyon'}),false));
 expect(screen.getByRole('heading',{name:'Marché de Noël'})).toBeInTheDocument();
});
it('failed save retains the draft rather than exporting an unconfirmed composition',async()=>{
 render(<StudioCompositionEditor open onOpenChange={vi.fn()} disabled={false} onSave={vi.fn().mockResolvedValue(null)}/>);
 fireEvent.change(screen.getByLabelText('Titre'),{target:{value:'Atelier de printemps'}});
 fireEvent.click(screen.getByRole('button',{name:'Enregistrer la composition'}));
 await screen.findByRole('alert');expect(screen.getByLabelText('Titre')).toHaveValue('Atelier de printemps');
});
