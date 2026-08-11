import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A política de duplicidade de CPF.
 *
 * É a segunda das duas condições que o grupo documental exigia para existir — a
 * primeira é a validação de dígito, em `domain/PatientDocuments.ts`. Sem ela, o
 * produto passaria a guardar identificador fiscal sem nada que impedisse a mesma
 * pessoa de virar dois cadastros.
 *
 * **Não há banco, nem rede, nem Next em runtime.**
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const PATIENT = '9019956f-bdd8-4d61-868d-09b02332dad0'
const OTHER = '11111111-1111-4111-8111-111111111111'

vi.mock('next/cache', () => ({ updateTag: () => {}, revalidatePath: () => {} }))
vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    void callback()
  },
}))
vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))

const sessionState = vi.fn()
vi.mock('@/lib/auth/session', () => ({ getSessionState: () => sessionState() }))

const supabase = { __fake: true }
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => supabase,
}))

vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: async () => ({ recorded: false, reason: 'test' }),
}))

const create = vi.fn()
const update = vi.fn()
const findById = vi.fn()
const findCpfOwner = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  patientRepositoryFor: () => ({ create, update, findById, findCpfOwner }),
}))

const { createPatientAction } = await import('./createPatient.action')
const { updatePatientAction } = await import('./updatePatient.action')
const { createPatientMessages } = await import('../schemas/patient.schema')

function patient(overrides: Record<string, unknown> = {}) {
  return {
    id: PATIENT,
    name: 'Maria Souza',
    socialName: null,
    email: '',
    phone: '(11) 98812-4471',
    phoneAlt: '',
    biologicalSex: 'not_informed' as const,
    genderIdentity: null,
    emergencyContact: null,
    emergencyContactUnreadable: false,
    birthDate: null,
    cpf: null,
    cns: null,
    address: null,
    addressUnreadable: false,
    contactPreference: undefined,
    adminNotes: null,
    status: 'active' as const,
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    lastVisitAt: null,
    nextVisitAt: null,
    ...overrides,
  }
}

function session(role: string | null = 'receptionist') {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId: CLINIC,
    clinicName: null,
    role,
  }
}

const input = {
  name: 'Maria Souza',
  phone: '(11) 98812-4471',
  cpf: '529.982.247-25',
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(session())
  findCpfOwner.mockResolvedValue(null)
  findById.mockResolvedValue(patient())
  create.mockResolvedValue(patient({ cpf: '52998224725' }))
  update.mockResolvedValue(patient({ cpf: '52998224725' }))
})

describe('cadastro', () => {
  it('confere o CPF na clínica ATIVA antes de gravar', () => {
    return createPatientAction(input).then(() => {
      // A clínica sai do `ActionContext`; o CPF vai em dígitos, que é a forma
      // com que a coluna é comparada.
      expect(findCpfOwner).toHaveBeenCalledWith(CLINIC, '52998224725', null)
    })
  })

  it('CPF de outro paciente recusa a gravação e NOMEIA quem', async () => {
    /*
     * Duplicidade de CPF quase sempre é a mesma pessoa cadastrada duas vezes, e
     * o que resolve é continuar na ficha que já existe. "CPF já cadastrado"
     * mandaria procurar sem dizer onde.
     */
    findCpfOwner.mockResolvedValue({ id: OTHER, name: 'Maria S. Souza' })

    const result = await createPatientAction(input)

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
    if (!result.ok) {
      expect(result.error.code).toBe('conflict')
      expect(result.error.message).toContain('Maria S. Souza')
      // O erro precisa aparecer NO CAMPO: um aviso solto no topo nunca é
      // associado ao input por leitor de tela.
      expect(result.error.fieldErrors?.cpf).toBe(
        createPatientMessages.cpfTaken('Maria S. Souza'),
      )
    }
  })

  it('sem CPF informado, nada é consultado', async () => {
    // Cadastro de balcão continua sendo nome e telefone.
    const result = await createPatientAction({
      name: 'Maria Souza',
      phone: '(11) 98812-4471',
    })

    expect(result.ok).toBe(true)
    expect(findCpfOwner).not.toHaveBeenCalled()
  })

  it('CPF inválido nem chega à consulta de duplicidade', async () => {
    const result = await createPatientAction({ ...input, cpf: '529.982.247-26' })

    expect(result.ok).toBe(false)
    expect(findCpfOwner).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('edição', () => {
  const editInput = { ...input, patientId: PATIENT }

  it('exclui o PRÓPRIO paciente da conferência', async () => {
    /*
     * Salvar a ficha sem mexer no CPF acusaria conflito consigo mesma — e o
     * conflito apareceria justamente em quem já estava certo.
     */
    await updatePatientAction(editInput)

    expect(findCpfOwner).toHaveBeenCalledWith(CLINIC, '52998224725', PATIENT)
  })

  it('CPF de outro paciente recusa a edição', async () => {
    findCpfOwner.mockResolvedValue({ id: OTHER, name: 'Maria S. Souza' })

    const result = await updatePatientAction(editInput)

    expect(result.ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
    if (!result.ok) {
      expect(result.error.fieldErrors?.cpf).toContain('Maria S. Souza')
    }
  })

  it('paciente inexistente responde not-found antes de conferir CPF', async () => {
    // Paciente de outra clínica e paciente inexistente dão no mesmo: a resposta
    // não pode revelar que o id existe em outro tenant.
    findById.mockResolvedValue(null)

    const result = await updatePatientAction(editInput)

    expect(result.ok).toBe(false)
    expect(findCpfOwner).not.toHaveBeenCalled()
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })

  it('apagar o CPF não consulta duplicidade', async () => {
    const result = await updatePatientAction({ ...editInput, cpf: '' })

    expect(result.ok).toBe(true)
    expect(findCpfOwner).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(
      CLINIC,
      PATIENT,
      expect.objectContaining({ cpf: null }),
    )
  })
})

describe('o que chega ao repositório', () => {
  it('CPF, CNS e endereço em forma canônica', async () => {
    await createPatientAction({
      ...input,
      cns: '123 4567 8901 0000',
      addressZip: '01310-930',
      addressStreet: 'Avenida Paulista',
      addressNumber: '1578',
      addressDistrict: 'Bela Vista',
      addressCity: 'São Paulo',
      addressState: 'sp',
    })

    expect(create).toHaveBeenCalledWith(
      CLINIC,
      expect.objectContaining({
        cpf: '52998224725',
        cns: '123456789010000',
        address: {
          zip: '01310930',
          street: 'Avenida Paulista',
          number: '1578',
          complement: null,
          district: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
        },
      }),
      USER,
    )
  })

  it('sem endereço, o objeto inteiro é null — e não um objeto de nulos', async () => {
    // `null` é o que o adapter traduz para `{}` na coluna NOT NULL; um objeto de
    // sete nulos gravaria "endereço em branco" como se fosse endereço.
    await createPatientAction(input)

    expect(create).toHaveBeenCalledWith(
      CLINIC,
      expect.objectContaining({ address: null }),
      USER,
    )
  })
})
