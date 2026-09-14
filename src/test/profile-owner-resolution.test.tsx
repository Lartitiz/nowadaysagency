import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { useProfileUserId } from '@/hooks/use-workspace-query';
const m = vi.hoisted(() => ({ user: {id:'manager'}, ws: {activeWorkspace:{id:'A'}, ownWorkspace:{id:'own'},activeRole:'manager',loading:false}, query:vi.fn() }));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:m.user})}));
vi.mock('@/contexts/DemoContext',()=>({useDemoContext:()=>({isDemoMode:false})}));
vi.mock('@/contexts/WorkspaceContext',()=>({useWorkspace:()=>m.ws,DEMO_FAKE_UUID:'demo'}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:()=>m.query()};return q;}}}));
vi.mock('sonner',()=>({toast:{error:vi.fn()}}));
function setup(){ const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});return renderHook(()=>useProfileUserId(),{wrapper:({children}:any)=><QueryClientProvider client={client}>{children}</QueryClientProvider>}); }
beforeEach(()=>{m.user={id:'manager'};m.ws={activeWorkspace:{id:'A'},ownWorkspace:{id:'own'},activeRole:'manager',loading:false};m.query.mockReset();});
it('never exposes manager account while owner lookup is pending or absent',async()=>{let resolve:any;m.query.mockReturnValue(new Promise(r=>resolve=r));const h=setup();expect(h.result.current).toBe('');await act(async()=>resolve({data:null,error:null}));expect(h.result.current).toBe('');});
it('resolves a foreign owner even while activeRole still says owner',async()=>{m.ws.activeRole='owner';m.query.mockResolvedValue({data:{user_id:'client'},error:null});const h=setup();expect(h.result.current).toBe('');await waitFor(()=>expect(h.result.current).toBe('client'));});
it('clears owner on logout and while workspace is loading',async()=>{m.query.mockResolvedValue({data:{user_id:'client'},error:null});const h=setup();await waitFor(()=>expect(h.result.current).toBe('client'));m.ws.loading=true;h.rerender();expect(h.result.current).toBe('');m.ws.loading=false;m.user=null as any;h.rerender();expect(h.result.current).toBe('');});
it('ignores late A response after A B A visits',async()=>{let resolveA:any;m.query.mockReturnValueOnce(new Promise(r=>resolveA=r)).mockResolvedValue({data:{user_id:'B-owner'},error:null});const h=setup();m.ws.activeWorkspace={id:'B'};h.rerender();await waitFor(()=>expect(h.result.current).toBe('B-owner'));await act(async()=>resolveA({data:{user_id:'A-owner'},error:null}));expect(h.result.current).toBe('B-owner');m.ws.activeWorkspace={id:'A'};h.rerender();await waitFor(()=>expect(h.result.current).toBe('A-owner'));});
