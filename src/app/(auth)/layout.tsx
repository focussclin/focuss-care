import type { ReactNode } from 'react'

import { BrandMark } from '@/components/layout/BrandMark'

/**
 * Casca das telas de autenticacao.
 * LOGIN_DESIGN.md "Estrutura": painel de marca com ~42% no desktop, escondido no
 * mobile, onde sobra apenas uma faixa superior discreta com o nome da marca.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background lg:flex-row">
      {/* Faixa superior — apenas mobile/tablet */}
      <header className="flex items-center border-b border-border-card bg-surface px-6 py-4 lg:hidden">
        <BrandMark size="sm" />
      </header>

      {/* Painel de marca — a partir de 1024px, ~42% da largura */}
      <aside className="relative hidden overflow-hidden bg-brand lg:flex lg:w-[42%] lg:shrink-0 lg:flex-col lg:justify-between lg:p-14">
        <BrandComposition />

        <div className="relative z-10" />

        <div className="relative z-10 max-w-md">
          <p className="text-[2.125rem] leading-[1.2] font-semibold tracking-[-0.015em] text-white">
            Cuidar de quem cuida.
          </p>
          <p className="mt-5 text-control leading-relaxed text-white/70">
            Um espaço simples para acompanhar sua rotina de cuidado com mais
            clareza e tranquilidade.
          </p>
        </div>

        <div className="relative z-10">
          <BrandMark tone="light" />
        </div>
      </aside>

      {/* Area do formulario */}
      <main className="flex flex-1 items-center justify-center px-6 py-10 md:px-12 lg:px-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 hidden lg:block">
            <BrandMark size="sm" />
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

/**
 * Composicao abstrata do painel: circulos organicos e linhas suaves em verde mais
 * claro, com bastante espaco negativo. Sem banco de imagens, conforme handoff.
 */
function BrandComposition() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
      viewBox="0 0 600 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="fc-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#A9D7BD" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#A9D7BD" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="470" cy="180" r="260" fill="url(#fc-glow)" />
      <circle
        cx="470"
        cy="180"
        r="150"
        fill="none"
        stroke="#A9D7BD"
        strokeOpacity="0.22"
      />
      <circle
        cx="470"
        cy="180"
        r="220"
        fill="none"
        stroke="#A9D7BD"
        strokeOpacity="0.12"
      />
      <circle cx="120" cy="700" r="180" fill="url(#fc-glow)" />
      <circle
        cx="120"
        cy="700"
        r="110"
        fill="none"
        stroke="#A9D7BD"
        strokeOpacity="0.16"
      />
      <path
        d="M-40 520 C 160 440, 300 600, 520 500"
        fill="none"
        stroke="#A9D7BD"
        strokeOpacity="0.18"
        strokeWidth="1.5"
      />
      <path
        d="M-40 570 C 180 500, 320 650, 560 560"
        fill="none"
        stroke="#A9D7BD"
        strokeOpacity="0.1"
        strokeWidth="1.5"
      />
    </svg>
  )
}
