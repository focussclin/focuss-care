/**
 * Gera src/lib/supabase/database.types.ts a partir do SCHEMA REAL do banco.
 *
 * Por que existe, em vez de `supabase gen types --linked`:
 * aquele comando exige credenciais do CLI (supabase login / access token). Este
 * script usa a mesma SUPABASE_SECRET_KEY que a aplicacao ja precisa ter, lendo o
 * documento OpenAPI que o PostgREST publica. O resultado e equivalente e o banco
 * continua sendo a unica fonte de verdade — nenhum tipo e escrito a mao.
 *
 * Uso:
 *   npm run db:types
 *
 * Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local.
 * A chave nunca e impressa nem gravada no arquivo gerado.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY

if (!url || !secret) {
  console.error(
    'Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SECRET_KEY. ' +
      'Rode com: node --env-file=.env.local scripts/generate-database-types.mjs',
  )
  process.exit(1)
}

const OUTPUT = resolve('src/lib/supabase/database.types.ts')

/**
 * Colunas NOT NULL que quase sempre tem DEFAULT no banco. O OpenAPI nao expoe
 * defaults, entao elas viram opcionais no Insert para nao obrigar o chamador a
 * preencher o que o Postgres ja preenche.
 */
const INSERT_OPTIONAL = new Set(['id', 'created_at', 'updated_at'])

/**
 * Assinaturas das funcoes RPC.
 *
 * O OpenAPI do PostgREST lista os nomes das funcoes, mas descreve os argumentos
 * apenas como `{ type: object }` — nao ha tipos a extrair. As assinaturas abaixo
 * foram confirmadas contra o schema real e cobrem as funcoes que a aplicacao
 * chama. As demais entram com tipagem generica: continuam chamaveis, so nao tem
 * o retorno estreitado.
 *
 * Se o banco mudar a assinatura de alguma delas, ajuste aqui.
 */
const KNOWN_FUNCTIONS = {
  current_clinic_id: { args: 'Record<string, never>', returns: 'string | null' },
  current_clinic_role: { args: 'Record<string, never>', returns: 'MembershipRole | null' },
  current_professional_id: { args: 'Record<string, never>', returns: 'string | null' },
  is_active_member: { args: '{ p_clinic: string }', returns: 'boolean' },
  has_clinic_role: { args: '{ p_roles: MembershipRole[] }', returns: 'boolean' },
  switch_clinic: { args: '{ p_clinic_id: string }', returns: 'undefined' },
  can_access_clinical: { args: 'Record<string, never>', returns: 'boolean' },
  can_access_financial: { args: 'Record<string, never>', returns: 'boolean' },
  can_handle_billing: { args: 'Record<string, never>', returns: 'boolean' },
  create_clinic: { args: '{ p_slug: string; p_trade_name: string }', returns: 'ClinicRow' },
  accept_invitation: { args: '{ p_token: string }', returns: 'string' },
  next_document_number: { args: '{ p_kind: string }', returns: 'number' },
}

