import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ContentRecycling from '@/components/ContentRecycling';
import { resumeIdea } from '@/lib/resume-idea';
const m=vi.hoisted(()=>({saved:null as any,calendar:null as any,response:null as any,user:'qa',workspace:'qa-space',raw:{slides:[{id:'s1',slide_number:1,title:'Première',body:'Un'},{id:'s2',slide_number:2,title:'Deuxième',body:'Deux'}],caption:{hook:'Légende',body:'Séparée',cta:'Fin'}}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:m.user}})}));
vi.mock('@/hooks/use-workspace-query',()=>({useWorkspaceId:()=> m.workspace}));
vi.mock('@/hooks/use-speech-recognition',()=>({useSpeechRecognition:()=>({isListening:false,isSupported:false,toggle:()=>{}})}));
vi.mock('@/components/ui/textarea-with-voice',()=>({TextareaWithVoice:(p:any)=><textarea {...p}/>}));
vi.mock('@/components/BaseReminder',()=>({default:()=>null}));
vi.mock('@/components/AiLoadingIndicator',()=>({default:()=>null}));
vi.mock('@/components/calendar/AddToCalendarDialog',()=>({AddToCalendarDialog:(p:any)=>p.open?<button onClick={()=>p.onConfirm('2026-09-30')}>Confirmer calendrier QA</button>:null}));
vi.mock('@/lib/posthog',()=>({posthog:{capture:()=>{}}}));
// StoryResult réel = charte, bibliothèque photo, exports : ici on vérifie seulement qu'il reçoit la séquence.
vi.mock('@/components/creer/formatRenderers/StoryResult',()=>({default:(p:any)=><div data-testid="story-result">{p.result.stories.map((s:any,i:number)=><p key={i} data-gabarit={s.visual?.gabarit??'face_cam'}>{s.text}</p>)}</div>}));
vi.mock('@/lib/invoke-with-timeout',()=>({invokeWithTimeout:async()=>({data:m.response??{results:{carrousel:m.raw}},error:null})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{const q:any={insert:(v:any)=>{if(table==='saved_ideas')m.saved=v;if(table==='calendar_posts')m.calendar=v;return q},select:()=>q,single:async()=>({data:{id:'saved'},error:null}),then:(resolve:any)=>Promise.resolve({data:null,error:null}).then(resolve)};return q}}}));
beforeEach(()=>{m.saved=null;m.calendar=null;m.response=null;m.user='qa';m.workspace='qa-space';sessionStorage.clear();});
afterEach(cleanup);
it('keeps recycling drafts separate when switching workspaces',async()=>{
 const view=render(<MemoryRouter initialEntries={['/creer?canal=linkedin']}><ContentRecycling/></MemoryRouter>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Source privée A'}});
 m.workspace='autre-espace';
 view.rerender(<MemoryRouter initialEntries={['/creer?canal=linkedin']}><ContentRecycling/></MemoryRouter>);
 await waitFor(()=>expect(screen.getByRole('textbox')).toHaveValue(''));
 m.workspace='qa-space';
 view.rerender(<MemoryRouter initialEntries={['/creer?canal=linkedin']}><ContentRecycling/></MemoryRouter>);
 await waitFor(()=>expect(screen.getByRole('textbox')).toHaveValue('Source privée A'));
});
it('keeps structured recycled carousel through the real SaveToIdeasDialog and resume adapter',async()=>{
 render(<MemoryRouter initialEntries={['/creer?format=carrousel']}><ContentRecycling/></MemoryRouter>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Document QA'}});
 fireEvent.click(screen.getByRole('button',{name:'Recycler'}));
 fireEvent.click(await screen.findByRole('button',{name:'Sauvegarder en idée'}));
 fireEvent.click(screen.getByRole('button',{name:'Enregistrer dans Mes idées'}));
 await waitFor(()=>expect(m.saved).toBeTruthy());
 const resumed=resumeIdea(m.saved);
 expect(resumed?.raw.slides).toEqual(m.raw.slides);
 expect(resumed?.raw.caption).toEqual(m.raw.caption);
});

it('preserves corrected fields, explicit empty text, order and caption on saved carousel resume',async()=>{
 m.raw={slides:[{id:'s2',slide_number:1,title:'N’hésitez pas',body:'Dans un monde où'},{id:'s1',slide_number:2,title:'Deuxième',body:''}],caption:{hook:'En outre',body:'Séparée',cta:''}};
 const original=JSON.stringify(m.raw);
 render(<MemoryRouter initialEntries={['/creer?format=carrousel']}><ContentRecycling/></MemoryRouter>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Document QA'}});
 fireEvent.click(screen.getByRole('button',{name:'Recycler'}));
 const fix=await screen.findByRole('button',{name:/Corriger/}); fireEvent.click(fix);
 fireEvent.click(screen.getByRole('button',{name:'Sauvegarder en idée'}));
 fireEvent.click(screen.getByRole('button',{name:'Enregistrer dans Mes idées'}));
 await waitFor(()=>expect(m.saved.content_data.slides[0].body).toBe(''));
 const resumed=resumeIdea(m.saved);
 expect(resumed?.raw.slides.map((s:any)=>s.id)).toEqual(['s2','s1']);
 expect(resumed?.raw.slides[1].body).toBe('');
 expect(resumed?.raw.caption).toEqual({hook:'Et',body:'Séparée',cta:''});
 expect(m.saved.content_data.text).not.toContain('Dans un monde où');
 expect(JSON.stringify(m.raw)).toBe(original);
 fireEvent.click(screen.getByRole('button',{name:'Planifier'}));
 fireEvent.click(screen.getByRole('button',{name:'Confirmer calendrier QA'}));
 await waitFor(()=>expect(m.calendar).toBeTruthy());
 expect(m.calendar.story_sequence_detail.slides).toEqual(resumed?.raw.slides);
 expect(m.calendar.story_sequence_detail.caption).toEqual(resumed?.raw.caption);
});

it.each(['linkedin','newsletter','reel','stories','carrousel'])('keeps the current text-only %s save contract',async format=>{
 m.response={results:{[format]:'En outre : texte QA'}};
 render(<MemoryRouter initialEntries={['/creer?format='+format]}><ContentRecycling/></MemoryRouter>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Document QA'}});
 fireEvent.click(screen.getByRole('button',{name:'Recycler'}));
 fireEvent.click(await screen.findByRole('button',{name:/Corriger/}));
 fireEvent.click(screen.getByRole('button',{name:'Sauvegarder en idée'}));
 fireEvent.click(screen.getByRole('button',{name:'Enregistrer dans Mes idées'}));
 await waitFor(()=>expect(m.saved).toBeTruthy());
 expect(m.saved.content_data).toEqual({type:'recycling',format,text:'Et : texte QA',_ai_generated:true});
});

// Stories recyclées structurées (04/10/2026) : rendues en vraies stories (comme
// le flux principal), plus en prose ; consignes photo jamais montrées comme du
// texte à publier ; calendrier et idées gardent la séquence.
it('renders structured recycled stories as stories and keeps the sequence when saving',async()=>{
 const seq={stories:[
  {number:1,text:'Premier texte lu.',visual:{gabarit:'photo_pills',background:'photo',title_pill:null,body_pill:'Premier texte lu.',list_pills:null,quote:null,photo_directive:'CONSIGNE PHOTO un'}},
  {number:2,text:'Vous gardez ?',sticker:{type:'sondage',label:'Sondage',options:['Oui','Non']},visual:{gabarit:'interaction',background:'photo',title_pill:null,body_pill:'Vous gardez ?',list_pills:null,quote:null,photo_directive:'CONSIGNE PHOTO deux'}},
 ]};
 m.response={results:{stories:seq}};
 render(<MemoryRouter initialEntries={['/creer?format=stories']}><ContentRecycling/></MemoryRouter>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Document QA'}});
 fireEvent.click(screen.getByRole('button',{name:'Recycler'}));
 const view=await screen.findByTestId('story-result');
 expect(view.textContent).toContain('Premier texte lu.');
 expect(document.body.textContent).not.toContain('CONSIGNE PHOTO');
 expect(document.querySelector('pre')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Sauvegarder en idée'}));
 fireEvent.click(screen.getByRole('button',{name:'Enregistrer dans Mes idées'}));
 await waitFor(()=>expect(m.saved).toBeTruthy());
 expect(m.saved.content_data.stories).toEqual(seq.stories);
 expect(m.saved.content_data.text).toBe('📱 Story 1\nPremier texte lu.\n\n📱 Story 2 [sticker : sondage]\nVous gardez ?');
 expect(resumeIdea(m.saved)?.raw.stories).toEqual(seq.stories);
 fireEvent.click(screen.getByRole('button',{name:'Planifier'}));
 fireEvent.click(screen.getByRole('button',{name:'Confirmer calendrier QA'}));
 await waitFor(()=>expect(m.calendar).toBeTruthy());
 expect(m.calendar.format).toBe('story_serie');
 expect(m.calendar.story_sequence_detail.type).toBe('stories');
 expect(m.calendar.story_sequence_detail.stories).toEqual(seq.stories);
 expect(m.calendar.stories_count).toBe(2);
 expect(m.calendar.content_draft).not.toContain('CONSIGNE PHOTO');
});
