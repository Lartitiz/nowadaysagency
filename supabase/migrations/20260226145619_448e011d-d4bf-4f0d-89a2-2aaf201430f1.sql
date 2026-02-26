
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhook_events_stripe_event_id ON public.webhook_events (stripe_event_id);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- No public access needed - only accessed by service role in edge functions
