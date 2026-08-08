import { Bell } from 'lucide-react'

/**
 * O sino de notificações — desligado, e agora sem afirmar nada falso.
 *
 * # O que estava errado
 *
 * Ele recebia `count={snapshot.waitingNow}` — o número de pacientes na fila — e
 * o anunciava como **"Notificações: 3 não lidas"**. Três pessoas esperando na
 * recepção não são três avisos por ler: é outro dado, com outro significado, e
 * o leitor de tela lia a frase errada. O mesmo número já aparece, corretamente
 * rotulado, no cartão "Pacientes aguardando" logo abaixo.
 *
 * # E por que não diz mais "em breve"
 *
 * Nenhum caminho do sistema envia notificação, e nenhuma fatia do roadmap está
 * construindo isso. "Em breve" afirmava um cronograma que não existe — o mesmo
 * defeito que fez `/pagamentos` e `/caixa` prometerem recursos já entregues.
 * O texto agora diz o estado, sem prometer data.
 *
 * O botão continua aqui, e desabilitado, porque o lugar dele no cabeçalho é
 * decisão de desenho — o que não pode é ele mentir enquanto espera.
 */
export function NotificationBell() {
  return (
    <button
      type="button"
      aria-label="Notificações: o sistema ainda não envia avisos automáticos"
      title="O sistema ainda não envia avisos automáticos"
      disabled
      className="relative inline-flex size-11 cursor-not-allowed items-center justify-center rounded-field border border-border-card bg-surface text-muted opacity-75"
    >
      <Bell aria-hidden className="size-[18px]" strokeWidth={1.75} />
    </button>
  )
}
