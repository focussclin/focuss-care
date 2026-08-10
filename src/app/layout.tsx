import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import { SessionRefresh } from '@/components/auth/SessionRefresh'

import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: 'Focuss Care',
    template: '%s · Focuss Care',
  },
  description:
    'Gestão inteligente para clínicas: agenda, pacientes, prontuários e financeiro em um só lugar.',
  applicationName: 'Focuss Care',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <SessionRefresh />
        {children}
      </body>
    </html>
  )
}
