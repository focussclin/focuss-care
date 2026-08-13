import { describe, expect, it } from 'vitest'

import { buildSystemPrompt, checkEscalation } from './AiAssistant'

/**
 * Os freios da IA que responde paciente.
 *
 * Este arquivo protege a decisão mais delicada do produto: uma máquina falando
 * em nome da clínica, com paciente, sobre saúde. O filtro é LOCAL e vem antes de
 * qualquer chamada ao modelo — instrução em prompt é pedido, isto é regra.
 */

describe('assunto clínico nunca chega ao modelo', () => {
  it.each([
    'estou com dor de cabeça forte',
    'posso tomar dipirona?',
    'qual a dosagem do remédio?',
    'meu exame deu alterado',
    'estou com febre desde ontem',
    'a ferida está inflamada',
    'posso usar esse antibiótico?',
    'estou grávida, posso tomar?',
    'tive um efeito colateral',
  ])('escala: "%s"', (mensagem) => {
    const resultado = checkEscalation(mensagem)

    expect(resultado.shouldEscalate).toBe(true)
    expect(resultado.reason).toBeTruthy()
  })

  it('urgência tem motivo próprio, não o genérico', () => {
    /*
     * A recepção precisa distinguir "alguém perguntou de remédio" de "alguém
     * pode estar passando mal" na hora de escolher o que abrir primeiro.
     */
    const urgencia = checkEscalation('socorro, minha mãe desmaiou')
    const clinico = checkEscalation('qual a dose desse remédio?')

    expect(urgencia.reason).toMatch(/urg/i)
    expect(clinico.reason).not.toMatch(/urg/i)
  })
})

describe('o que a IA pode responder', () => {
  it.each([
    'vocês atendem sábado?',
    'qual o endereço?',
    'preciso remarcar minha consulta',
    'vocês aceitam meu convênio?',
    'bom dia',
  ])('não escala: "%s"', (mensagem) => {
    expect(checkEscalation(mensagem).shouldEscalate).toBe(false)
  })
})

describe('a instrução do sistema', () => {
  const facts = {
    tradeName: 'Clínica Focuss',
    businessHours: 'Segunda a sexta, 8h às 18h',
    address: null,
    phone: null,
  }

  it('lista como conhecido apenas o que foi informado', () => {
    const prompt = buildSystemPrompt(facts, 'Maria')

    expect(prompt).toContain('Segunda a sexta, 8h às 18h')
    // Endereço é nulo: não pode aparecer como fato conhecido, senão a IA
    // preenche a lacuna sozinha — foi o que ela fez sem esta instrução.
    expect(prompt).not.toContain('Endereço:')
  })

  it('proíbe inventar, orientar clinicamente e mexer na agenda', () => {
    const prompt = buildSystemPrompt(facts, null)

    expect(prompt).toMatch(/NUNCA invente/i)
    expect(prompt).toMatch(/NUNCA dê orientação clínica/i)
    expect(prompt).toMatch(/NUNCA confirme, marque, remarque ou cancele/i)
  })

  it('só cumprimenta pelo nome quando sabe o nome', () => {
    // Chamar o paciente pelo nome errado é pior que não cumprimentar.
    expect(buildSystemPrompt(facts, 'Maria')).toContain('Maria')
    expect(buildSystemPrompt(facts, null)).not.toContain('Você fala com')
  })
})
