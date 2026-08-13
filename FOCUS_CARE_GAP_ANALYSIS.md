# Focus Care — Gap Analysis

> Levantado contra o código em **10/08/2026**, branch `feat/telas-e-camada-supabase`,
> a partir do commit `c461cab`. Método na §0. Nenhuma linha foi escrita para
> produzir este documento — é leitura do repositório e do schema tipado.

## 0. Como cada linha foi classificada

Não é opinião. Cada classificação vem de uma verificação executável:

| Classe | Critério verificável |
| --- | --- |
| **EXISTE** | Cadeia completa UI → action → repositório Supabase → tabela do schema aplicado, com teste. |
| **PARCIAL** | A cadeia existe mas parte do domínio não é alcançável (coluna nunca escrita, valor de enum inalcançável, transição de status ausente). |
| **MOCK** | A tela renderiza de repositório `Mock*`/`Empty*` porque a tabela **não existe** no schema aplicado. |
| **NÃO EXISTE** | Nem tabela, nem módulo, nem rota. |
| **PRECISA CORREÇÃO** | Funciona, mas com defeito real identificado. |

As varreduras usadas:

1. **Tabelas sem superfície** — nome da tabela ausente de todo `src/**/*.ts(x)`
   fora de `database.types.ts`.
2. **Enums inalcançáveis** — valor do enum que nenhum arquivo de `src/` cita.
   É a varredura de maior rendimento: um enum inteiro sem uso é funcionalidade
   que o banco espera e a aplicação não oferece.
3. **Colunas nunca referenciadas** — coluna do `Row` ausente de todo o código.
4. **Tabelas só lidas** — `.from('x')` sem `insert`/`update`/`delete` próximo.
5. **Migrations não aplicadas** — `create table` nas migrations locais cujo nome
   não aparece em `database.types.ts` (que é gerado do banco real).

## 1. O número que explica o resto

```
78   tabelas/views/funções no schema APLICADO
22   tabelas criadas por migrations LOCAIS
18   dessas 22 NÃO estão no schema aplicado
10   itens do menu marcados `availability: 'setup'` por causa disso
```

**Dezoito tabelas existem só em arquivo `.sql` no repositório.** Este é o maior
gap do produto, e não é de código — é de acesso ao banco. Nenhuma linha de
TypeScript resolve.

Tabelas nessa situação:

```
bank_accounts            bank_reconciliations     bank_transactions
clinic_forms             clinic_form_responses    clinic_leads
lead_events              clinic_tasks             inventory_items
inventory_movements      purchase_orders          purchase_order_items
purchase_suppliers       rooms                    patient_tags
patient_tag_links        patient_portal_accounts  patient_portal_invites
```

## 2. Módulos — inventário verificado

42 rotas, 28 módulos, 118 Server Actions, 38 adapters Supabase, 186 arquivos de
teste (2393 testes).

| Módulo do produto | Rota | Estado | Evidência |
| --- | --- | --- | --- |
| Dashboard | `/dashboard` | **EXISTE** | lê `appointments`, `patients`, `encounters` reais |
| Indicadores / BI | `/indicadores` | **EXISTE** | contagens por `count`, sem transferir linha |
| Insights | `/insights` | **EXISTE** | `operationalInsights` deriva de contagem real |
| Agenda | `/agenda` | **EXISTE** | criar, remarcar, cancelar, confirmar, desfecho (§8.34) |
| Pacientes 360 | `/pacientes/[id]` | **PARCIAL** | ver §3.1 |
| Atendimento | `/atendimentos` | **EXISTE** | fila real em `waiting_queue` |
| Prontuário | `/prontuarios` | **PARCIAL** | ver §3.2 |
| Recepção | `/recepcao` | **EXISTE** | derivado da agenda + fila |
| Display TV | `/display` | **EXISTE** | projeta `waiting_queue` |
| Salas e recursos | `/salas-e-recursos` | **MOCK** | `rooms` não aplicada |
| CRM e Leads | `/crm` | **MOCK** | `clinic_leads` não aplicada |
| Inbox | `/inbox` | **PARCIAL** | tabelas existem; envio externo bloqueado |
| WhatsApp | `/whatsapp` | **NÃO EXISTE (declarado)** | tela mostra estado do canal, sem simular |
| Portal do Paciente | `/portal-paciente` | **MOCK** | `patient_portal_accounts` não aplicada |
| Portal do Profissional | `/portal-profissional` | **EXISTE** | agenda própria via `current_professional_id()` |
| Chat / IA | `/chat-ia` | **NÃO EXISTE (declarado)** | 625 bytes: declara a regra P9 e o bloqueio |
| Automações | `/automacoes` | **PARCIAL** | CRUD real; **nada executa** |
| Tarefas | `/tarefas` | **MOCK** | `clinic_tasks` não aplicada |
| Financeiro | `/financeiro` | **PARCIAL** | ver §3.3 |
| Conciliação | `/conciliacao` | **MOCK** | `bank_*` não aplicadas |
| Convênios | `/convenios` | **EXISTE** | ciclo da guia completo (§8.31) |
| Catálogo de serviços | `/servicos` | **EXISTE** | serviços + tabelas de preço (§8.32) |
| Estoque | `/estoque` | **MOCK** | `inventory_*` não aplicadas |
| Compras | `/compras` | **MOCK** | `purchase_*` não aplicadas |
| Equipe | `/equipe` | **EXISTE** | acesso, convites, funcionários, profissionais (§8.33) |
| Usuários e permissões | `/equipe` + `permissions.ts` | **PARCIAL** | RBAC por papel fixo, não granular |
| Relatórios | `/relatorios` | **PARCIAL** | faturamento ausente por decisão |
| Documentos | `/documentos` | **EXISTE** | upload real com bucket verificado |
| Formulários | `/formularios` | **MOCK** | `clinic_forms` não aplicada |
| Assinaturas | `/assinaturas` | **EXISTE** | plano, estado e cotas do uso real |
| Auditoria | `/auditoria` | **EXISTE** | `audit_log` sem IP nem metadado bruto |
| Configurações | `/configuracoes` | **PARCIAL** | marca, IA e fuso não consumidos |
| Teleatendimento | — | **NÃO EXISTE** | fora de escopo permanente, por decisão |

