import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearFlowState } from "@/hooks/use-flow-persistence";

const LS_KEY = "saved_accounts";

export interface SavedAccount {
  email: string;
  firstName: string;
  userId: string;
  refreshToken: string;
  avatarUrl?: string;
}

function loadAccounts(): SavedAccount[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function persistAccounts(accounts: SavedAccount[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(accounts));
}

export function useAccountSwitcher() {
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(loadAccounts);

  // Save current session into the account list whenever auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user || !session.refresh_token) return;

      const user = session.user;
      const account: SavedAccount = {
        email: user.email || "",
        firstName: user.user_metadata?.first_name || user.user_metadata?.prenom || user.email?.split("@")[0] || "",
        userId: user.id,
        refreshToken: session.refresh_token,
        avatarUrl: user.user_metadata?.avatar_url,
      };

      setSavedAccounts(prev => {
        const updated = prev.filter(a => a.userId !== account.userId);
        updated.unshift(account); // current account first
        persistAccounts(updated);
        return updated;
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const switchToAccount = useCallback(async (account: SavedAccount) => {
    // Save current session's refresh token before switching
    const { data: currentSession } = await supabase.auth.getSession();
    if (currentSession.session) {
      setSavedAccounts(prev => {
        const updated = prev.map(a =>
          a.userId === currentSession.session!.user.id
            ? { ...a, refreshToken: currentSession.session!.refresh_token }
            : a
        );
        persistAccounts(updated);
        return updated;
      });
    }

    // Restore the target account's session
    const { error } = await supabase.auth.refreshSession({
      refresh_token: account.refreshToken,
    });

    if (error) {
      // Token expired — remove from list
      setSavedAccounts(prev => {
        const updated = prev.filter(a => a.userId !== account.userId);
        persistAccounts(updated);
        return updated;
      });
      throw new Error("Session expirée. Reconnecte-toi avec ce compte.");
    }

    // Force page reload to reset all contexts cleanly
    window.location.href = "/dashboard";
  }, []);

  const removeAccount = useCallback((userId: string) => {
    setSavedAccounts(prev => {
      const updated = prev.filter(a => a.userId !== userId);
      persistAccounts(updated);
      return updated;
    });
  }, []);

  return { savedAccounts, switchToAccount, removeAccount };
}
