import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  BUNDLE,
  BUNDLE_PATH,
  buildBundle,
} from '../../scripts/build-migration-bundle.mjs'

/**
 * O arquivo que alguém cola no Supabase é o que está no repositório.
 *
 * # A divergência que este teste torna impossível
 *
 * `APLICAR_TUDO_20260809.sql` é a concatenação das dez migrations pendentes, e
 * existe por um motivo prático: sem acesso SQL a partir deste ambiente, aplicar
 * é alguém colar SQL no editor do Supabase — dez colagens viram uma.
 *
 * O cabeçalho dele sempre disse "não edite este arquivo: edite o original e
 * gere de novo", e **não havia gerador**. Ele tinha sido montado à mão. Isso
 * significa que toda correção precisava ser feita duas vezes, e nada avisava
 * quando a segunda era esquecida.
 *
 * O custo disso não é organização: é aplicar a versão ANTIGA de uma policy sem
 * saber. Em 10/08/2026 as policies das oito tabelas novas passaram a exigir
 * papel, e não só clínica. Se o combinado tivesse ficado para trás, colar ele
 * instalaria exatamente a versão que a correção existia para eliminar — e a
 * diferença só apareceria comparando `pg_policies` com o repositório, que
 * ninguém faz por hábito.
 */

describe('bundle de migrations', () => {
  const disco = readFileSync(BUNDLE_PATH, 'utf8').replace(/\r\n/g, '\n')

  it('o arquivo em disco é o que o gerador produz', () => {
    /*
     * Comparação de conteúdo inteiro, e não de tamanho ou de hash: quando
     * falhar, o diff do vitest mostra QUAL trecho divergiu, e a correção é
     * rodar `node scripts/build-migration-bundle.mjs`.
     */
    expect(disco).toBe(buildBundle().replace(/\r\n/g, '\n'))
  })

  it('nenhuma migration da lista ficou de fora', () => {
    for (const [file] of BUNDLE) {
      expect(disco, file).toContain(file)
    }
  })

  it('o corpo de cada migration entra inteiro, sem recorte', () => {
    /*
     * `toContain` do arquivo todo é o que prende o caso perigoso: um bloco que
     * entrou pela metade continuaria tendo o nome no cabeçalho e o `begin`, e
     * pareceria certo numa leitura rápida.
     */
    for (const [file] of BUNDLE) {
      const origem = readFileSync(
        BUNDLE_PATH.replace(/APLICAR_TUDO_20260809\.sql$/, file),
        'utf8',
      )
        .replace(/\r\n/g, '\n')
        .trimEnd()

      expect(disco, file).toContain(origem)
    }
  })

  it('estoque vem antes de compras', () => {
    /*
     * `purchase_order_items` tem FK para `inventory_items`. Na ordem inversa o
     * bloco de compras falha com 42P01 — e, como cada bloco tem `commit`
     * próprio, os anteriores já teriam sido aplicados: o banco fica no meio do
     * caminho, que é o pior estado possível para quem está colando SQL.
     */
    const nomes = BUNDLE.map(([file]) => file)

    expect(nomes.indexOf('20260809_inventory.sql')).toBeLessThan(
      nomes.indexOf('20260809_purchases.sql'),
    )
  })

  it('toda policy de tabela nova exige papel, e não só clínica', () => {
    /*
     * A regressão que isto prende: escrever uma policy nova com apenas
     * `clinic_id = current_clinic_id()`.
     *
     * Isolar o tenant não separa papéis, e a separação por papel não pode viver
     * só na aplicação — o navegador tem a chave publicável e o JWT do próprio
     * membro, então o PostgREST direto não passa por action nenhuma.
     *
     * Uma policy passa de duas formas, e as duas estreitam de verdade:
     *
     *  - `has_clinic_role(...)` — separa por papel; ou
     *  - `auth.uid()` — amarra a linha à PESSOA, que é mais estreito que
     *    qualquer papel. É o caso de `notifications_insert_own_user`: a
     *    notificação é sua, e nenhum papel deveria ampliar isso.
     *
     * As isenções por nome são as leituras que TODOS os cinco papéis
     * satisfazem (`patient.read`). Para elas `clinic_id = current_clinic_id()`
     * já É a condição certa: listar os cinco seria a mesma coisa escrita duas
     * vezes, e envelheceria sozinha quando um papel novo entrasse no enum.
     */
    const ABERTAS_A_TODO_MEMBRO = new Set([
      'rooms_select',
      'patient_tags_select',
      'patient_tag_links_select',
      'patient_documents_select',
      'patient_documents_storage_select',
    ])

    const semPapel: string[] = []

    for (const bloco of disco.split('create policy ').slice(1)) {
      const nome = bloco.match(/^"([^"]+)"/)?.[1]
      if (!nome || ABERTAS_A_TODO_MEMBRO.has(nome)) continue

      const corpo = bloco.slice(0, bloco.indexOf(';'))
      const estreita =
        corpo.includes('has_clinic_role') || corpo.includes('auth.uid()')

      if (!estreita) semPapel.push(nome)
    }

    expect(semPapel).toEqual([])
  })
})
