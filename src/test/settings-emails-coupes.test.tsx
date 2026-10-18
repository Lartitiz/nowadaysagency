import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

// E-mails de conseils et de relance coupés le 18/10/2026 (EMAILS_RELANCE_ENABLED
// = false) : Paramètres ne propose plus de les régler, et le dit en clair.
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'A',email:'a@example.invalid'},isAdmin:false,signOut:vi.fn()})}));
vi.mock('@/contexts/WorkspaceContext',()=>({useWorkspace:()=>({activeWorkspace:{id:'wa',name:'wa'}})}));
vi.mock('@/hooks/use-workspace-query',()=>({useProfileUserId:()=>'A',useProfileOwner:()=>({userId:'A',error:false,reload:vi.fn()})}));
vi.mock('@/hooks/use-user-plan',()=>({useUserPlan:()=>({plan:'free',usage:{},isPaid:false})}));
vi.mock('@/components/AppHeader',()=>({default:()=>null}));
vi.mock('@/components/settings/WorkspaceMembersSection',()=>({default:()=>null}));
vi.mock('@/components/settings/PurchaseHistory',()=>({default:()=>null}));
vi.mock('@/components/PromoCodeInput',()=>({default:()=>null}));
vi.mock('@/lib/invoke-with-timeout',()=>({invokeWithTimeout:vi.fn().mockResolvedValue({data:{plan:'free'},error:null})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:null}})},from:()=>{const c:any={select:()=>c,update:()=>c,eq:()=>c,maybeSingle:()=>c,single:()=>c,then:(r:any)=>Promise.resolve({data:null,error:null}).then(r)};return c;}}}));
import SettingsPage from '@/pages/SettingsPage';

it("e-mails de relance coupés : plus de réglage d'idées par e-mail ni de rappels, un message clair à la place", () => {
  render(<MemoryRouter><SettingsPage/></MemoryRouter>);
  expect(screen.getByText(/ne t'envoie ni conseils ni relances par e-mail/)).toBeInTheDocument();
  expect(screen.queryByText('Recevoir mes 5 idées de la semaine')).not.toBeInTheDocument();
  expect(screen.queryByText('Rappels de routines')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Gérer ma désinscription générale des emails' })).toBeInTheDocument();
});
