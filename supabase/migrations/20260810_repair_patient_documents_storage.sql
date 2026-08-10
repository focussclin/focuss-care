-- =============================================================================
-- Reparo idempotente do Storage de documentos de pacientes
-- =============================================================================
--
-- Use este bloco quando `patient_documents` e o bucket `patient-documents` já
-- existem, mas o upload ou o download assinado retorna 403. Ele não cria
-- dados de pacientes e não torna o bucket público.
--
-- O caminho usado pela aplicação é:
--   <clinic_id>/<patient_id>/<uuid>-<nome-seguro>
--
-- A primeira pasta é a fronteira do tenant. A sessão autenticada só acessa
-- objetos da clínica ativa, via `current_clinic_id()`.

begin;

drop policy if exists "patient_documents_storage_select" on storage.objects;
create policy "patient_documents_storage_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

drop policy if exists "patient_documents_storage_insert" on storage.objects;
create policy "patient_documents_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

commit;

-- Verificar depois de aplicar:
-- select id, name, public from storage.buckets
--   where id = 'patient-documents';
-- select policyname, cmd from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname like 'patient_documents_storage_%';
