import Image from 'next/image'
import type { ReactNode } from 'react'

import { BrandMark } from '@/components/layout/BrandMark'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background lg:flex-row">
      <header className="flex items-center border-b border-border-card bg-surface/90 px-6 py-4 backdrop-blur-xl lg:hidden">
        <BrandMark size="sm" />
      </header>

      <div className="relative h-36 overflow-hidden lg:hidden">
        <Image
          src="/images/login-clinic.png"
          alt="Profissional de saúde em uma clínica moderna"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[65%_45%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,37,68,0.04),rgba(10,37,68,0.76))]" />
        <p className="absolute right-6 bottom-5 left-6 text-label font-semibold tracking-[0.08em] text-white uppercase">
          Tecnologia que cuida
        </p>
      </div>

      <aside className="relative hidden overflow-hidden bg-brand lg:flex lg:w-[42%] lg:shrink-0 lg:flex-col lg:justify-between lg:p-14">
        <Image
          src="/images/login-clinic.png"
          alt=""
          fill
          priority
          sizes="42vw"
          className="object-cover object-[66%_45%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(8,31,59,0.82),rgba(14,65,116,0.5)_46%,rgba(6,28,53,0.9))]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(153,220,255,0.3),transparent_34%)]" />

        <div className="relative z-10 flex items-center gap-2 text-label font-semibold tracking-[0.1em] text-white/75 uppercase">
          <span className="size-2 rounded-full bg-brand-accent shadow-[0_0_20px_rgba(169,215,189,0.9)]" />
          Plataforma de cuidado conectado
        </div>

        <div className="relative z-10 max-w-md">
          <p className="max-w-sm text-[2.55rem] leading-[1.08] font-semibold tracking-[-0.04em] text-white">
            Mais clareza para cuidar melhor.
          </p>
          <p className="mt-5 max-w-sm text-control leading-relaxed text-white/72">
            Agenda, pacientes e decisões da sua clínica em um só lugar — com a
            tranquilidade de uma rotina que flui.
          </p>
        </div>

        <div className="relative z-10">
          <BrandMark tone="light" />
        </div>
      </aside>

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
