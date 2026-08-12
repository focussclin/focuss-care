'use client'

import { CheckCircle2, Loader2, QrCode, RefreshCw, Unplug } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'

import {
  connectWhatsappAction,
  disconnectWhatsappAction,
  whatsappStatusAction,
} from '../actions/whatsappConnection.action'
import {
  whatsappConnectionMessages,
  type WhatsappConnectionDto,
} from '../schemas/whatsappConnection.schema'

export interface WhatsappConnectionPanelProps {
  /** Estado inicial, resolvido pela rota. Evita a tela abrir em branco. */
  initial: WhatsappConnectionDto
  /** Papel da sessão pode configurar a clínica? */
  canManage: boolean
  isLive?: boolean
}

/** De quanto em quanto tempo a tela pergunta se alguém já leu o QR. */
const POLL_MS = 3000

/**
 * O QR expira no provedor em poucos dezenas de segundos. Depois disso a leitura
 * falha em silêncio — a câmera lê e nada acontece —, então a tela para de
 * mostrá-lo e oferece gerar outro em vez de deixar um código morto na parede.
 */
const QR_LIFETIME_MS = 60_000

/**
 * Conexão do WhatsApp por QR code (Evolution API).
 *
 * # O QR aparece, é lido e some — nesta ordem
 *
 * Ele não é guardado em lugar nenhum: nasce na resposta da action, vive no
 * estado deste componente e desaparece quando o pareamento acontece ou quando
 * expira. Quem fotografa o código conecta o WhatsApp da clínica, então tratá-lo
 * como imagem qualquer seria tratar uma credencial como enfeite.
 */
