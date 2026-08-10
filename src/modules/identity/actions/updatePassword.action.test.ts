import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A gravação da nova senha (P-RS), pela Server Action real.
 *
 * **Não há Supabase, nem rede.** O cliente é um mock, como em
 * `patientConsent.action.test.ts`. O que se verifica:
 *
 *  - a sessão é VALIDADA no servidor antes de gravar (`getUser`, não `getSession`);
 *  - senha fraca não chega ao provedor;
 *  - a sessão é encerrada depois da troca, sempre;
 *  - nenhuma mensagem do provedor chega à tela, e o log não carrega a senha.
 */

const getUser = vi.fn()
const updateUser = vi.fn()
const signOut = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: () => getUser(),
      updateUser: (attrs: unknown) => updateUser(attrs),
      signOut: () => signOut(),
    },
  }),
}))

const { updatePasswordAction } = await import('./updatePassword.action')
const { passwordRecoveryMessages } = await import(
  '../schemas/passwordRecovery.schema'
)

const VALID = { password: 'clinica2026', passwordConfirmation: 'clinica2026' }

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'maria@exemplo.com' } },
    error: null,
  })
  updateUser.mockResolvedValue({ data: {}, error: null })
  signOut.mockResolvedValue({ error: null })
})

// ---------------------------------------------------------------------------

describe('caminho feliz', () => {
  it('grava a senha e encerra a sessão do link', async () => {
    const result = await updatePasswordAction(VALID)

    expect(result.ok).toBe(true)
    expect(updateUser).toHaveBeenCalledWith({ password: 'clinica2026' })
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('valida a sessão no servidor ANTES de gravar', async () => {
    await updatePasswordAction(VALID)

    // getUser pergunta ao servidor de auth; getSession só leria o cookie — e o
    // cookie é o que o atacante tem.
    expect(getUser).toHaveBeenCalledTimes(1)
    expect(getUser.mock.invocationCallOrder[0]).toBeLessThan(
      updateUser.mock.invocationCallOrder[0],
    )
  })
})

describe('sem sessão válida', () => {
  it.each([
    ['sem usuário', { data: { user: null }, error: null }],
    ['token recusado', { data: null, error: { message: 'invalid jwt' } }],
  ])('não grava quando %s', async (_label, response) => {
    getUser.mockResolvedValue(response)

    const result = await updatePasswordAction(VALID)

    expect(result.ok).toBe(false)
    expect(result.sessionExpired).toBe(true)
    expect(result.error).toBe(passwordRecoveryMessages.linkInvalid)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('trata 401 do provedor como link vencido, não como erro genérico', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    updateUser.mockResolvedValue({
      data: null,
      error: { status: 401, code: 'unauthorized', message: 'JWT expired' },
    })

    const result = await updatePasswordAction(VALID)

    expect(result.sessionExpired).toBe(true)
    expect(result.error).toBe(passwordRecoveryMessages.linkInvalid)
    expect(signOut).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('validação antes de chegar ao provedor', () => {
  it.each([
    ['curta', { password: 'abc1', passwordConfirmation: 'abc1' }],
    ['sem número', { password: 'clinicasegura', passwordConfirmation: 'clinicasegura' }],
    ['diferentes', { password: 'clinica2026', passwordConfirmation: 'clinica2027' }],
  ])('recusa senha %s sem chamar o provedor', async (_label, input) => {
    const result = await updatePasswordAction(input)

    expect(result.ok).toBe(false)
    expect(updateUser).not.toHaveBeenCalled()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('devolve o erro no campo que a pessoa vai corrigir', async () => {
    const result = await updatePasswordAction({
      password: 'clinica2026',
      passwordConfirmation: 'clinica2027',
    })

    expect(result.fieldErrors?.passwordConfirmation).toBe(
      passwordRecoveryMessages.confirmationMismatch,
    )
    expect(result.fieldErrors?.password).toBeUndefined()
  })

  it('não confia na validação do cliente: o servidor revalida a mesma entrada', async () => {
    // A tela já barra isto com o mesmo schema. A action barra de novo, porque a
    // do cliente roda em código que o usuário controla.
    const result = await updatePasswordAction({
      password: '1234',
      passwordConfirmation: '1234',
    })

    expect(result.ok).toBe(false)
  })
})

describe('recusa do provedor', () => {
  it('traduz senha repetida para a frase da tela', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    updateUser.mockResolvedValue({
      data: null,
      error: {
        status: 422,
        code: 'same_password',
        message: 'New password should be different from the old password.',
      },
    })

    const result = await updatePasswordAction(VALID)

    expect(result.ok).toBe(false)
    expect(result.error).toBe(passwordRecoveryMessages.sameAsPrevious)
    expect(result.fieldErrors?.password).toBe(
      passwordRecoveryMessages.sameAsPrevious,
    )
    spy.mockRestore()
  })

  it('não deixa o texto do provedor chegar à tela', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    updateUser.mockResolvedValue({
      data: null,
      error: {
        status: 500,
        code: 'unexpected_failure',
        message: 'password does not satisfy policy: min_length=12, pwned check',
      },
    })

    const result = await updatePasswordAction(VALID)

    expect(result.error).toBe(passwordRecoveryMessages.updateUnavailable)
    expect(result.error).not.toContain('min_length')
    spy.mockRestore()
  })

  it('a senha nunca vai para o log', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    updateUser.mockResolvedValue({
      data: null,
      error: { status: 500, code: 'unexpected_failure', message: 'boom' },
    })

    await updatePasswordAction(VALID)

    expect(JSON.stringify(spy.mock.calls)).not.toContain('clinica2026')
    spy.mockRestore()
  })

  it('falha na gravação não encerra a sessão — a pessoa ainda pode tentar de novo', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    updateUser.mockResolvedValue({
      data: null,
      error: { status: 500, code: 'unexpected_failure', message: 'boom' },
    })

    await updatePasswordAction(VALID)

    expect(signOut).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
