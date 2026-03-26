import { ReactNode, useCallback } from "react";
import { useTextSelection } from "@/hooks/use-text-selection";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import SelectionMenu from "./SelectionMenu";

export default function SelectionMenuProvider({ children }: { children: ReactNode }) {
  const { selection, menuPosition, isVisible, close } = useTextSelection();
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const workspaceId = useWorkspaceId();

  const handleAction = useCallback(
    async (text: string, prompt: string): Promise<string> => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 800));
        if (prompt.includes("Raccourcis")) return text.split(".").slice(0, 2).join(".") + ".";
        if (prompt.includes("percutant")) return text.replace(/\./g, " !").trim();
        if (prompt.includes("hook")) return text.split(".")[0] + ". 👇";
        if (prompt.includes("CTA")) return text + "\n\n💬 Dis-moi en commentaire ce que tu en penses !";
        return text + " ✨";
      }

      const { data, error } = await invokeWithTimeout("ai-text-action", {
        body: {
          selected_text: text,
          action_prompt: prompt,
          workspace_id: workspaceId,
        },
      }, 30000);

      if (error) throw new Error(error.message);
      return data?.result || text;
    },
    [user?.id, isDemoMode, workspaceId],
  );

  return (
    <>
      {children}
      {selection && menuPosition && (
        <SelectionMenu
          selectedText={selection.text}
          position={menuPosition}
          isVisible={isVisible}
          onAction={handleAction}
          onClose={close}
        />
      )}
    </>
  );
}
