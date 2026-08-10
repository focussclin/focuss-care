import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Gera `APLICAR_TUDO_20260809.sql` a partir das migrations individuais.
 *
 * # Por que existe
 *
 * O arquivo combinado já dizia, no próprio cabeçalho, "não edite este arquivo:
 * edite o original e gere de novo" — e não havia com o quê. Na prática ele foi
 * montado à mão, então toda correção precisava ser feita duas vezes, e nada
 * avisava quando a segunda era esquecida.
 *
 * Isso não é detalhe de organização: o combinado é o que alguém cola no editor
 * SQL do Supabase. Um combinado desatualizado aplica a versão ANTIGA das
 * policies, em silêncio, e a divergência só aparece quando alguém compara
 * `pg_policies` com o repositório.
 *
 * `migrationBundle.test.ts` roda este gerador em memória e falha se o resultado
 * não bater com o arquivo em disco.
 *
 * Uso: `node scripts/build-migration-bundle.mjs`
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')
export const BUNDLE_PATH = join(MIGRATIONS_DIR, 'APLICAR_TUDO_20260809.sql')

/**
 * A ordem importa e não é alfabética.
 *
 * `purchases` referencia `inventory_items`; invertida, falha com 42P01. As
 * demais são independentes entre si e ficam agrupadas por afinidade.
 */
export const BUNDLE = [
  ['20260809_rooms.sql', 'Salas e recursos + conflito de sala na agenda'],
  ['20260809_clinic_tasks.sql', 'Tarefas'],
  ['20260809_clinic_leads.sql', 'CRM e Leads'],
  ['20260809_clinic_forms.sql', 'Formularios digitais'],
  ['20260809_patient_tags.sql', 'Tags de paciente'],
  [
    '20260809_patient_documents.sql',
    'Documentos — a tabela JA EXISTE; ver o aviso no bloco',
  ],
  [
    '20260809_notifications_insert_policy.sql',
    'Notificacoes — so acrescenta policy de INSERT',
  ],
  ['20260809_bank_reconciliation.sql', 'Conciliacao bancaria'],
  ['20260809_inventory.sql', 'Estoque — PRECISA vir antes de purchases'],
  ['20260809_purchases.sql', 'Compras — referencia inventory_items'],
]

const HEADER = `-- =============================================================================
-- APLICAR TUDO — as dez migrations pendentes de 09/08/2026, na ordem segura
-- =============================================================================
--
-- GERADO por \`node scripts/build-migration-bundle.mjs\`. NAO EDITE ESTE ARQUIVO:
-- edite a migration original e rode o gerador de novo. \`migrationBundle.test.ts\`
-- falha se os dois divergirem.
--
-- Cada bloco abaixo tem \`begin\`/\`commit\` proprio, entao uma falha reverte APENAS
-- a migration que falhou — as anteriores permanecem aplicadas. Isso e proposital:
-- uma transacao unica para as dez faria um erro no fim desfazer tudo.
--
-- ORDEM: \`purchases\` referencia \`inventory_items\`. Invertida, falha com 42P01.
-- As demais sao independentes entre si.
--
-- DUAS TABELAS JA EXISTEM no schema remoto, e os blocos delas NAO criam nada:
--
--  * \`patient_documents\` — o bloco aplica policies, indices e as policies de
--    \`storage.objects\`. As policies atuais serao SUBSTITUIDAS; confira antes:
--      select policyname, cmd from pg_policies where tablename = 'patient_documents';
--
--  * \`notifications\` — o bloco so acrescenta a policy de INSERT.
--
-- O bucket \`patient-documents\` foi criado em 09/08/2026. O bloco de documentos
-- faz \`on conflict (id) do update\`, entao ele NORMALIZA as configuracoes do
-- bucket para as declaradas ali (10 MB e a lista de MIME de la).
--
-- AS POLICIES EXIGEM PAPEL, e nao so clinica (10/08/2026). Ate essa data elas
-- eram \`clinic_id = current_clinic_id()\` e mais nada, o que deixava a separacao
-- por papel viver SO na aplicacao — contornavel pelo PostgREST direto, que todo
-- membro alcanca com a chave publicavel e o proprio JWT. Ver
-- \`docs/supabase-migrations-runbook.md\`, secao "Papel dentro da policy".
--
-- INDICES REPETIDOS sao esperados: varios blocos criam
-- \`patients_id_clinic_id_key\` e afins, todos com \`if not exists\`, porque cada
-- um precisa do alvo para as proprias chaves compostas.
--
-- DEPOIS DE APLICAR: \`npm run db:types\`, remover os shims de tipos em
-- \`*/infrastructure/*Database.ts\`, habilitar os itens em \`navigation.ts\` e
-- limpar as entradas de \`BUILT_BUT_HIDDEN\` em \`src/app/reachableRoutes.test.ts\`.
-- =============================================================================
`

/** O conteúdo do bundle, como string — a mesma função que o teste consome. */
export function buildBundle() {
  const blocks = BUNDLE.map(([file, title]) => {
    const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')

    return [
      '',
      '-- ===========================================================================',
      `-- ${file} — ${title}`,
      '-- ===========================================================================',
      '',
      body.replace(/\r\n/g, '\n').trimEnd(),
      '',
    ].join('\n')
  })

  return `${HEADER}${blocks.join('\n')}\n`
}

/*
 * `pathToFileURL`, e nao `file://${argv[1]}`: no Windows o caminho e
 * `C:\...`, e a concatenacao manual produz `file://C:/...` — com duas barras,
 * nunca as tres de `file:///C:/...` que `import.meta.url` traz. A comparacao
 * falhava em silencio, o gerador nao escrevia nada e o script "passava".
 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(BUNDLE_PATH, buildBundle())
  console.log(`${BUNDLE_PATH} gerado a partir de ${BUNDLE.length} migrations.`)
}
