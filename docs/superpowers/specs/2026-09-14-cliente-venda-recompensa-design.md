# Cadastro de cliente e lançamento de venda (sub-projeto 2 de 3)

Este é o segundo de três sub-projetos que juntos implementam um programa de
recompensa (cashback) simples no lupo-contagem:

1. Escopo por loja (spec/plano já implementados e publicados —
   `docs/superpowers/specs/2026-09-13-escopo-por-loja-design.md`).
2. **Cadastro de cliente + lançamento de venda** (este spec).
3. Cashback (saldo, expiração) + automação de WhatsApp (spec futuro).

Este sub-projeto depende do primeiro (usa o cookie `store_id` e
`getStoreIdFromRequest` já existentes) e é uma dependência do terceiro
(que vai anexar cálculo de cashback às vendas registradas aqui). Este
spec cobre **apenas** cadastro de cliente e lançamento de venda — sem
nenhum cálculo de cashback, saldo, expiração ou WhatsApp.

## Contexto

A loja quer um programa de recompensa simples: a cada compra registrada
aqui, o cliente ganha um cashback pra usar na próxima (regra calculada no
sub-projeto 3). As vendas em si continuam sendo lançadas no sistema de
vendas já existente da loja (fora do lupo-contagem) — aqui só se registra
**quem comprou, quando e quanto**, pra alimentar o programa de recompensa.
Como não há login no sistema, e essa área lida com dado sensível
(cadastro de clientes e valores de venda), ela precisa de uma proteção
mínima contra acesso por pessoas de fora — mas nada tão pesado quanto
contas de usuário.

## Decisões

- **Cliente por loja**: cada loja tem seu próprio cadastro de clientes,
  independente — mesmo padrão de Produtos/Grupos no sub-projeto 1. Um
  cliente que compra nas duas lojas fica cadastrado duas vezes.
- **Sem unicidade de telefone**: nenhuma validação impede telefones
  repetidos.
- **Venda sem produto**: só cliente, data e valor.
- **Data editável**: a funcionária escolhe a data da venda (default: hoje),
  não é travada na hora do lançamento.
- **Venda editável e removível** depois de lançada.
- **Proteção por PIN único por loja**: um PIN diferente por loja (não por
  funcionária — sem cadastro de usuário, sem rastreio de quem lançou),
  guardado em variável de ambiente, não no banco. Destravar um dispositivo
  fica salvo (cookie perene), não pede de novo a cada lançamento.
- **Sem tela de administração de loja**: os PINs são definidos via `.env`
  no deploy, do mesmo jeito que hoje não existe UI pra cadastrar uma
  terceira loja.
- **Tela de Clientes** dedicada (listar/editar/remover), além do cadastro
  inline durante o lançamento de venda.
- **Grades responsivas, paginadas, com linhas zebradas** — cliente e
  vendas, seguindo o padrão visual pedido para toda grade do app daqui
  pra frente.

## Modelo de dados

```
customers
  id         serial PK
  store_id   integer not null → stores.id
  name       text not null
  phone      text not null
  created_at timestamp with time zone not null default now()

sales
  id          serial PK
  store_id    integer not null → stores.id
  customer_id integer not null → customers.id
  sale_date   date not null
  value_cents integer not null
  created_at  timestamp with time zone not null default now()
```

- `value_cents`: valor em centavos (inteiro), não `numeric`/`float` — evita
  erro de arredondamento em dinheiro. UI formata como R$ na exibição e
  converte na entrada (`R$ 45,90` ↔ `4590`).
- `sale_date`: tipo `date` (sem hora) — é uma data escolhida pela
  funcionária, não um timestamp de sistema.
- `created_at` em `sales`: quando o registro foi *criado* (auditoria
  básica), separado de `sale_date` (que pode ser retroativa e é editável).
- Índice em `customers(store_id)` e `sales(store_id)` para as listagens.
- Sem FK pra produto/SKU em nenhuma das duas tabelas.

### Migração

Cria as duas tabelas com as FKs pra `stores`/`customers`. Não há dado
existente pra migrar (tabelas novas).

## Mecanismo de proteção por PIN

- PIN por loja em variável de ambiente, nome derivado do slug:
  `SALE_PIN_<SLUG_EM_MAIUSCULO_COM_UNDERSCORE>` — ex: `SALE_PIN_COXIM_MS`,
  `SALE_PIN_CAMPO_GRANDE_MS`.