## 3. Os PARCIAIS, em detalhe

### 3.1 Pacientes 360 — o que falta

A ficha reúne hoje: dados pessoais, contatos, tags, consentimentos, alergias,
sinais vitais, prescrições, documentos, atendimentos, convênio, portal.

| Ausente | Causa verificada |
| --- | --- |
| CPF / CNS / endereço | Colunas existem; nunca escritas. Grupo documental — CPF pede validação de dígito e política de duplicidade |
| Foto | `photo_url` existe; **não há bucket** de Storage para ela |
| Timeline unificada | Cada painel lista o próprio recorte; não há evento agregado |
| Responsáveis | `patient_contacts` existe e é usada; falta o papel "responsável legal" |
| Origem do paciente | Coluna inexistente; `clinic_leads` (que teria) não está aplicada |
| Nome social nas outras telas | `patients ( full_name )` em **9 módulos**; propagação transversal pendente |

### 3.2 Prontuário — o que falta

| Ausente | Causa verificada |
| --- | --- |
| Anexos clínicos | `clinical_attachments` existe no schema; **sem bucket** |
| Modelos de evolução | Não há tabela |
| Campos personalizados | Não há tabela |
| Assinatura digital | Não implementada — e não deve ser simulada |
| CID / diagnóstico | Não há tabela |

O versionamento existe: `v_medical_records_current` é view sobre histórico, e
`prescriptions`/`vitals` são append-only por ausência de `updated_at`.

### 3.3 Financeiro — o que falta

| Ausente | Causa verificada |
| --- | --- |
| Emissão fiscal numerada | RPC `issue_invoice` com assinatura não resolvida (**P-RPC**) |
| Repasse a profissional | `preview_professional_payout` idem; `professional_payouts` sem superfície |
| DRE / centro de custo | Não há tabela |
| Faturamento nos relatórios | Decisão: R$ 0,00 é verdadeiro como consulta e falso como informação |

### 3.4 Enums parcialmente alcançáveis (dívida ativa)

| Enum | Inalcançável | Consequência |
| --- | --- | --- |
| `MessageStatus` | `queued`, `sent`, `delivered` | Sem envio — depende de provedor externo |
| `WorkflowRunStatus` | `running`, `succeeded` | Sem executor (**AU-01**) |
| `AiFeature` / `AiRole` | 7/7 e 3/4 | IA bloqueada (**AI-01**) |
| `ClinicStatus` | `trial` | Ciclo de assinatura não modela período de teste |
| `CouncilType` | `OUTRO` | Profissional de conselho fora da lista não cadastra |

## 4. Dados mockados — onde e por quê

**Não há dado fabricado em caminho de produção.** Os 23 repositórios
`Mock*`/`Empty*` só entram quando `resolveDataSource()` devolve modo de
demonstração, e todos **recusam escrita** com erro explícito. As telas exibem
"Modo demonstração" via `role="status"`.

O que existe de verdade e merece atenção:

| Local | O que é | Risco |
| --- | --- | --- |
| `src/lib/mocks/clinic-data.ts` | Fixture de demonstração | Baixo — só no modo demo |
| `MockPatientRepository` etc. | Leitura de exemplo | Baixo — escrita lança |
| `MockAppointmentRepository` | Só leitura | Baixo |

