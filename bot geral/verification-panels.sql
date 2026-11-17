-- Execute no SQL Editor do Supabase antes de usar o editor do painel.
CREATE TABLE IF NOT EXISTS public.verification_panels (
  guild_id text PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.verification_panels ENABLE ROW LEVEL SECURITY;
-- Não criar política pública. Bot usa SUPABASE_SERVICE_ROLE_KEY exclusivamente no backend.
REVOKE ALL ON TABLE public.verification_panels FROM anon, authenticated;