- `lib/salePin.ts`: `getSalePinEnvVarName(slug: string): string` (deriva o
  nome da env var a partir do slug) e `getStoreSalePinCookieName(): string`
  (constante `'sale_pin_ok'`), além de um helper server-side
  `isSalePinUnlocked(req: Request, storeId: number): boolean` que lê o
  cookie `sale_pin_ok` e compara com o `storeId` atual (cookie precisa
  conter exatamente esse id).
- `POST /api/sale-pin/verify`: recebe `{ pin }`, resolve a loja atual via
  `getStoreIdFromRequest`, busca o `slug` da loja no banco, compara `pin`
  com `process.env[getSalePinEnvVarName(slug)]`. Se baterem, responde
  `{ ok: true }` (o cliente então grava o cookie `sale_pin_ok=<storeId>`,
  perene, mesmo padrão do cookie de loja). Se não baterem, ou se a env var
  não estiver configurada para aquela loja, responde 401
  `{ error: 'invalid_pin' }`.
- Toda rota de `/api/customers*` e `/api/sales*` chama
  `isSalePinUnlocked(req, storeId)` logo após resolver `storeId` — se
  falso, responde 401 `{ error: 'sale_pin_required' }` antes de tocar no
  banco.
- **`middleware.ts` não muda.** A checagem de PIN fica só dentro de cada
  rota (mesmo padrão já usado para `getStoreIdFromRequest`), não
  centralizada no middleware — mantém o middleware com uma única
  responsabilidade (loja selecionada) mesmo essa checagem sendo
  tecnicamente compatível com o runtime Edge.
- As páginas `/recompensas` e `/recompensas/clientes` leem o cookie
  `sale_pin_ok` no client (mesmo padrão de leitura de cookie já usado no
  `Nav.tsx` para mostrar o nome da loja) e mostram um formulário de PIN no
  lugar do conteúdo até ele bater com a loja atual — sem redirecionar de
  página, só troca o que renderiza.
- Sem rate-limit ou bloqueio por tentativas erradas — fora de escopo,
  risco baixo pra uma ferramenta interna.

## Telas e navegação

- Um item novo no menu: **"Recompensas"** (`/recompensas`). A tela de
  Clientes vive em `/recompensas/clientes`, alcançável por um link dentro
  da própria página de Recompensas — não vira item de menu separado, pra
  não sobrecarregar a barra de navegação. As duas páginas compartilham o
  mesmo cookie `sale_pin_ok`: destravar uma libera a outra.

### `/recompensas`

- Sem `sale_pin_ok` válido pra loja atual: só um campo de PIN + botão.
  Envia pra `POST /api/sale-pin/verify`; sucesso grava o cookie e revela o
  resto da página.
- Destravada:
  - Busca de cliente: campo de texto livre, debounce 300ms (mesmo padrão
    de `app/products/page.tsx`), chama `GET /api/customers?q=...`.
    Resultados aparecem numa lista abaixo; clicar seleciona.
  - Sem resultado: "Cliente não encontrado — Cadastrar novo cliente" abre
    um mini-formulário inline (nome + telefone) que chama
    `POST /api/customers` e seleciona o cliente recém-criado.
  - Com cliente selecionado: campos de data (`<input type="date">`,
    default hoje) e valor (campo com máscara de moeda, formato
    `R$ 00.000,00`, preenchendo da direita pra esquerda conforme os
    dígitos são digitados) + botão "Registrar venda", que chama
    `POST /api/sales`.
  - Abaixo do formulário: grade das vendas já lançadas na loja atual
    (data, cliente, valor, editar/remover), usando `GET /api/sales`.
    Responsiva, com linhas zebradas, **20 registros por página**,
    ordenada por **compra mais recente primeiro (default)**, com opção
    de trocar pra ordem alfabética pelo nome do cliente
    (`GET /api/sales?sort=recent|name`).

### `/recompensas/clientes`

- Mesmo padrão visual de `app/products/page.tsx`: formulário de adicionar
  cliente no topo, grade paginada/responsiva/zebrada embaixo (nome,
  telefone, editar/remover).
- Protegida pelo mesmo cookie `sale_pin_ok` — se não destravada, mostra o
  mesmo formulário de PIN de `/recompensas`.

