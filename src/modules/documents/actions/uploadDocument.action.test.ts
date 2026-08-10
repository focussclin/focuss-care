import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O upload de documento de paciente, pelo pipeline real.
 *
 * **Não há banco, nem rede, nem Storage.** É a action mais sensível do módulo:
 * ela constrói um caminho de arquivo a partir de um nome que o usuário escolheu,
 * grava dado de paciente e mexe em dois sistemas que podem falhar
 * separadamente.
 *
 * Os três grupos abaixo cobrem, nesta ordem de importância:
 *
 *  1. **O caminho começa pela clínica da sessão** — é o primeiro segmento que
 *     a policy do Storage compara (`(storage.foldername(name))[1]`). Um caminho
 *     montado com id vindo da entrada colocaria o arquivo na pasta de outra
 *     clínica.
 *  2. **Nome de arquivo não escapa da pasta** — `../` num nome é a forma
 *     clássica de escrever fora do prefixo do tenant.
 *  3. **Objeto órfão é removido** — o arquivo sobe antes da linha existir; se a
 *     linha falhar, sobra um documento de paciente no bucket sem nada que o
 *     explique nem o alcance.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const PATIENT = '11111111-1111-4111-8111-111111111111'

vi.mock('next/cache', () => ({
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    void callback()
  },
}))

vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))

const sessionState = vi.fn()
vi.mock('@/lib/auth/session', () => ({
  getSessionState: () => sessionState(),
}))

const recordAuditEvent = vi.fn(
  async (event: unknown): Promise<{ recorded: false; reason: string }> => {
    void event
    return { recorded: false, reason: 'test' }
  },
)
vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: (event: unknown) => recordAuditEvent(event),
}))

const create = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  documentRepositoryFor: () => ({ create }),
}))

/** Estado do duplo de Supabase, reconfigurado a cada teste. */
const state = {
  patient: { id: PATIENT } as { id: string } | null,
  patientError: null as { message: string } | null,
  uploadError: null as { message: string } | null,
}

/*
 * Os parâmetros são declarados mesmo sem uso no corpo.
 *
 * `vi.fn(async () => …)` tipa `mock.calls` como tupla VAZIA, e ler
 * `calls[0][0]` não compila — ainda que o teste passe em runtime. O caminho do
 * arquivo é justamente o que se observa aqui, então ele precisa existir no
 * tipo.
 */
const upload = vi.fn(async (path: string, file: unknown, options?: unknown) => {
  void path
  void file
  void options
  return { error: state.uploadError }
})

const remove = vi.fn(async (paths: string[]) => {
  void paths
  return { error: null }
})

const supabase = {
  from: () => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq']) {
      builder[method] = () => builder
    }
    builder.maybeSingle = async () => ({
      data: state.patientError ? null : state.patient,
      error: state.patientError,
    })
    return builder
  },
  storage: { from: () => ({ upload, remove }) },
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => supabase,
}))

const { uploadDocumentAction } = await import('./uploadDocument.action')
const { documentMessages } = await import('../schemas/document.schema')
const { DocumentRepositoryError } = await import(
  '../domain/DocumentRepositoryError'
)

function activeSession(role: string | null = 'receptionist') {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId: CLINIC,
    clinicName: null,
    role,
  }
}

function formData(overrides: { name?: string; patientId?: string } = {}) {
  const data = new FormData()
  data.set('patientId', overrides.patientId ?? PATIENT)
  data.set('kind', 'rg')
  data.set(
    'file',
    new File(['conteudo'], overrides.name ?? 'documento.pdf', {
      type: 'application/pdf',
    }),
  )
  return data
}

function uploadedPath(): string {
  return String(upload.mock.calls[0]?.[0])
}

beforeEach(() => {
  vi.clearAllMocks()
  state.patient = { id: PATIENT }
  state.patientError = null
  state.uploadError = null
  sessionState.mockResolvedValue(activeSession())
  create.mockResolvedValue({
    id: 'doc-1',
    patientId: PATIENT,
    kind: 'rg',
    storagePath: 'x',
    fileName: 'documento.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 8,
    createdAt: new Date('2026-08-10T12:00:00.000Z'),
  })
})

