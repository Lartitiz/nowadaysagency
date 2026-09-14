import { StrictMode, useRef, useState, useEffect, useCallback } from 'react';
import { renderHook, act } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { isDurableReelUrl, reelSourceKey } from '@/lib/reel-publication';
const source = readFileSync('src/pages/CreerUnifie.tsx','utf8');
const block = source.slice(source.indexOf('  const reelSource ='),source.indexOf('  // ── Sauvegarde dans le calendrier',source.indexOf('  const reelSource =')));
const js = ts.transpileModule(block,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const useActualEditor = new Function('useRef','useState','useEffect','useCallback','isDurableReelUrl','reelSourceKey',
  `return function(props) { const {result,workspaceId,creationId,ps,saveFlowState}=props; const setPublishingInstagram=()=>{}; ${js}; return {reelMp4Url,setReelMp4Url}; };`
)(useRef,useState,useEffect,useCallback,isDurableReelUrl,reelSourceKey);
const video=`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/calendar-media/reels-montes/u1/reel.mp4`;
const raw={sections:[{texte_parle:'Script A'}]};
it('actual editor rehydrates MP4 under StrictMode; caption keeps it, script invalidates it and ignores late callback',()=>{
 const saveFlowState=vi.fn();const props={result:{raw},workspaceId:'A',creationId:'creation-A',ps:{reelSourceKey:reelSourceKey(raw),reelMp4Url:video},saveFlowState};
 const {result,rerender,unmount}=renderHook(p=>useActualEditor(p),{initialProps:props,wrapper:StrictMode});
 expect(result.current.reelMp4Url).toBe(video);
 const oldReady=result.current.setReelMp4Url;
 act(()=>result.current.setReelMp4Url(video));expect(result.current.reelMp4Url).toBe(video);
 rerender({...props,result:{raw:{...raw,caption:{text:'New caption'}}} as any});expect(result.current.reelMp4Url).toBe(video);
 rerender({...props,result:{raw:{sections:[{texte_parle:'Script B'}]}}});expect(result.current.reelMp4Url).toBeNull();
 act(()=>oldReady(video));expect(result.current.reelMp4Url).toBeNull();
 const late=result.current.setReelMp4Url;unmount();saveFlowState.mockClear();act(()=>late(video));expect(saveFlowState).not.toHaveBeenCalled();
});
