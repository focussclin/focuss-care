'use client'

import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatShortDate, formatTime } from '@/lib/utils/date'

import { listRecordVersionsAction } from '../actions/listRecordVersions.action'
import {
  recordMessages,
  type MedicalRecordDto,
} from '../schemas/record.schema'
import { recordTypeLabel } from './recordTypeLabel'

export interface RecordVersionsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** O registro cuja cadeia será lida. A versão vigente é o topo dela. */
  record: MedicalRecordDto | null
  /**
   * Há banco por trás desta tela.
   *
   * Falso é demonstração local: a action recusaria por falta de sessão, e um
   * erro vermelho diria que o produto está quebrado quando ele só está sem
   * banco.
   */
  isLive?: boolean
}

/**
 * O histórico de versões de um registro — o append-only ficando visível.
 *
 * # O que esta tela prova
 *
 * O módulo repete que corrigir não reescreve: insere uma versão nova apontando
 * para a anterior. Enquanto ninguém pudesse ver as anteriores, isso era uma
 * afirmação do código sobre si mesmo. Aqui a versão de 9h e a correção de 14h
 * aparecem lado a lado, cada uma com seu autor e sua hora — que é o que
 * transforma "não editamos, versionamos" em algo verificável por quem audita.
 *
 * # O texto aparece inteiro, e a diferença NÃO é destacada
 *
 * Comparar duas evoluções palavra a palavra e pintar o que mudou seria uma
 * leitura da aplicação sobre conteúdo clínico. Um destaque no lugar errado —
 * "sem" fora do trecho marcado, uma negação que some — muda o sentido do que se
 * lê, e quem lê acredita no destaque. As versões vêm completas, na ordem, e a
 * comparação fica com quem tem formação para fazê-la.
 */
export function RecordVersionsModal({
  open,
  onOpenChange,
  record,
  isLive = false,
}: RecordVersionsModalProps) {
  /**
   * A cadeia JÁ CARREGADA, com o registro que a produziu.
   *
   * Guardar o id junto é o que permite derivar "está carregando" e descartar a
   * resposta de um registro anterior sem um segundo estado — mesmo desenho do
   * seletor de vínculo em `RecordEditorModal`.
   */
  const [loaded, setLoaded] = useState<{
    recordId: string
    versions: readonly MedicalRecordDto[]
    error: string | null
  } | null>(null)

  /**
   * Descarta resposta atrasada.
   *
   * Abrir o histórico de dois registros em sequência poderia fazer a cadeia do
   * primeiro chegar depois e ficar na tela — sob o cabeçalho do segundo. Em
   * prontuário isso não é um detalhe de carregamento: é o texto de uma pessoa
   * exibido como se fosse o de outra.
   */
  const requestId = useRef(0)
  const recordId = record?.id ?? null

  useEffect(() => {
    if (!open || !isLive || !recordId) return
    if (loaded?.recordId === recordId) return

    const current = ++requestId.current

    void (async () => {
      try {
        const result = await listRecordVersionsAction({ recordId })
        if (current !== requestId.current) return

        setLoaded(
          result.ok
            ? { recordId, versions: result.data, error: null }
            : { recordId, versions: [], error: result.error.message },
        )
      } catch {
        if (current !== requestId.current) return

        setLoaded({
          recordId,
          versions: [],
          error: recordMessages.versionsUnavailable,
        })
      }
    })()
  }, [open, isLive, recordId, loaded?.recordId])

  /** A cadeia deste registro — a de outro nunca é exibida. */
  const versions = loaded?.recordId === recordId ? loaded.versions : []
  const error = loaded?.recordId === recordId ? loaded.error : null
  const isLoading = isLive && recordId !== null && loaded?.recordId !== recordId

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          /*
           * Esquecer a cadeia ao fechar é deliberado: manter o texto clínico da
           * última consulta na memória do componente o deixaria pronto para
           * aparecer, por um instante, na próxima abertura — que pode ser de
           * outro paciente.
           */
          setLoaded(null)
        }
        onOpenChange(next)
      }}
      title="Histórico de versões"
      description={
        record
          ? `${recordTypeLabel(record.recordType)} · ${versions.length || record.version} versão(ões)`
          : undefined
      }
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-field border border-border-card bg-background px-3.5 py-2.5 text-label text-muted">
          Cada correção entra como uma versão nova. Nenhuma versão anterior é
          apagada ou alterada — as duas continuam assinadas por quem as escreveu.
        </p>

        {!isLive ? (
          <p role="status" className="text-aux text-muted">
            Modo demonstração: o histórico de versões exige banco configurado.
          </p>
        ) : isLoading ? (
          <p role="status" className="text-aux text-muted">
            Carregando as versões deste registro...
          </p>
        ) : error ? (
          <p
            role="alert"
            className="rounded-field border border-danger/30 bg-danger-surface px-3.5 py-2.5 text-aux text-danger"
          >
            {error}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {versions.map((version, index) => (
              <li
                key={version.id}
                className="flex flex-col gap-2 rounded-card border border-border-card p-3.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={index === 0 ? 'positive' : 'neutral'}>
                    {`Versão ${version.version}`}
                  </StatusBadge>

                  {/*
                    Qual delas vale HOJE, dito na tela.
                    A ordem da lista já responde, e contar com isso deixaria a
                    resposta na disposição visual — a primeira coisa que se perde
                    quando alguém lê a página com leitor de tela.
                  */}
                  {index === 0 ? (
                    <span className="text-label font-semibold text-foreground">
                      Versão vigente
                    </span>
                  ) : null}

                  <span className="text-label text-muted">
                    {version.authorName} ·{' '}
                    {formatShortDate(new Date(version.createdAt))} às{' '}
                    {formatTime(new Date(version.createdAt))}
                  </span>
                </div>

                <p className="text-aux leading-6 whitespace-pre-wrap text-foreground">
                  {version.content}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  )
}
