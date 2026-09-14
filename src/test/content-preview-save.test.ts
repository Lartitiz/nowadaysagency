import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentEdit, previewContent, savePreviewEdit } from '@/lib/content-preview-save';
const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: db }));
const target = { table: 'saved_ideas' as const, id: 'A', scope: { column: 'workspace_id', value: 'space-A' } };
const base = () => ({id:'A', workspace_id:'space-A', content_data:{slides:[{id:'slide-1',title:'Titre',body:'Corps',image:'photo'}],caption:{body:'Légende'},_crosspost:{source_id:'source',history:['original']}},content_draft:'historique',notes:'privé'});
let row: any, fail: string | null, gate: Promise<void> | null;
let writes: any[], reads: number;
beforeEach(() => {
  row = base(); fail = null; gate = null; writes = []; reads = 0;
  db.from.mockImplementation(() => {
    let patch: any; const filters: [string, any][] = [];
    const query: any = {
      select: () => query,
      update: (p: any) => { patch = p; return query; },
      eq: (k: string,v:any) => { filters.push([k,v]); return query; },
      is: (k: string,v:any) => { filters.push([k,v]); return query; },
      single: async () => {
        if (!patch) { reads++; if(fail === 'read') return {error:new Error('read failed')}; return {data: structuredClone(row)}; }
        writes.push({patch,filters});
        if (gate) await gate;
        if(fail === 'write') return {error:new Error('write failed')};
        if(fail === 'zero') return {data:null,error:null};
        const match = filters.every(([k,v]) => ['content_data','story_sequence_detail'].includes(k) && v != null ? JSON.stringify(row[k]) === v : row[k] === v);
        if(!match) return {data:null,error:new Error('conflict')};
        row = {...row,...patch};
        return {data:structuredClone(row)};
      },
    }; return query;
  });
});

