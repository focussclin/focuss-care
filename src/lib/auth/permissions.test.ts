import { describe, expect, it } from 'vitest'

import {
  can,
  rolesWith,
  MEMBERSHIP_ROLES,
  type Permission,
} from './permissions'

describe('matriz papel x acao', () => {
  it('ausencia de papel nunca autoriza', () => {
    // Sessao sem vinculo na clinica ativa nao e "papel neutro": e ninguem.
    expect(can(null, 'patient.read')).toBe(false)
    expect(can(undefined, 'patient.read')).toBe(false)
    expect(can(null, 'report.read')).toBe(false)
  })

  it('owner alcanca tudo que a matriz conhece', () => {
    const everything = new Set<Permission>()
    for (const role of MEMBERSHIP_ROLES) {
      for (const permission of ALL_PERMISSIONS) {
        if (can(role, permission)) everything.add(permission)
      }
    }

    for (const permission of everything) {
      expect(can('owner', permission)).toBe(true)
    }
  })

  describe('prontuario e o dado mais sensivel do produto', () => {
    it('so quem cuida do paciente le a evolucao clinica', () => {
      expect(can('professional', 'record.read')).toBe(true)
      expect(can('owner', 'record.read')).toBe(true)
    })

    it('administrar a clinica NAO da acesso ao prontuario', () => {
      // O cenario que a LGPD chama de acesso incompativel com a finalidade:
      // administrativo abrindo a evolucao clinica de qualquer paciente.
      expect(can('admin', 'record.read')).toBe(false)
      expect(can('admin', 'record.write')).toBe(false)
      expect(can('receptionist', 'record.read')).toBe(false)
      expect(can('finance', 'record.read')).toBe(false)
    })
  })

  describe('financeiro', () => {
    it('recepcao nao ve valor', () => {
      // Marcar consulta nao exige saber quanto ela custa nem o que o paciente deve.
      expect(can('receptionist', 'invoice.read')).toBe(false)
      expect(can('receptionist', 'payment.write')).toBe(false)
      expect(can('receptionist', 'cash.manage')).toBe(false)
    })

    it('profissional nao movimenta caixa', () => {
      expect(can('professional', 'cash.manage')).toBe(false)
      expect(can('professional', 'invoice.write')).toBe(false)
    })

    it('finance le paciente, porque fatura precisa de nome', () => {
      expect(can('finance', 'patient.read')).toBe(true)
      expect(can('finance', 'invoice.write')).toBe(true)
    })

    it('finance nao alcanca agenda nem atendimento', () => {
      expect(can('finance', 'appointment.write')).toBe(false)
      expect(can('finance', 'encounter.write')).toBe(false)
      expect(can('finance', 'patient.write')).toBe(false)
    })

    /*
     * A LEITURA e o caso que faltava, e era o que importava.
     *
     * O teste acima dizia "nao alcanca agenda" e verificava so a escrita — e o
     * produto tinha exatamente esse buraco: `appointment.read` nao era exigido
     * em rota nenhuma ate 10/08/2026, entao `finance` lia a semana inteira da
     * clinica pela URL. Nao marcar consulta nunca foi o ponto; ver quem consulta
     * com quem, quando e de que tipo e que e o dado sensivel.
     */
    it('finance nao LE agenda nem fila, so a cobranca', () => {
      expect(can('finance', 'appointment.read')).toBe(false)
      expect(can('finance', 'encounter.read')).toBe(false)
      expect(can('finance', 'record.read')).toBe(false)

      // O que ele le, e por que a ficha do paciente continua aberta para ele.
      expect(can('finance', 'patient.read')).toBe(true)
      expect(can('finance', 'invoice.read')).toBe(true)
    })

    /*
     * `finance` e o UNICO papel sem `appointment.read`. Os portoes de `/agenda`,
     * `/pacientes/[patientId]` e `/pacientes/[patientId]/historico` foram
     * escritos com isso em mente: se um segundo papel perder a permissao, as
     * tres telas passam a negar tambem, e quem mexer na matriz deve saber disso
     * antes de descobrir por reclamacao.
     */
    it('so o financeiro fica fora da agenda', () => {
      expect(rolesWith('appointment.read')).toEqual([
        'owner',
        'admin',
        'professional',
        'receptionist',
      ])
    })
  })

  describe('cadastro de pacientes', () => {
    it('mantem exatamente quem escrevia antes de I-05', () => {
      // P-01 permitia owner, admin, receptionist e professional. I-05 centraliza
      // a politica sem mudar comportamento — se esta lista mudar, foi decisao,
      // nao efeito colateral.
      expect(rolesWith('patient.write')).toEqual([
        'owner',
        'admin',
        'professional',
        'receptionist',
      ])
    })

    it('arquivar e decisao administrativa, nao clinica', () => {
      expect(can('professional', 'patient.archive')).toBe(false)
      expect(can('receptionist', 'patient.archive')).toBe(true)
    })
  })

  describe('rolesWith', () => {
    it('e o inverso exato de can', () => {
      for (const permission of ALL_PERMISSIONS) {
        const allowed = rolesWith(permission)

        for (const role of MEMBERSHIP_ROLES) {
          expect(can(role, permission)).toBe(allowed.includes(role))
        }
      }
    })

    it('nao devolve papel desconhecido', () => {
      for (const role of rolesWith('clinic.settings')) {
        expect(MEMBERSHIP_ROLES).toContain(role)
      }
    })
  })

  it('toda permissao tem pelo menos um papel — nenhuma acao e orfa', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(rolesWith(permission).length).toBeGreaterThan(0)
    }
  })

  it('todo papel tem pelo menos uma permissao — nenhum papel e decorativo', () => {
    for (const role of MEMBERSHIP_ROLES) {
      const granted = ALL_PERMISSIONS.filter((permission) =>
        can(role, permission),
      )
      expect(granted.length).toBeGreaterThan(0)
    }
  })
})

/**
 * Lista literal, e nao derivada da matriz: um teste que se alimenta da propria
 * fonte que testa nao verifica nada. Se uma permissao nova entrar em
 * `Permission` sem entrar aqui, o `satisfies` abaixo quebra a compilacao.
 */
const ALL_PERMISSIONS = [
  'patient.read',
  'patient.write',
  'patient.archive',
  'appointment.read',
  'appointment.write',
  'appointment.cancel',
  'encounter.read',
  'encounter.write',
  'record.read',
  'record.write',
  'invoice.read',
  'invoice.write',
  'payment.write',
  'cash.manage',
  'payable.write',
  'insurance.manage',
  'team.read',
  'team.manage',
  'clinic.settings',
  'audit.read',
  'report.read',
] as const satisfies readonly Permission[]
