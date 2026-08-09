// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DocumentDto } from '../schemas/document.schema'
import { DocumentsScreen } from './DocumentsScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const patient = { id: '00000000-0000-4000-8000-000000000001', name: 'Maria Silva' }
const documentItem: DocumentDto = {
  id: '00000000-0000-4000-8000-000000000002',
  patientId: patient.id,
  patientName: patient.name,
  kind: 'consent_form',
  fileName: 'termo-consentimento.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  createdAt: '2026-08-09T10:00:00.000Z',
}

afterEach(cleanup)

function renderScreen(
  overrides: Partial<React.ComponentProps<typeof DocumentsScreen>> = {},
) {
  return render(
    <DocumentsScreen
      documents={[]}
      patients={[patient]}
      onUpload={vi.fn().mockResolvedValue(null)}
      onDownload={vi.fn().mockResolvedValue({ url: null, error: null })}
      isLive
      storageReady
      referenceDate="2026-08-09T12:00:00.000Z"
      {...overrides}
    />,
  )
}

describe('DocumentsScreen', () => {
  it('não fabrica arquivos no modo demonstração', () => {
    renderScreen({ isLive: false, storageReady: false })

    expect(screen.getByText('Nenhum documento enviado')).toBeTruthy()
    expect(screen.getByText(/documentos pessoais não são simulados/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /enviar documento/i }).hasAttribute('disabled')).toBe(true)
  })

  it('filtra documentos pelo paciente e permite download assinado', async () => {
    const onDownload = vi.fn().mockResolvedValue({ url: 'https://storage.test/signed', error: null })
    vi.spyOn(window, 'open').mockImplementation(() => null)
    renderScreen({ documents: [documentItem], onDownload })

    expect(screen.getByText('termo-consentimento.pdf')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /baixar/i }))

    await waitFor(() => expect(onDownload).toHaveBeenCalledWith(documentItem.id))
  })

  it('envia o FormData do formulário quando o Storage está pronto', async () => {
    const onUpload = vi.fn().mockResolvedValue(null)
    renderScreen({ onUpload })

    fireEvent.click(screen.getByRole('button', { name: /enviar documento/i }))
    fireEvent.change(screen.getAllByLabelText('Paciente')[1], { target: { value: patient.id } })
    const fileInput = document.getElementById('document-file')
    expect(fileInput).toBeTruthy()
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [new File(['arquivo'], 'rg.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.submit(document.getElementById('document-upload') as HTMLFormElement)

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(expect.any(FormData)))
  })
})