## Campos com máscara

- **Telefone** (cadastro/edição de cliente, nas duas telas): máscara
  `(00) 00000-0000`, preenchida progressivamente conforme os dígitos são
  digitados. Quando não há telefone existente (cadastro novo), o campo já
  vem pré-preenchido com o DDD local **67** — o usuário pode apagar e
  trocar por outro DDD livremente, é só um ponto de partida pra agilizar
  a digitação.
- **Valor** (lançamento e edição de venda): máscara de moeda
  `R$ 00.000,00` — o valor digitado (em centavos) preenche da direita
  pra esquerda, como um campo de caixa registradora. O valor mandado pra
  API já vem em centavos (inteiro), sem conversão de string no backend.

## API

Todas as rotas abaixo (exceto `POST /api/sale-pin/verify`) exigem
`store_id` válido (já garantido pelo `middleware.ts` existente) **e**
`sale_pin_ok` batendo com a loja atual.

- `GET /api/customers?q=&page=&pageSize=` — busca/lista clientes da loja
  atual, paginado. Reusada tanto pela busca inline em `/recompensas`
  quanto pela grade de `/recompensas/clientes`.
- `POST /api/customers` — `{ name, phone }`, ambos obrigatórios
  (trim + not empty). 400 `invalid_customer` se faltar algum.
- `PUT /api/customers/:id` — `{ name, phone }`. 404 se o cliente não
  existir ou for de outra loja.
- `DELETE /api/customers/:id` — 404 nas mesmas condições. **Não** impede
  remover um cliente com vendas associadas (fora de escopo tratar esse
  caso agora — sub-projeto 3 pode revisitar quando cashback depender de
  cliente existente).
- `GET /api/sales?page=&pageSize=&sort=` — lista paginada das vendas da
  loja atual, cada item já incluindo `customerName` (join com
  `customers`). `sort=recent` (default) ordena por data da venda mais
  recente primeiro; `sort=name` ordena alfabeticamente pelo nome do
  cliente. A tela `/recompensas` sempre pede `pageSize=20`.
- `POST /api/sales` — `{ customerId, saleDate, valueCents }`. Valida:
  `customerId` existe e pertence à loja atual (400 `invalid_customer` se
  não), `valueCents` é inteiro positivo (400 `invalid_value`), `saleDate`
  presente e é uma data válida (400 `invalid_date`).
- `PUT /api/sales/:id` — mesmos campos e validações do POST. 404
  cross-store/inexistente.
- `DELETE /api/sales/:id` — 404 cross-store/inexistente.
- `POST /api/sale-pin/verify` — `{ pin }` → 200 `{ ok: true }` ou 401
  `{ error: 'invalid_pin' }`. Não exige `sale_pin_ok` (é o próprio
  mecanismo que o gera).

Toda rota nova em `app/api/**/route.ts` inclui
`export const dynamic = 'force-dynamic';`, seguindo a convenção já
documentada no README.

## Erros e limites

- PIN incorreto ou env var não configurada pra aquela loja: mesmo erro
  401 `invalid_pin` (não revela qual dos dois aconteceu).
- Cliente/venda de outra loja: 404, nunca vaza existência (mesmo padrão
  cross-store do sub-projeto 1).
- Fora de escopo: cálculo de cashback, saldo, expiração, envio de
  WhatsApp (sub-projeto 3); edição de telefone com validação de formato;
  rate-limit de tentativas de PIN; impedir remoção de cliente com vendas.

## Testes

Testes de integração reais contra Postgres, seguindo o padrão do projeto:

- `lib/salePin.test.ts` — deriva o nome da env var corretamente, detecta
  cookie destravado/travado.
- Testes de rota para `/api/customers*`, `/api/sales*`,
  `/api/sale-pin/verify` — cobrindo: sucesso, escopo por loja (não lista
  cliente/venda de outra loja), isolamento cross-store por id (404),
  bloqueio sem `sale_pin_ok` (401), liberação depois do PIN correto,
  validação de campos obrigatórios/valor/data.
- Testes de página para `/recompensas` e `/recompensas/clientes` —
  formulário de PIN aparece sem cookie, conteúdo aparece com cookie
  válido, fluxo de busca→cadastro inline→seleção de cliente.
