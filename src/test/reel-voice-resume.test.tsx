import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import ReelVoiceRecorder from '@/components/creer/ReelVoiceRecorder';
vi.mock('@/lib/reel-voice',()=>({blobToWav:async()=>({wav:new Blob(['qa']),duration:2}),uploadVoiceClip:async()=> 'https://fixture.test/new.wav'}));
it('restores recorded phrases on remount and keeps untouched takes when recording again',async()=>{
 const original=[{url:'https://fixture.test/one.wav',duration:1},{url:'https://fixture.test/two.wav',duration:2}];
 const stop=vi.fn();
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop}]})}});
 class Recorder {stream:any;mimeType='audio/webm';onstop=()=>{};ondataavailable=(_:any)=>{};constructor(stream:any){this.stream=stream}start(){}stop(){this.ondataavailable({data:new Blob(['take'])});this.onstop()}}
 vi.stubGlobal('MediaRecorder',Recorder);vi.stubGlobal('AudioContext',undefined);
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:()=> 'blob:fixture',revokeObjectURL:vi.fn()}));
 const changed=vi.fn();
 const {container}=render(<ReelVoiceRecorder texts={['Un','Deux']} initialClips={original} onVoicesChange={changed}/>);
 expect(container.querySelector('audio')).toHaveAttribute('src',original[0].url);
 fireEvent.click(screen.getByRole('button',{name:'Refaire cette phrase'}));
 await screen.findByRole('button',{name:/Stop/});
 fireEvent.click(screen.getByRole('button',{name:/Stop/}));
 await waitFor(()=>expect(changed).toHaveBeenCalledWith([{url:'https://fixture.test/new.wav',duration:2},original[1]]));
 vi.unstubAllGlobals();
});

it('does not promise generated voice for missing takes',()=>{
 render(<ReelVoiceRecorder texts={['Un']} onVoicesChange={()=>{}}/>);
 expect(screen.queryByText(/voix générée/)).toBeNull();
 expect(screen.getByText(/enregistre les phrases manquantes/)).toBeTruthy();
});
