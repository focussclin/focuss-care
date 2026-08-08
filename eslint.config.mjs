import { defineConfig, globalIgnores } from "eslint/config";
import boundaries from "eslint-plugin-boundaries";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * F-03 — as 6 regras da §10 de docs/02-estrutura-de-pastas.md, verificadas.
 *
 * "Sem isto, tudo acima é apenas uma sugestão simpática" — o documento diz isso
 * sobre si mesmo, e o princípio P8 do roadmap diz o mesmo sobre o produto: regra
 * de arquitetura que o CI não verifica não existe. Esta é a dívida **D4**.
 *
 * As duas que mais importam são a 3 e a 5. A 3 impede o designer de buscar dado
 * dentro da view — é a fronteira de propriedade com o Codex. A 5 impede que a
 * chave `service_role` alcance qualquer caminho que termine no cliente, o que
 * exporia **todas as clínicas de uma vez**, não uma.
 *
 * ## Por que duas ferramentas
 *
 * As regras se dividem em "quem importa quem DENTRO de src/" e "quem pode usar
 * tal PACOTE". O `eslint-plugin-boundaries` resolve a primeira metade bem. A
 * segunda foi escrita com `no-restricted-imports`, do ESLint core: na v7 do
 * plugin o seletor `module: { origin: "external" }` não casou em nenhuma das
 * sondas deste repositório, e regra que não dispara é pior que regra nenhuma —
 * dá a sensação de estar protegido.
 *
 * As 6 foram verificadas com arquivos de violação deliberada antes deste arquivo
 * ser considerado pronto.
 *
 * `default: "allow"` no boundaries é deliberado: negar tudo e liberar aresta por
 * aresta vira uma matriz que ninguém mantém, e o resultado prático é gente
 * desligando a regra. O documento enuncia proibições — a config as reproduz
 * como proibições.
 */

/** Elementos são PASTAS. Classificação por arquivo vive em `files`, abaixo. */
const elements = [
  // `_shared` antes do curinga: senão viraria um módulo chamado "_shared", e a
  // regra 4 passaria a proibir todo mundo de usá-lo.
  { type: "shared-domain", pattern: "src/modules/_shared/domain" },
  { type: "shared-application", pattern: "src/modules/_shared/application" },
  { type: "domain", pattern: "src/modules/*/domain", capture: ["module"] },
  {
    type: "application",
    pattern: "src/modules/*/application",
    capture: ["module"],
  },
  {
    type: "infrastructure",
    pattern: "src/modules/*/infrastructure",
    capture: ["module"],
  },
  { type: "actions", pattern: "src/modules/*/actions", capture: ["module"] },
  { type: "schemas", pattern: "src/modules/*/schemas", capture: ["module"] },
  { type: "ui", pattern: "src/modules/*/ui", capture: ["module"] },

  { type: "app", pattern: "src/app" },
  { type: "components", pattern: "src/components" },
  { type: "lib", pattern: "src/lib" },
];

/**
 * Classificação por ARQUIVO — o plugin a separa de pasta, e um padrão de arquivo
 * em `boundaries/elements` não casa com nada (a regra fica muda em vez de
 * falhar, que é o pior modo de errar).
 */
const files = [
  // `*.view.tsx` mora dentro de `ui/`, então continua sendo elemento `ui`.
  { category: "view", pattern: "src/modules/*/ui/*.view.tsx" },
  { category: "public-api", pattern: "src/modules/*/index.ts", capture: ["module"] },
  // Um arquivo só, e o mais perigoso do repositório.
  { category: "supabase-admin", pattern: "src/lib/supabase/admin.ts" },
];

/** Camadas internas de um módulo — o alvo da regra 4. */
const MODULE_LAYERS = [
  "domain",
  "application",
  "infrastructure",
  "actions",
  "schemas",
  "ui",
];

const REGRA_1 =
  "Regra 1: domain/ é o núcleo — TypeScript puro. Não importa application/, infrastructure/, actions/, UI, React, Next nem o SDK do Supabase.";
const REGRA_2 =
  "Regra 2: application/ só conhece a porta do domain/. Importar infrastructure/ amarra o caso de uso ao Supabase; precisar de React ou Next significa que o código é de UI ou de action.";
const REGRA_3 =
  "Regra 3: *.view.tsx recebe dado e callback por props. Buscar dado na view quebra a fronteira de propriedade com o Codex.";
const REGRA_4 =
  "Regra 4: um módulo não importa o interior de outro. Módulo vizinho só pela porta pública.";
const REGRA_5 =
  "Regra 5: lib/supabase/admin.ts usa service_role e IGNORA RLS — um import errado não vaza uma clínica, vaza todas. Só actions/, rotas de API e services/.";
const REGRA_6 =
  "Regra 6: só infrastructure/ e lib/supabase/ falam com o SDK do Supabase. Fora dali, use a porta do módulo.";