export function WhatsappConnectionPanel({
  initial,
  canManage,
  isLive = false,
}: WhatsappConnectionPanelProps) {
  const [connection, setConnection] = useState<WhatsappConnectionDto>(initial)
  const [isWorking, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrShownAt, setQrShownAt] = useState<number | null>(null)

  const isAwaiting = connection.state === 'awaiting_scan'
  const isConnected = connection.state === 'connected'

  /*
   * Enquanto há QR na tela, pergunta ao servidor se o pareamento aconteceu.
   *
   * O provedor não avisa ninguém: quem descobre que a leitura funcionou é quem
   * pergunta. Sem isto, a pessoa leria o código e ficaria olhando para uma tela
   * que continua dizendo "aguardando" até recarregar.
   */
  const pollingRef = useRef(false)

  useEffect(() => {
    if (!isLive || !isAwaiting || !canManage) return

    let cancelled = false

    const timer = setInterval(async () => {
      // Uma volta por vez: um servidor lento não pode acumular consultas.
      if (pollingRef.current) return
      pollingRef.current = true

      try {
        const result = await whatsappStatusAction()
        if (cancelled) return

        if (result.ok && result.data.state !== 'awaiting_scan') {
          // Só troca quando SAIU de "aguardando": manter o QR na tela é o certo
          // enquanto nada mudou, e a resposta de status não traz código novo.
          setConnection(result.data)
          setQrShownAt(null)
        }
      } catch {
        // Falha de rede no polling não vira erro na tela: o QR continua válido
        // e a próxima volta resolve.
      } finally {
        pollingRef.current = false
      }
    }, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isLive, isAwaiting, canManage])

  /**
   * O código expirou enquanto ninguém leu.
   *
   * Guarda QUAL código expirou, não um booleano — e a diferença é o que elimina
   * o `setState` de reset no corpo do efeito (proibido por
   * `react-hooks/set-state-in-effect`, com razão: sincronizar estado ali é
   * renderizar duas vezes para chegar onde uma derivação chega direto).
   *
   * Quando um código novo entra, `qrShownAt` muda e a marca antiga deixa de
   * casar sozinha: o aviso de expirado some sem ninguém apagá-lo.
   */
  const [expiredQrAt, setExpiredQrAt] = useState<number | null>(null)
  const expired = qrShownAt !== null && expiredQrAt === qrShownAt

  useEffect(() => {
    if (!qrShownAt) return

    const timer = setTimeout(() => setExpiredQrAt(qrShownAt), QR_LIFETIME_MS)
    return () => clearTimeout(timer)
  }, [qrShownAt])

  async function run(
    action: () => Promise<
      | { ok: true; data: WhatsappConnectionDto }
      | { ok: false; error: { message: string } }
    >,
  ) {
    setWorking(true)
    setError(null)

    try {
      const result = await action()

      if (!result.ok) {
        setError(result.error.message)
        return
      }

      setConnection(result.data)
      setQrShownAt(result.data.qrCode ? Date.now() : null)
    } catch {
      setError(whatsappConnectionMessages.unavailable)
    } finally {
      setWorking(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-aux font-semibold text-foreground">
            Conexão do aparelho
          </h2>
          <p className="mt-1 text-label text-muted">
            Pareie o WhatsApp da clínica lendo o código com o aplicativo do
            celular, em Aparelhos conectados.
          </p>
        </div>

        <StatusBadge tone={isConnected ? 'positive' : isAwaiting ? 'pending' : 'neutral'}>
          {isConnected ? 'Conectado' : isAwaiting ? 'Aguardando leitura' : 'Desconectado'}
        </StatusBadge>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-field border border-danger/30 bg-danger-surface px-3.5 py-2.5 text-aux text-danger"
        >
          {error}
        </p>
      ) : null}

      {!canManage ? (
        <p className="rounded-field border border-border-card bg-background px-3.5 py-2.5 text-label text-muted">
          Seu perfil permite ver o estado do canal, mas não conectá-lo. Conectar
          o WhatsApp muda o número que responde por toda a clínica.
        </p>
      ) : null}

      {isConnected ? (
        <p className="flex items-center gap-2 text-aux text-foreground">
          <CheckCircle2 aria-hidden className="size-4 text-success" />
          {connection.phoneNumber
            ? `Pareado com o número •••• ${connection.phoneNumber.slice(-4)}.`
            : 'Canal pareado e ativo.'}
        </p>
      ) : null}

      {/*
        O código só aparece enquanto vale. Depois de expirar, o lugar dele é
        ocupado pelo convite a gerar outro — um QR morto na tela faz a pessoa
        tentar de novo e concluir que o produto está quebrado.
      */}
      {isAwaiting && connection.qrCode && !expired ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-border-card bg-surface p-5">
          <Image
            src={connection.qrCode}
            alt="QR code para conectar o WhatsApp da clínica"
            width={264}
            height={264}
            unoptimized
            className="size-[264px] rounded-field bg-white p-2"
          />
          <p className="text-center text-label text-muted">
            No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.
          </p>
        </div>
      ) : null}

      {isAwaiting && expired ? (
        <p
          role="status"
          className="rounded-field border border-border-card bg-background px-3.5 py-2.5 text-aux text-muted"
        >
          O código expirou sem ser lido. Gere outro para continuar.
        </p>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {isConnected ? (
            <Button
              variant="secondary"
              onClick={() => run(disconnectWhatsappAction)}
              isLoading={isWorking}
              disabled={!isLive}
            >
              <Unplug aria-hidden className="size-4" />
              Desconectar
            </Button>
          ) : (
            <Button
              onClick={() => run(connectWhatsappAction)}
              isLoading={isWorking}
              disabled={!isLive}
              title={
                isLive ? undefined : 'Modo demonstração: conectar exige banco configurado.'
              }
            >
              {isAwaiting ? (
                <RefreshCw aria-hidden className="size-4" />
              ) : (
                <QrCode aria-hidden className="size-4" />
              )}
              {isAwaiting ? 'Gerar outro código' : 'Conectar WhatsApp'}
            </Button>
          )}

          {isAwaiting && !isWorking ? (
            <span className="flex items-center gap-2 text-label text-muted">
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
              Verificando a leitura...
            </span>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
