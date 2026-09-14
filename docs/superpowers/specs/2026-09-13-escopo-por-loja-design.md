# Escopo por loja (sub-projeto 1 de 3: programa de recompensa)

Este é o primeiro de três sub-projetos que juntos implementam um programa de
recompensa (cashback) simples no lupo-contagem:

1. **Escopo por loja** (este spec) — infraestrutura de multi-loja: tela de
   seleção de município na entrada do sistema, e todo o app passa a operar
   dentro de uma loja escolhida.
2. Cadastro de cliente + lançamento de venda do programa de recompensa
   (spec futuro).
3. Cashback (saldo, expiração) + automação de WhatsApp (spec futuro).

Os sub-projetos 2 e 3 dependem deste. Este spec cobre **apenas** o escopo
por loja.

## Contexto

O lupo-contagem hoje é um sistema sem login (intencional), single-tenant,
usado numa única loja. O negócio passará a rodar o mesmo sistema em duas
lojas físicas: **Coxim-MS** e **Campo Grande-MS**. Antes de existir
qualquer dado de recompensa, o sistema precisa saber "em qual loja" o
dispositivo está operando, e os dados de estoque (contagens, produtos,
grupos) das duas lojas não podem se misturar.

## Decisões

- **Escopo**: vale para o app inteiro — Contagens, Produtos (SKUs) e
  Grupos passam a ser filtrados por loja, além do futuro programa de
  recompensa. `Configurações` (prefixo de grupo, exigir SKU) continua
  única/global para as duas lojas.
- **Dados existentes**: todo o histórico atual (contagens, skus, groups)
  é migrado para a loja **Coxim-MS**.
- **Catálogo por loja**: Produtos e Grupos são **independentes** entre as
  lojas (cada loja tem seu próprio cadastro, sem visibilidade cruzada).
- **Modelo de loja**: tabela `stores` (não um enum fixo), para permitir
  adicionar lojas no futuro sem deploy de código — ainda que, por ora, a
  criação de uma nova loja seja feita via `INSERT` manual, sem UI de
  admin (fora de escopo).
- **Persistência da escolha**: cookie no navegador do dispositivo,
  perene (sem expiração curta). Um item "Trocar loja" na navegação limpa
  o cookie e volta para a tela de seleção.
- **Abordagem técnica**: cookie + `middleware.ts` do Next.js. As URLs das
  páginas/rotas existentes não mudam (rejeitada a alternativa de loja na
  URL, ex. `/coxim/products`, por exigir refactor bem maior sem benefício
  claro agora).

## Modelo de dados

Nova tabela:

```
stores
  id     serial PK
  name   text        -- "Coxim-MS", "Campo Grande-MS"
  slug   text unique  -- "coxim-ms", "campo-grande-ms"
```

Seed (via migração): insere as duas lojas.

Colunas novas:

- `countings.store_id integer not null references stores(id)`
- `skus.store_id integer not null references stores(id)`
- `groups.store_id integer not null references stores(id)`

`boxes`, `scans` e `invoice_items` **não** ganham `store_id` próprio —
herdam a loja através da FK (`counting_id` / `box_id`).

Índices únicos que precisam mudar de globais para compostos por loja:

- `skus.barcode` (hoje PK) → único por `(store_id, barcode)`. Dois
  códigos de barras iguais podem existir em lojas diferentes, apontando
  para produtos diferentes.
- `groups.prefix` (hoje único) → único por `(store_id, prefix)`.

### Migração

1. Cria `stores`; insere `Coxim-MS` (slug `coxim-ms`) e
   `Campo Grande-MS` (slug `campo-grande-ms`).
2. Adiciona `store_id` como nullable em `countings`, `skus`, `groups`.
3. `UPDATE` setando `store_id` = id de Coxim-MS em todas as linhas
   existentes das três tabelas.
4. Altera as três colunas para `NOT NULL`.
5. Ajusta os índices únicos de `skus.barcode` e `groups.prefix` para
   incluir `store_id`.

## Fluxo de seleção de loja

