-- NotificaÃ§Ãµes operacionais criadas pelo prÃ³prio usuÃ¡rio autenticado.
--
-- O centro de notificaÃ§Ãµes Ã© recortado por `user_id` no repositÃ³rio. Esta
-- policy fecha tambÃ©m a escrita: uma aÃ§Ã£o nunca pode fabricar um aviso para
-- outro usuÃ¡rio nem para outra clÃ­nica.

alter table public.notifications enable row level security;

drop policy if exists "notifications_insert_own_user" on public.notifications;
create policy "notifications_insert_own_user"
  on public.notifications
  for insert
  to authenticated
  with check (
    clinic_id = public.current_clinic_id()
    and user_id = auth.uid()
  );