describe('Content preview persistence receipts', () => {
  it('reads within scope, patches one field and verifies a returned row, preserving historical data', async () => {
    const before=structuredClone(row);
    const receipt=await savePreviewEdit(target,contentEdit(row.content_data,['slides','0','title'],''));
    expect(receipt.saved).toBe(true); expect(receipt.content.slides[0].title).toBe('');
    expect(row).toMatchObject({...before,content_data:{...before.content_data,slides:[{...before.content_data.slides[0],title:''}]}});
    expect(writes[0].filters).toContainEqual(['workspace_id','space-A']);
    expect(writes[0].filters).toContainEqual(['content_data',JSON.stringify(before.content_data)]);
    expect(Object.keys(writes[0].patch).sort()).toEqual(['content_data','updated_at']);
  });
  it('serializes concurrent saves and merges different fields from the latest row',async()=>{
    let release!:()=>void; gate=new Promise(r=>release=r);
    const first=savePreviewEdit(target,contentEdit(row.content_data,['slides','0','title'],'Nouveau'));
    const second=savePreviewEdit(target,contentEdit(row.content_data,['caption','body'],''));
    await vi.waitFor(()=>expect(writes).toHaveLength(1)); expect(reads).toBe(1);
    gate=null;release(); await Promise.all([first,second]);
    expect(row.content_data.slides[0].title).toBe('Nouveau');expect(row.content_data.caption.body).toBe('');
  });
  it('does not retarget an indexed edit when items with identical text have moved',async()=>{
    const edit=contentEdit(row.content_data,['slides','0','title'],'my edit');
    row.content_data.slides.unshift({...row.content_data.slides[0],id:'different-slide'});
    await expect(savePreviewEdit(target,edit)).rejects.toThrow('ordre');expect(writes).toHaveLength(0);
  });
  it('rejects stale edits of the same field instead of overwriting another visit',async()=>{
    const edit=contentEdit(row.content_data,['slides','0','title'],'ma saisie'); row.content_data.slides[0].title='autre visite';
    await expect(savePreviewEdit(target,edit)).rejects.toThrow('changé ailleurs');expect(writes).toHaveLength(0);
  });
  it('detects an intervening writer after read, including metadata edits',async()=>{
    let release!:()=>void;gate=new Promise(r=>release=r);
    const pending=savePreviewEdit(target,contentEdit(row.content_data,['slides','0','title'],'new'));
    await vi.waitFor(()=>expect(writes).toHaveLength(1));row.content_data._crosspost.history.push('concurrent');release();
    await expect(pending).rejects.toThrow('conflict');expect(row.content_data.slides[0].title).toBe('Titre');
  });
  it.each(['read','write','zero'])('does not report success for %s failure and permits retry',async(kind)=>{
    const edit=contentEdit(row.content_data,['caption','body'],'retry');fail=kind;
    await expect(savePreviewEdit(target,edit)).rejects.toThrow(); fail=null;
    expect((await savePreviewEdit(target,edit)).saved).toBe(true);
  });
  it('accepts an exact replay after a lost response',async()=>{
    const edit=contentEdit(row.content_data,['caption','body'],'replay');await savePreviewEdit(target,edit);
    expect((await savePreviewEdit(target,edit)).content.caption.body).toBe('replay');
  });
  it.each(['old content', '"old content"'])('edits historical string content_data in its actual source column: %s',async(original)=>{
    row.content_data=original; const receipt=await savePreviewEdit(target,contentEdit(previewContent(original),[],'new text'));
    expect(row.content_data).toBe('new text');expect(row.content_draft).toBe('historique');expect(receipt.content).toBe('new text');
  });
  it('keeps personal legacy rows unassigned and scopes both reads and updates',async()=>{
    row.workspace_id=null;row.user_id='user';
    await savePreviewEdit({...target,scope:{column:'user_id',value:'user'}},contentEdit(row.content_data,['caption','body'],'new'));
    expect(writes[0].filters).toContainEqual(['workspace_id',null]);expect(row.workspace_id).toBeNull();
  });
  it.each(['123','null','true'])('preserves plain scalar draft %s',text=>{expect(previewContent(null,text)).toBe(text);});
  it('keeps a plain draft explicitly empty',async()=>{
    row.content_data=null; const receipt=await savePreviewEdit(target,contentEdit('historique',[],''));
    expect(receipt.content).toBe(''); expect(row.content_data).toBeNull(); expect(row.content_draft).toBe('');
  });
  it('normalizes JSON stored in a historical draft without losing its fields',async()=>{
    row.content_data=null;row.content_draft=JSON.stringify({content:'Texte',metadata:{id:'old'}});
    const receipt=await savePreviewEdit(target,contentEdit(previewContent(null,row.content_draft),['content'],''));
    expect(receipt.content).toEqual({content:'',metadata:{id:'old'}}); expect(row.content_draft).toContain('Texte');
  });
  it('preserves crosspost envelope and source versions while editing normalized fields',async()=>{
    row.content_data={type:'crosspost',target_channel:'reel',version:{sections:[{section:'hook',texte_parle:'Bonjour',id:'section'}]},source_id:'private',result:{versions:{reel:{original:'original'}}}};
    const original=structuredClone(row.content_data);const data=previewContent(original);
    const receipt=await savePreviewEdit({...target,format:'reel'},contentEdit(data,['script','0','texte_parle'],'Modifié'));
    expect(receipt.content.script[0]).toMatchObject({id:'section',texte_parle:'Modifié'});expect(row.content_data._crosspost).toEqual(original);
  });
  it('applies the same receipt contract to calendar structured contents',async()=>{
    row={id:'A',workspace_id:'space-A',story_sequence_detail:{stories:[{id:'s',text:'Bonjour',sticker:{label:'Vote',options:['Oui','Non']}}]},notes:'keep'};
    const receipt=await savePreviewEdit({...target,table:'calendar_posts'},contentEdit(row.story_sequence_detail,['stories','0','sticker','options'],[]));
    expect(receipt.content.stories[0].sticker.options).toEqual([]);expect(row.notes).toBe('keep');expect(row.story_sequence_detail.stories[0].id).toBe('s');
  });
});