/** `no-restricted-imports` na forma que este projeto usa: lista + motivo. */
function proibirPacotes(group, message) {
  return ["error", { patterns: [{ group, message }] }];
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // ---------------------------------------------------------------------------
  // Regras 1, 2, 3, 4 e 5 — dependências DENTRO de src/
  // ---------------------------------------------------------------------------
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": elements,
      "boundaries/files": files,
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: {
                element: { types: { anyOf: ["domain", "shared-domain"] } },
              },
              disallow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "application",
                        "shared-application",
                        "infrastructure",
                        "actions",
                        "ui",
                      ],
                    },
                  },
                },
              },
              message: REGRA_1,
            },
            {
              from: {
                element: {
                  types: { anyOf: ["application", "shared-application"] },
                },
              },
              disallow: {
                to: { element: { types: { anyOf: ["infrastructure", "ui"] } } },
              },
              message: REGRA_2,
            },
            {
              from: { file: { categories: "view" } },
              disallow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "actions",
                        "application",
                        "shared-application",
                        "infrastructure",
                      ],
                    },
                  },
                },
              },
              message: REGRA_3,
            },
            {
              from: { element: { types: { anyOf: MODULE_LAYERS } } },
              disallow: {
                to: {
                  element: {
                    types: { anyOf: MODULE_LAYERS },
                    captured: { module: "!{{from.module}}" },
                  },
                },
              },
              message: REGRA_4,
            },
            {
              from: {
                element: {
                  types: {
                    anyOf: [
                      "ui",
                      "components",
                      "domain",
                      "shared-domain",
                      "application",
                      "shared-application",
                      "schemas",
                    ],
                  },
                },
              },
              disallow: { to: { file: { categories: "supabase-admin" } } },
              message: REGRA_5,
            },
          ],
        },
      ],
    },
  },

  /*
   * `index.ts` Ã© a porta pÃºblica: suas dependÃªncias internas usam caminhos
   * relativos do prÃ³prio mÃ³dulo. Impedir aliases de `@/modules/*` evita que a
   * porta pÃºblica vire um atalho para atravessar outro mÃ³dulo; os consumidores
   * continuam importando a porta, por exemplo `@/modules/patients`.
   */
  {
    files: ["src/modules/*/index.ts"],
    rules: {
      "no-restricted-imports": proibirPacotes(
        ["@/modules/*", "@supabase/*"],
        REGRA_4,
      ),
    },
  },

  // ---------------------------------------------------------------------------
  // Regra 6 — o SDK do Supabase é proibido em src/ inteiro por padrão.
  // As duas exceções vêm logo abaixo, por serem exceções mesmo.
  // ---------------------------------------------------------------------------
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": proibirPacotes(["@supabase/*"], REGRA_6) },
  },
  {
    /*
     * Onde o SDK PODE morar.
     *
     * `infrastructure/` é o que o documento nomeia. `src/lib/**` e `src/proxy.ts`
     * entram porque são a camada de composição do app, que existe desde antes do
     * sistema de módulos: `lib/supabase` monta os clientes, `lib/data-source`
     * escolhe entre banco e demonstração, `lib/audit` grava com a sessão do
     * usuário, e o proxy renova o cookie de sessão a cada request. Nenhum deles
     * tem como cumprir seu trabalho sem o SDK.
     *
     * O que a regra protege continua protegido: domain, application, actions,
     * schemas, UI e components não alcançam o SDK — e `admin.ts`, o arquivo que
     * ignora RLS, tem a regra 5 só para ele.
     */
    files: [
      "src/modules/*/infrastructure/**",
      "src/lib/**",
    ],
    rules: { "no-restricted-imports": "off" },
  },

  // Regra 1 — o núcleo não conhece framework nem SDK.
  {
    files: ["src/modules/*/domain/**", "src/modules/_shared/domain/**"],
    rules: {
      "no-restricted-imports": proibirPacotes(
        ["react", "react-dom", "next", "next/*", "@supabase/*"],
        REGRA_1,
      ),
    },
  },

  // Regra 2 — o caso de uso não conhece framework.
  {
    files: [
      "src/modules/*/application/**",
      "src/modules/_shared/application/**",
    ],
    rules: {
      "no-restricted-imports": proibirPacotes(
        ["react", "react-dom", "next", "next/*", "@supabase/*"],
        REGRA_2,
      ),
    },
  },

  // Regra 3 — a view não busca dado, nem por SDK nem por query client.
  {
    files: ["src/modules/*/ui/*.view.tsx"],
    rules: {
      "no-restricted-imports": proibirPacotes(
        ["@supabase/*", "@tanstack/react-query"],
        REGRA_3,
      ),
    },
  },

  {
    /*
     * Exceção única e NOMEADA, em vez de afrouxar a regra para a camada toda.
     *
     * `createAction` é o pipeline que monta o cliente com a sessão do usuário e o
     * entrega ao repositório — por isso precisa do tipo `SupabaseClient` na
     * assinatura do `ActionContext`, e de `next/cache`/`next/navigation` para
     * revalidar e para devolver ao framework as exceções de controle de fluxo.
     *
     * Continua sendo uma tensão real de camada: o pipeline tem cara de
     * infraestrutura morando em application/. Fica registrado aqui, visível, em
     * vez de dissolvido num `default` permissivo.
     */
    files: ["src/modules/_shared/application/createAction.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  {
    /*
     * Segunda exceção nomeada, pelo mesmo motivo e com o mesmo desconforto.
     *
     * `toWriteFailure` traduz falha de escrita em `Result`, e precisa chamar
     * `unstable_rethrow` ANTES de tratar qualquer coisa como erro de banco:
     * `redirect()` e `notFound()` do Next sinalizam por exceção, e engoli-los
     * transformaria uma navegação em "não foi possível salvar".
     *
     * Reimplementar a detecção (olhar `error.digest`) seria copiar detalhe
     * interno do framework — pior que a exceção. O caminho certo é o rethrow
     * subir para a borda da action, e isso mexe em arquivos que outro agente tem
     * abertos agora. Fica como dívida declarada, não como regra afrouxada.
     */
    files: ["src/modules/patients/application/writeFailure.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  {
    // Um teste exercita a camada que testa: teste de adapter importa o adapter.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "boundaries/dependencies": "off",
      "no-restricted-imports": "off",
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
