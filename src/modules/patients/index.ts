/**
 * Porta pública do módulo de pacientes.
 *
 * # O que pode entrar aqui, e o que não pode
 *
 * Módulos vizinhos reutilizam o seletor sem conhecer a organização interna de
 * `ui/`. O que este arquivo NÃO pode virar é um atalho para atravessar a regra
 * 4: reexportar `infrastructure`, `actions` ou `domain` daqui devolveria o
 * acoplamento que a regra existe para impedir, com aparência de organização.
 *
 * Duas defesas já existem, e nenhuma das duas cobre isso:
 *
 *  - `eslint.config.mjs` proíbe `@/modules/...` e `@supabase/...` dentro deste
 *    arquivo, então a porta não alcança OUTRO módulo;
 *  - `infrastructure` é `server-only`, então reexportá-la quebraria o build de
 *    quem importasse do cliente.
 *
 * O que sobra sem guarda é reexportar `domain` ou `actions` do próprio módulo —
 * e é por isso que `publicApi.test.ts` existe: ele varre os barris e falha se
 * algum expuser camada que não seja `ui` ou `schemas`.
 */
export { PatientPicker, type PatientPickerProps } from './ui/PatientPicker'
