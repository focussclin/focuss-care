'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Rede de segurança de TODA a área autenticada.
 *
 * # O que existia antes
 *
 * Dois `error.tsx`, em `/agenda` e `/pacientes`. As outras vinte e cinco rotas
 * não tinham nenhum: uma exceção em qualquer uma subia até a borda do Next e,
 * em produção, virava a página de erro genérica do framework — sem menu, sem
 * cabeçalho, sem caminho de volta. A pessoa perde a sessão de vista e o
 * reflexo é fechar a aba.
 *
 * Este arquivo fica DENTRO de `(app)`, e é por isso que a casca sobrevive: a
 * sidebar e o cabeçalho continuam na tela, e o erro ocupa só o conteúdo. Quem
 * quiser ir para outro lugar consegue, sem recarregar nada.
 *
 * Os dois específicos continuam onde estão. O boundary mais próximo vence, e
 * "não foi possível carregar a agenda" diz mais que "algo deu errado".
 *
 * # `retry`, e não `reset`
 *
 * Esta versão do Next passa as duas. `reset()` limpa o estado de erro e
 * re-renderiza os filhos **sem refazer o fetch** — e como o que falha aqui é
 * leitura de servidor, ele reexibiria o mesmo erro imediatamente: um botão que
 * promete recuperação e não pode entregar. `retry()` refaz a busca.
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md,
 * §`retry`: "In most cases, you should use retry() instead".)
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    /*
     * `digest` é o que liga esta tela ao log do servidor.
     *
     * Em produção o Next NÃO manda a mensagem original para o cliente, de
     * propósito — ela poderia carregar dado de paciente. O que atravessa é o
     * identificador, e sem registrá-lo aqui não há como cruzar "deu erro às
     * 14h" com a linha correspondente no servidor.
     */
    console.error('[app] render interrompido', {
      digest: error.digest,
      name: error.name,
    })
  }, [error])

  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title="Não foi possível carregar esta tela."
        description="O erro foi registrado. Tente de novo em instantes — se continuar, use o menu para seguir por outro caminho."
        action={<Button onClick={retry}>Tentar novamente</Button>}
      />
    </Card>
  )
}
