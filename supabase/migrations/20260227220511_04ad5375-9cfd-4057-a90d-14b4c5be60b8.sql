
-- Create conversations table
CREATE TABLE public.chat_guide_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  title TEXT NOT NULL DEFAULT 'Nouvelle conversation',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_guide_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations"
  ON public.chat_guide_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON public.chat_guide_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON public.chat_guide_conversations FOR UPDATE
  USING (auth.uid() = user_id);

-- Add columns to chat_guide_messages
ALTER TABLE public.chat_guide_messages
  ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id),
  ADD COLUMN conversation_id UUID REFERENCES public.chat_guide_conversations(id),
  ADD COLUMN actions JSONB;

-- Migrate existing session_id data: create conversations for existing sessions
INSERT INTO public.chat_guide_conversations (id, user_id, title, created_at)
SELECT DISTINCT ON (session_id)
  session_id,
  user_id,
  'Conversation importée',
  MIN(created_at)
FROM public.chat_guide_messages
GROUP BY session_id, user_id;

-- Link existing messages to conversations
UPDATE public.chat_guide_messages SET conversation_id = session_id;

-- Make conversation_id NOT NULL after migration
ALTER TABLE public.chat_guide_messages ALTER COLUMN conversation_id SET NOT NULL;

-- Drop old session_id column
ALTER TABLE public.chat_guide_messages DROP COLUMN session_id;

-- Index for fast lookups
CREATE INDEX idx_chat_messages_conversation ON public.chat_guide_messages(conversation_id, created_at);
CREATE INDEX idx_chat_conversations_user ON public.chat_guide_conversations(user_id, updated_at DESC);

-- Trigger to update conversation updated_at
CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_guide_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