describe('o caminho do arquivo', () => {
  it('começa pela clínica da SESSÃO', async () => {
    /*
     * A policy do Storage compara `(storage.foldername(name))[1]` com
     * `current_clinic_id()`. O primeiro segmento não é organização: é a
     * fronteira do tenant.
     */
    await uploadDocumentAction(formData())

    expect(uploadedPath().startsWith(`${CLINIC}/`)).toBe(true)
  })

  it('o paciente vem da entrada, mas é conferido na clínica da sessão', async () => {
    // A action consulta `patients` filtrando por `clinic_id` antes de subir
    // qualquer coisa — id de paciente de outra clínica não passa.
    state.patient = null

    const result = await uploadDocumentAction(formData())

    expect(result.ok).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it('nome com ../ não escapa da pasta do tenant', async () => {
    /*
     * A forma clássica de escrever fora do prefixo. `sanitizeFileName` troca
     * `/` e `\` por `-` e mantém só letras, números, ponto, hífen e sublinhado
     * — e o UUID na frente garante que o nome nunca é o começo do segmento.
     */
    await uploadDocumentAction(formData({ name: '../../../etc/passwd' }))

    const path = uploadedPath()

    expect(path).not.toContain('..')
    expect(path.split('/')).toHaveLength(3)
    expect(path.startsWith(`${CLINIC}/${PATIENT}/`)).toBe(true)
  })

  it('nome só de caracteres proibidos vira "documento"', async () => {
    // Sem o fallback, o caminho terminaria em `<uuid>-` e o objeto ficaria sem
    // nome nenhum na listagem do bucket.
    await uploadDocumentAction(formData({ name: '///' }))

    expect(uploadedPath().endsWith('documento')).toBe(true)
  })

  it('dois envios do mesmo nome não colidem', async () => {
    /*
     * `upsert: false` recusaria o segundo. O UUID no caminho é o que permite a
     * pessoa mandar "rg.pdf" duas vezes — frente e verso — sem que o segundo
     * sobrescreva ou falhe.
     */
    await uploadDocumentAction(formData())
    const first = uploadedPath()

    upload.mockClear()
    await uploadDocumentAction(formData())

    expect(String(upload.mock.calls[0]?.[0])).not.toBe(first)
  })
})

describe('objeto órfão', () => {
  it('a falha ao gravar a linha REMOVE o arquivo', async () => {
    /*
     * O arquivo sobe antes de a linha existir. Sem esta limpeza, sobra um
     * documento de paciente no bucket que nenhuma linha explica — e que nenhuma
     * tela alcança para apagar depois.
     */
    create.mockRejectedValue(
      new DocumentRepositoryError('schema-not-ready', 'tabela ausente'),
    )

    const result = await uploadDocumentAction(formData())

    expect(result.ok).toBe(false)
    expect(remove).toHaveBeenCalledWith([uploadedPath()])
  })

  it('sucesso não remove nada', async () => {
    await uploadDocumentAction(formData())

    expect(remove).not.toHaveBeenCalled()
  })
})

describe('recusas', () => {
  it('bucket ausente diz que é configuração, e não erro genérico', async () => {
    /*
     * `storagePending` manda aplicar a migration/criar o bucket;
     * `unavailable` mandaria tentar de novo, para sempre, sobre um problema que
     * nenhuma tentativa resolve.
     */
    state.uploadError = { message: 'Bucket not found' }

    const result = await uploadDocumentAction(formData())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(documentMessages.storagePending)
    }
  })

  it('papel sem patient.write não envia', async () => {
    // `finance` lê paciente para faturar e não escreve na ficha dele.
    sessionState.mockResolvedValue(activeSession('finance'))

    const result = await uploadDocumentAction(formData())

    expect(result.ok).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it('id de paciente malformado nem chega ao Storage', async () => {
    const result = await uploadDocumentAction(
      formData({ patientId: 'paciente-1' }),
    )

    expect(result.ok).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it('clinicId na entrada é ignorado', async () => {
    /*
     * P3. O `FormData` pode carregar o que quiser; o schema só lê três chaves,
     * e a clínica sai do `ActionContext`.
     */
    const data = formData()
    data.set('clinicId', OTHER_CLINIC)

    await uploadDocumentAction(data)

    expect(uploadedPath().startsWith(`${CLINIC}/`)).toBe(true)
  })
})

describe('auditoria', () => {
  it('registra o envio sem o nome do arquivo', async () => {
    /*
     * O nome é escolhido por quem envia e costuma trazer o nome do paciente
     * ("rg-maria-silva.pdf"). A trilha é lida por mais gente do que quem
     * enviou: tipo, MIME e tamanho bastam para saber o que houve.
     */
    await uploadDocumentAction(formData({ name: 'rg-maria-silva.pdf' }))

    const evento = recordAuditEvent.mock.calls[0][0] as unknown as {
      action: string
      after: Record<string, unknown>
    }

    expect(evento.action).toBe('patient_document.uploaded')
    expect(JSON.stringify(evento.after)).not.toContain('maria')
  })
})
