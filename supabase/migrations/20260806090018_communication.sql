-- =============================================================================
-- Focuss Care · Onda 4 (Operação e IA) · 0018 — WhatsApp, chat e notificações
-- =============================================================================
-- `conversations` / `messages`  = conversa com o PACIENTE (WhatsApp, web).
-- `ai_conversations` / `ai_messages` (0020) = assistente interno da equipe.
-- São coisas diferentes com ciclos de vida diferentes; juntar as duas produz
-- uma tabela cheia de coluna nula e policy impossível de escrever.
-- =============================================================================

do $$ begin
  create type public.channel_provider as enum ('cloud_api','evolution','zapi','twilio','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.conversation_status as enum ('open','pending','resolved','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_direction as enum ('inbound','outbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_status as enum
    ('queued','sent','delivered','read','failed');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- whatsapp_channels — o número conectado
-- -----------------------------------------------------------------------------
create table if not exists public.whatsapp_channels (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  display_name   text not null,
  phone_number   text not null,
  provider       public.channel_provider not null default 'cloud_api',
  provider_config jsonb not null default '{}'::jsonb,   -- SEM segredo aqui
  is_active      boolean not null default true,
  connected_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (clinic_id, phone_number)
);

create trigger set_updated_at before update on public.whatsapp_channels
  for each row execute function private.tg_set_updated_at();

comment on column public.whatsapp_channels.provider_config is
  'Somente configuração não-secreta (id da conta, webhook). Token do provedor vive no ambiente do servidor, nunca em tabela lida por RLS.';

-- -----------------------------------------------------------------------------
-- conversations — a conversa com o paciente
-- -----------------------------------------------------------------------------
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  channel_id      uuid references public.whatsapp_channels(id) on delete set null,
  patient_id      uuid references public.patients(id) on delete set null,  -- pode ser desconhecido
  contact_phone   text not null,
  contact_name    text,
  status          public.conversation_status not null default 'open',
  assigned_to     uuid references public.profiles(id) on delete set null,
  is_ai_handled   boolean not null default false,     -- bot está conduzindo
  last_message_at timestamptz,
  unread_count    integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint conversations_unread_non_negative check (unread_count >= 0)
);

create unique index if not exists conversations_open_per_contact_idx
  on public.conversations (clinic_id, contact_phone)
  where status in ('open','pending');

create index if not exists conversations_inbox_idx
  on public.conversations (clinic_id, status, last_message_at desc);
create index if not exists conversations_patient_idx
  on public.conversations (clinic_id, patient_id) where patient_id is not null;

create trigger set_updated_at before update on public.conversations
  for each row execute function private.tg_set_updated_at();

comment on column public.conversations.is_ai_handled is
  'Quando true, o bot responde. Transferir para humano é setar false — e a UI precisa deixar isso a um clique de distância.';

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
create table if not exists public.messages (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references public.clinics(id) on delete cascade,
  conversation_id     uuid not null references public.conversations(id) on delete cascade,
  direction           public.message_direction not null,
  content_type        text not null default 'text',   -- text | image | audio | document | template
  body                text,
  media_url           text,
  provider_message_id text,
  status              public.message_status not null default 'queued',
  sent_by             uuid references public.profiles(id) on delete set null,  -- null = bot ou paciente
  is_from_ai          boolean not null default false,
  error               text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (clinic_id, conversation_id, created_at desc);
create unique index if not exists messages_provider_id_idx
  on public.messages (clinic_id, provider_message_id) where provider_message_id is not null;

comment on index public.messages_provider_id_idx is
  'Idempotência de webhook: provedor reenvia o mesmo evento e o INSERT duplicado é recusado em vez de duplicar a mensagem na tela.';

-- Mantém a conversa em dia sem a aplicação precisar lembrar
create or replace function private.tg_message_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at = coalesce(new.sent_at, new.created_at),
         unread_count = case
                          when new.direction = 'inbound' then unread_count + 1
                          else unread_count
                        end
   where id = new.conversation_id;
  return null;
end;
$$;

create trigger messages_touch_conversation_trg
  after insert on public.messages
  for each row execute function private.tg_message_touch_conversation();

-- -----------------------------------------------------------------------------
-- message_templates — modelos aprovados pelo provedor
-- -----------------------------------------------------------------------------
create table if not exists public.message_templates (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null references public.clinics(id) on delete cascade,
  name                 text not null,
  category             text,                    -- 'lembrete', 'confirmacao', 'pos_consulta'
  language             text not null default 'pt_BR',
  body                 text not null,
  variables            jsonb not null default '[]'::jsonb,
  provider_template_id text,
  is_approved          boolean not null default false,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (clinic_id, name)
);

create trigger set_updated_at before update on public.message_templates
  for each row execute function private.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- notifications — avisos internos da equipe
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,             -- 'agendamento', 'financeiro', 'estoque', 'ia'
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_unread_idx
  on public.notifications (clinic_id, user_id, created_at desc) where read_at is null;