/** patients -> Patient · allergies -> Allergy · vitals -> Vital */
function singularize(word) {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (/(ses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

/** patients -> PatientRow (alias singular, que e como uma linha se le) */
function rowAliasName(table) {
  return `${singularize(table)
    .split('_')
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('')}Row`
}

/** public.membership_role -> MembershipRole */
function enumTypeName(format) {
  return format
    .replace(/^public\./, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('')
}

/** Tipo TS de uma coluna, a partir do par (type, format) do OpenAPI. */
function columnType(meta, enumNames) {
  const { type, format, items } = meta

  if (Array.isArray(meta.enum) && format?.startsWith('public.')) {
    const name = enumTypeName(format)
    if (enumNames.has(name)) return name
  }

  if (type === 'array') {
    const inner = items?.type === 'integer' || items?.type === 'number'
      ? 'number'
      : items?.type === 'boolean'
        ? 'boolean'
        : 'string'
    return `${inner}[]`
  }

  if (format === 'json' || format === 'jsonb') return 'Json'
  if (type === 'integer' || type === 'number') return 'number'
  if (type === 'boolean') return 'boolean'

  return 'string'
}

/** Extrai a FK embutida na description: <fk table='x' column='y'/> */
function foreignKey(meta) {
  const match = meta.description?.match(/<fk table='([^']+)' column='([^']+)'\/>/)
  return match ? { table: match[1], column: match[2] } : null
}

function isView(name, definition) {
  // Views nao tem primary key declarada no OpenAPI do PostgREST.
  const hasPk = Object.values(definition.properties ?? {}).some((meta) =>
    meta.description?.includes('<pk/>'),
  )
  return !hasPk || name.startsWith('v_')
}

const response = await fetch(`${url}/rest/v1/`, {
  headers: {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    Accept: 'application/openapi+json',
  },
})

if (!response.ok) {
  console.error(`Falha ao ler o schema: HTTP ${response.status}`)
  process.exit(1)
}

const spec = await response.json()
const definitions = spec.definitions ?? {}

/** Funcoes expostas via /rpc/<nome>. */
const rpcNames = Object.keys(spec.paths ?? {})
  .filter((path) => path.startsWith('/rpc/'))
  .map((path) => path.replace('/rpc/', ''))
  .sort()

// ---------------------------------------------------------------------------
// 1. Enums
// ---------------------------------------------------------------------------
const enums = new Map()

for (const definition of Object.values(definitions)) {
  for (const meta of Object.values(definition.properties ?? {})) {
    if (Array.isArray(meta.enum) && meta.format?.startsWith('public.')) {
      const name = enumTypeName(meta.format)
      if (!enums.has(name)) {
        enums.set(name, { pgName: meta.format.replace(/^public\./, ''), values: meta.enum })
      }
    }
  }
}

const enumNames = new Set(enums.keys())

// ---------------------------------------------------------------------------
// 2. Tabelas e views
// ---------------------------------------------------------------------------
const tables = []
const views = []

for (const [name, definition] of Object.entries(definitions).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const required = new Set(definition.required ?? [])
  const columns = []
  const relationships = []

  for (const [column, meta] of Object.entries(definition.properties ?? {})) {
    const base = columnType(meta, enumNames)
    const nullable = !required.has(column)

    columns.push({
      name: column,
      type: nullable ? `${base} | null` : base,
      insertType: base,
      required: required.has(column),
    })

    const fk = foreignKey(meta)
    if (fk) {
      relationships.push({
        name: `${name}_${column}_fkey`,
        column,
        table: fk.table,
        refColumn: fk.column,
      })
    }
  }

  const entry = { name, columns, relationships }
  if (isView(name, definition)) views.push(entry)
  else tables.push(entry)
}

// ---------------------------------------------------------------------------
// 3. Emissao
// ---------------------------------------------------------------------------
const lines = []

lines.push('/**')
lines.push(' * GERADO AUTOMATICAMENTE — NAO EDITE A MAO.')
lines.push(' *')
lines.push(' * Fonte: schema real do projeto Supabase (documento OpenAPI do PostgREST).')
lines.push(' * Regenerar com:  npm run db:types')
lines.push(' *')
lines.push(` * Tabelas: ${tables.length} · Views: ${views.length} · Enums: ${enums.size}`)
lines.push(' *')
lines.push(' * Nota sobre Insert: o OpenAPI nao expoe DEFAULTs, entao id/created_at/')
lines.push(' * updated_at sao tratados como opcionais. Demais colunas NOT NULL entram')
lines.push(' * como obrigatorias.')
lines.push(' */')
lines.push('')
lines.push('export type Json =')
lines.push('  | string')
lines.push('  | number')
lines.push('  | boolean')
lines.push('  | null')
lines.push('  | { [key: string]: Json | undefined }')
lines.push('  | Json[]')
lines.push('')

lines.push('// ---------------------------------------------------------------------------')
lines.push('// Enums')
lines.push('// ---------------------------------------------------------------------------')
for (const [name, { values }] of [...enums.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`export type ${name} =`)
  lines.push(values.map((v) => `  | '${v}'`).join('\n'))
  lines.push('')
}

lines.push('// ---------------------------------------------------------------------------')
lines.push('// Database')
lines.push('// ---------------------------------------------------------------------------')
lines.push('export type Database = {')
lines.push('  public: {')
lines.push('    Tables: {')

for (const table of tables) {
  lines.push(`      ${table.name}: {`)

  lines.push('        Row: {')
  for (const c of table.columns) lines.push(`          ${c.name}: ${c.type}`)
  lines.push('        }')

  lines.push('        Insert: {')
  for (const c of table.columns) {
    const optional = !c.required || INSERT_OPTIONAL.has(c.name)
    const type = c.required ? c.insertType : `${c.insertType} | null`
    lines.push(`          ${c.name}${optional ? '?' : ''}: ${type}`)
  }
  lines.push('        }')

  lines.push('        Update: {')
  for (const c of table.columns) {
    const type = c.required ? c.insertType : `${c.insertType} | null`
    lines.push(`          ${c.name}?: ${type}`)
  }
  lines.push('        }')

  if (table.relationships.length === 0) {
    lines.push('        Relationships: []')
  } else {
    lines.push('        Relationships: [')
    for (const r of table.relationships) {
      lines.push('          {')
      lines.push(`            foreignKeyName: '${r.name}'`)
      lines.push(`            columns: ['${r.column}']`)
      lines.push('            isOneToOne: false')
      lines.push(`            referencedRelation: '${r.table}'`)
      lines.push(`            referencedColumns: ['${r.refColumn}']`)
      lines.push('          },')
    }
    lines.push('        ]')
  }

  lines.push('      }')
}

lines.push('    }')

lines.push('    Views: {')
if (views.length === 0) {
  lines.push('      [_ in never]: never')
} else {
  for (const view of views) {
    lines.push(`      ${view.name}: {`)
    lines.push('        Row: {')
    for (const c of view.columns) lines.push(`          ${c.name}: ${c.type}`)
    lines.push('        }')
    lines.push('        Relationships: []')
    lines.push('      }')
  }
}
lines.push('    }')

lines.push('    Functions: {')
for (const rpc of rpcNames) {
  const known = KNOWN_FUNCTIONS[rpc]
  lines.push(`      ${rpc}: {`)
  lines.push(`        Args: ${known ? known.args : 'Record<string, unknown>'}`)
  lines.push(`        Returns: ${known ? known.returns : 'unknown'}`)
  lines.push('      }')
}
lines.push('    }')

lines.push('    Enums: {')
for (const [name, { pgName }] of [...enums.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`      ${pgName}: ${name}`)
}
lines.push('    }')

lines.push('    CompositeTypes: {')
lines.push('      [_ in never]: never')
lines.push('    }')
lines.push('  }')
lines.push('}')
lines.push('')

lines.push('// ---------------------------------------------------------------------------')
lines.push('// Atalhos de linha (usados pelos mappers de cada modulo)')
lines.push('// ---------------------------------------------------------------------------')
for (const table of tables) {
  lines.push(
    `export type ${rowAliasName(table.name)} = Database['public']['Tables']['${table.name}']['Row']`,
  )
}
lines.push('')

writeFileSync(OUTPUT, lines.join('\n'), 'utf8')

console.log(`OK: ${OUTPUT}`)
console.log(
  `   ${tables.length} tabelas · ${views.length} views · ${enums.size} enums · ${lines.length} linhas`,
)