## 5. PRECISA CORREÇÃO — defeitos reais identificados

| # | Defeito | Onde | Impacto |
| --- | --- | --- | --- |
| C1 | `listProfessionals` filtra `is_active` mas **não** `deleted_at` | `SupabaseAppointmentRepository.ts` | Profissional removido fora do produto reaparece na agenda |
| C2 | `NewProfessionalData.agendaColor` é preenchido pela action e **ignorado** pelo adapter | `team/` | Campo morto; engana quem mexer depois |
| C3 | `checked_in` / `in_progress` inalcançáveis | `scheduling` × `encounters` | Agenda e fila discordam do mesmo paciente |
| C4 | Sem rate limiting em nenhuma rota | global | Login e busca expostos a força bruta |
| C5 | Sem 2FA | `identity` | Requisito para dado de saúde |
| C6 | Policies de **escrita** nunca verificadas | 13 tabelas | Escrita pode falhar em silêncio; o código já trata (`write-forbidden`) mas o estado real é desconhecido |
| C7 | `revalidateTargets` não enxerga caminhos vindos de função | guard | Já contornado, mas o guard segue cego para esse formato |

## 6. NÃO EXISTE — e é o gap estratégico

| Requisito pedido | Estado | Observação |
| --- | --- | --- |
| **Múltiplas unidades por organização** | **NÃO EXISTE** | Não há tabela `units`. `clinic_id` é o único limite de tenant. Uma "clínica" é a unidade |
| Permissões granulares por módulo/ação | **NÃO EXISTE** | Matriz fixa de 5 papéis em `permissions.ts` |
| Lista de espera inteligente | **NÃO EXISTE** | Não há tabela |
| Recorrência de agendamento | **NÃO EXISTE** | Não há coluna |
| Feriados / indisponibilidade por unidade | **PARCIAL** | `availability_exceptions` existe; `availability_rules` bloqueada (**P-WD**) |
| Motor de documentos com template/PDF | **PARCIAL** | Upload existe; template e PDF não |
| Construtor de formulários | **MOCK** | Migration não aplicada |
| Inbox omnichannel | **PARCIAL** | Estrutura existe; só canal interno |
| Agentes de IA | **NÃO EXISTE** | Tabelas existem; bloqueio **AI-01** |
| Base de conhecimento | **NÃO EXISTE** | `document_embeddings` existe, sem superfície |
| Motor de automações (execução) | **NÃO EXISTE** | Regras persistem; **AU-01** |
| Webhooks / API pública | **NÃO EXISTE** | — |
| Gestão de sessões/dispositivos | **NÃO EXISTE** | — |
| Busca global | **PARCIAL** | Command palette existe (Ctrl/Cmd+K), navega; não busca dados |
| Notificações multicanal | **PARCIAL** | `notifications` interna funciona; canais externos não |

## 7. O que NÃO deve ser construído — já existe e funciona

Lista deliberada, para impedir reescrita:

- **Pipeline de Server Action** (`createAction`): autenticar → clínica ativa →
  papel → Zod → handler → revalidar → auditar. 118 actions o usam.
- **Isolamento de tenant**: `current_clinic_id()` + filtro explícito em todo
  adapter + RLS. `clinicId` nunca vem do cliente (P3).
- **Auditoria**: `audit_log` central com regra de não gravar valor pessoal.
- **Portas e adaptadores** por módulo, com repositório de demonstração.
- **Paginação por cursor** em pacientes (38 adapters com `limit`).
- **Guards executáveis**: `revalidateTargets`, `navigation`, `publicApi`,
  `serverBoundaryProps`, `instantOptOuts`, `migrationBundle`.
- **Agenda**: conflito, expediente, bloqueio, sala, ciclo de vida.
- **Tratamento `write-forbidden` vs `not-found`** — releitura após zero linhas.
- **Cadastro de profissionais**, **catálogo + tabelas de preço**,
  **ciclo da guia de convênio**, **prescrições**, **sinais vitais**, **alergias**.

## 8. Resumo em uma tabela

| Classe | Quantidade |
| --- | --- |
| EXISTE | 15 módulos |
| PARCIAL | 8 módulos |
| MOCK (migration pendente) | 7 módulos |
| NÃO EXISTE (declarado na tela) | 3 módulos |
| PRECISA CORREÇÃO | 7 defeitos |

**A conclusão que importa:** o produto não sofre de falta de telas. Sofre de
**18 migrations não aplicadas** e de **quatro bloqueios externos** (P-RPC, P-WD,
bucket de Storage, W-01/AI-01). Construir mais tela antes de resolver isso
aumenta a superfície falsa.