- **Página `/loja`**: lista as lojas (via `GET /api/stores`), um botão
  grande por loja (sem imagens — texto apenas: "COXIM-MS" / "CAMPO
  GRANDE-MS"). Clicar grava o cookie `store_id` (client-side, via
  `document.cookie`, `path=/`, sem data de expiração curta) e
  redireciona para `/`. Não precisa de uma rota de API própria só para
  gravar o cookie.
- **`middleware.ts`**: intercepta toda requisição, exceto `/loja`,
  `/api/stores`, e assets estáticos do Next (`_next/*`, etc). Se o
  cookie `store_id` não existir ou não for um número, redireciona para
  `/loja`. **Limitação de runtime**: o middleware do Next.js roda em
  Edge por padrão, que não suporta o driver `pg` usado pelo projeto —
  por isso o middleware **não** consulta o banco para confirmar que o
  id ainda existe em `stores`; ele só valida o formato do cookie. Uma
  loja removida do banco (cenário que hoje nem é possível pela UI,
  fora de escopo) não é detectada aqui — as rotas de API, essas sim
  rodando em Node.js, são a fonte de verdade para a existência da loja.
- **`lib/store.ts`**: `getStoreIdFromRequest(req: Request)` — helper
  que lê o cookie diretamente do header `Cookie` da request recebida
  (não usa `next/headers`, para funcionar igual tanto numa request real
  quanto num `new Request(...)` construído em teste). Usado dentro das
  API routes para filtrar/gravar dados. Lança `StoreNotSelectedError`
  se o cookie não existir — não deveria acontecer em uso normal, já que
  o middleware garante o cookie antes de qualquer rota ser alcançada
  por um navegador real.
- **"Trocar loja"**: novo item em `components/ui/Nav.tsx` que limpa o
  cookie e navega para `/loja`.

## Mudanças nas rotas existentes

Toda API route e Server Component que hoje lê/grava em `countings`,
`skus` ou `groups` passa a:

- Filtrar todas as leituras (`SELECT`/`WHERE`) por `store_id = getStoreId()`.
- Gravar `store_id: getStoreId()` em todo `INSERT`.

Isso afeta, entre outras: `/api/countings*`, `/api/countings/import-xml`,
`/api/products*`, `/api/groups*`, e as páginas correspondentes
(`app/countings`, `app/products`, `app/groups`, `app/history`,
`app/page.tsx`).

## Erros e limites

- Cookie ausente ou não-numérico → middleware redireciona para `/loja`
  (ver limitação de runtime na seção anterior).
- **Acesso cruzado entre lojas por id**: rotas que recebem um id de
  recurso (`GET/DELETE /api/countings/:id`, `POST
  /api/countings/:id/scan`, `POST /api/countings/:id/finish`, `PUT/DELETE
  /api/products/:barcode`, `PUT/DELETE /api/groups/:id`) devem retornar
  `404` (o mesmo erro de "não encontrado" já usado hoje) quando o
  recurso pertence a uma loja diferente da do cookie atual — não deve
  ser possível descobrir ou manipular dado de outra loja sabendo o id.
- Fora de escopo: UI de cadastro/edição de lojas (a 3ª loja, se um dia
  existir, nasce via `INSERT` manual).
- Fora de escopo: qualquer coisa de cliente, venda ou cashback —
  cobertos pelos sub-projetos 2 e 3.

## Nova rota de API

- `GET /api/stores` — lista as lojas cadastradas (`id`, `name`, `slug`),
  ordenadas por nome. Único endpoint acessível sem o cookie de loja
  (junto com a própria página `/loja`), usado pela tela de seleção.

## Testes

Seguindo o padrão do projeto (testes de integração reais contra
Postgres, sem mocks):

- `lib/store.test.ts` — cobre `getStoreId()`.
- Testes do `middleware.ts` — redirect sem cookie / com cookie inválido,
  passagem livre com cookie válido.
- Atualizar os testes existentes de `countings`, `products`/`skus` e
  `groups` para operar com um `store_id` (cookie simulado na request de
  teste), incluindo o caso de dois registros com o mesmo
  `barcode`/`prefix` em lojas diferentes coexistindo.
