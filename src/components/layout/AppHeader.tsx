'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bell, ChevronDown, Command, Menu, Search, UserRound } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils/cn'
import { signOutAction } from '@/modules/identity/actions/signOut.action'

import { BrandMark } from './BrandMark'

interface AppHeaderProps {
  userName: string
  userRole: string
  /** Clinica ativa da sessao. Ausente no modo de demonstracao local. */
  clinicName?: string
  /** Seletor de clinica (I-03), quando ha mais de um vinculo. */
  clinicSwitcher?: ReactNode
  onMenuClick: () => void
  /** Abre a paleta de comandos — o campo de busca e o gatilho dela. */
  onOpenCommands: () => void
}

const titles: Record<string, { title: string; description: string }> = {
  '/dashboard': { title: 'Dashboard', description: 'Visão geral da sua clínica' },
  '/agenda': { title: 'Agenda', description: 'Organize seus atendimentos' },
  '/pacientes': { title: 'Pacientes', description: 'Acompanhe sua base de pacientes' },
  '/atendimentos': { title: 'Atendimentos', description: 'Acompanhe a operação da clínica' },
  '/prontuarios': { title: 'Prontuários', description: 'Cuidado contínuo e protegido' },
  '/financeiro': { title: 'Financeiro', description: 'Clareza sobre receitas e despesas' },
  '/convenios': { title: 'Convênios', description: 'Operadoras e tabelas da clínica' },
  '/whatsapp': { title: 'WhatsApp', description: 'Converse com seus pacientes' },
  '/chat-ia': { title: 'Assistente Focuss', description: 'Inteligência aplicada à sua rotina' },
  '/automacoes': { title: 'Automações', description: 'Reduza tarefas repetitivas' },
  '/equipe': { title: 'Equipe', description: 'Gerencie profissionais e acessos' },
  '/relatorios': { title: 'Relatórios', description: 'Indicadores para decisões melhores' },
  '/configuracoes': { title: 'Configurações', description: 'Preferências do espaço' },
}

export function AppHeader({
  userName,
  userRole,
  clinicName,
  clinicSwitcher,
  onMenuClick,
  onOpenCommands,
}: AppHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const context =
    Object.entries(titles).find(([href]) => pathname.startsWith(href))?.[1] ??
    titles['/dashboard']

  return (
    <header className="sticky top-0 z-20 border-b border-border-card/80 bg-surface/88 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1680px] items-center gap-3 px-4 sm:px-6 lg:px-8 xl:px-10">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir menu de navegação"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-border-card text-muted transition-colors hover:bg-row-hover hover:text-foreground md:hidden"
        >
          <Menu aria-hidden className="size-[18px]" />
        </button>

        <div className="min-w-0 shrink-0">
          <div className="flex items-center gap-2 md:hidden">
            <BrandMark size="sm" />
          </div>
          <div className="hidden md:block">
            <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {context.title}
            </p>
            <p className="hidden truncate text-label text-muted lg:block">{context.description}</p>
          </div>
        </div>

        {/* Troca de clinica: so aparece com mais de um vinculo (I-03) */}
        {clinicSwitcher ? (
          <div className="hidden min-w-0 shrink md:block">{clinicSwitcher}</div>
        ) : null}

        {/*
          Era um `<input>` INERTE, com o texto "Buscar pacientes, agenda…".

          Campo que aceita digitação e não faz nada é pior que botão
          desabilitado: a pessoa digita, espera, e conclui que a busca não
          encontrou o paciente. Virou um botão — que é o que ele sempre foi — e
          abre a paleta de comandos. O texto também mudou: a paleta vai a telas
          e ações, não procura registros, e prometer o contrário reintroduziria
          o mesmo engano com outra roupa.
        */}
        <button
          type="button"
          onClick={onOpenCommands}
          aria-keyshortcuts="Control+K Meta+K"
          className="mx-auto hidden w-full max-w-[420px] items-center gap-2 rounded-xl border border-border-card bg-background px-3 text-left text-muted transition-colors hover:border-brand/45 hover:bg-surface focus-visible:border-focus focus-visible:shadow-focus focus-visible:outline-none sm:flex"
        >
          <Search aria-hidden className="size-4 shrink-0" />
          <span className="h-10 min-w-0 flex-1 content-center truncate text-aux">
            Ir para uma tela ou criar…
          </span>
          <kbd className="hidden items-center gap-1 rounded-md border border-border-card bg-surface px-1.5 py-0.5 text-[10px] text-muted lg:inline-flex">
            <Command aria-hidden className="size-3" /> K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-2">
          {/*
            O marcador de "há aviso não lido" saiu daqui.

            Ele era uma bolinha fixa no CSS — aparecia sempre, em toda tela, sem
            nenhum aviso por trás. Um indicador de alerta que nunca desliga
            ensina a pessoa a ignorá-lo, e é o primeiro que ela vai ignorar
            quando houver um de verdade.
          */}
          <button
            type="button"
            aria-label="Notificações: o sistema ainda não envia avisos automáticos"
            title="O sistema ainda não envia avisos automáticos"
            disabled
            className="relative inline-flex size-10 cursor-not-allowed items-center justify-center rounded-[10px] text-muted opacity-70"
          >
            <Bell aria-hidden className="size-[18px]" />
          </button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label="Abrir menu do perfil"
                className="group flex items-center gap-2 rounded-xl p-1 transition-colors hover:bg-row-hover"
              >
                <Avatar name={userName} size="sm" />
                <span className="hidden max-w-28 truncate text-label font-semibold text-foreground lg:block">
                  {userName}
                </span>
                <ChevronDown aria-hidden className="hidden size-3.5 text-muted transition-transform group-data-[state=open]:rotate-180 lg:block" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-52 rounded-xl border border-border-card bg-surface p-1.5 shadow-raised">
                <DropdownMenu.Label className="flex items-center gap-3 px-2.5 py-2">
                  <Avatar name={userName} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-aux font-semibold text-foreground">{userName}</span>
                    <span className="block truncate text-label text-muted">{userRole}</span>
                    {clinicName ? (
                      <span className="block truncate text-label text-muted">{clinicName}</span>
                    ) : null}
                  </span>
                </DropdownMenu.Label>
                <DropdownMenu.Separator className="my-1 h-px bg-border-card" />
                <DropdownMenu.Item
                  onSelect={() => router.push('/configuracoes')}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-aux text-foreground outline-none transition-colors data-[highlighted]:bg-row-hover"
                >
                  <UserRound aria-hidden className="size-4 text-muted" /> Perfil e configurações
                </DropdownMenu.Item>
                <form action={signOutAction}>
                  <SignOutButton />
                </form>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  )
}

function SignOutButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-aux text-danger outline-none transition-colors hover:bg-danger-surface disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      {pending ? 'Saindo...' : 'Sair da conta'}
    </button>
  )
}
