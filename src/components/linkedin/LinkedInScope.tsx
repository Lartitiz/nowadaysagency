import { ComponentType } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceFilter, useWorkspaceReady } from '@/hooks/use-workspace-query';

/** A new mounted visit for A → B → A; old async work cannot target the new form. */
export function LinkedInScope({ page: Page }: { page: ComponentType }) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const ready = useWorkspaceReady();
  if (!ready || !user || !value) return <p role="status">Chargement de l’espace…</p>;
  return <Page key={`${user.id}:${column}:${value}`} />;
}
