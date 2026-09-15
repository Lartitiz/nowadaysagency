import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import LinkedInResult from '@/components/creer/formatRenderers/LinkedInResult';
import PostResult from '@/components/creer/formatRenderers/PostResult';
vi.mock('@/components/creer/formatRenderers/FeedPreview',()=>({default:({text}:any)=><pre data-testid="feed">{text}</pre>}));
vi.mock('@/components/RedFlagsChecker',()=>({default:({onFix}:any)=><button onClick={()=>onFix('Correction courante')}>Appliquer correction</button>}));
vi.mock('@/components/AiGeneratedMention',()=>({default:()=>null}));
afterEach(cleanup);
it.each(['Retouche entière',''])('LinkedIn preview respects explicit edited text %j',text=>{
 render(<LinkedInResult result={{hook:'Ancienne accroche',body:'Ancien corps',cta:'Ancien CTA',edited_text:text}}/>);
 expect(screen.queryByText('Ancienne accroche')).toBeNull();expect(screen.queryByText('Ancien corps')).toBeNull();expect(screen.queryByText('Ancien CTA')).toBeNull();
 if(text)expect(screen.getByTestId('feed')).toHaveTextContent(text);else expect(screen.queryByTestId('feed')).toBeNull();
});
it('post preview does not restore a removed hook when edited text is empty',()=>{
 render(<PostResult result={{hook:'Ancienne accroche',content:'Ancien corps',edited_text:''}}/>);
 expect(screen.queryByText('Ancienne accroche')).toBeNull();expect(screen.getByTestId('feed')).toBeEmptyDOMElement();
});

it('propagates a LinkedIn correction to the saved result',()=>{
 const onTextChange=vi.fn();render(<LinkedInResult result={{content:'Original'}} onTextChange={onTextChange}/>);
 fireEvent.click(screen.getByText('Appliquer correction'));expect(onTextChange).toHaveBeenCalledWith('Correction courante');
});
it('shows a historical LinkedIn full_text result',()=>{
 render(<LinkedInResult result={{full_text:'Texte historique entier'}}/>);
 expect(screen.getByTestId('feed')).toHaveTextContent('Texte historique entier');
});
