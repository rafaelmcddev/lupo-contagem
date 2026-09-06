# Lupo Contagem

Ferramenta interna, sem login, para contar por código de barras as peças de produtos que chegam numa entrega — o leitor identifica o grupo pelo prefixo do código de barras e atribui automaticamente uma "Caixa" a cada grupo, somando o total em tempo real.

Duas formas de abrir uma contagem:
- **Importando o XML da NF-e** da entrega — a nota é lida automaticamente (produtos, código de barras, SKU e quantidade), o catálogo de produtos é atualizado e a contagem já nasce vinculada à nota, mostrando uma conferência **esperado × contado** por produto conforme o bipe acontece.
- **Manualmente**, sem nota nenhuma (ex: contagem geral da loja).

## Setup local

```bash
docker compose up -d       # sobe o Postgres local e cria o banco de teste (docker/init.sql)
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

## Rodando os testes

```bash
npm test
```

Requer o mesmo Postgres local rodando (`docker compose up -d`) — a maioria dos testes são de integração reais contra o banco, não mocks. Os testes rodam sequencialmente (`fileParallelism: false` no `vitest.config.ts`) porque compartilham um único banco, limpo via `TRUNCATE` entre testes.

## Deploy

Stack de produção: **Vercel** + **Neon** (Postgres), conforme a arquitetura do spec.

- Defina `DATABASE_URL` com a connection string **pooled** da Neon (a que tem `-pooler` no hostname), não a direta — `db/client.ts` cria um `pg.Pool` por instância de função serverless, e a string direta esgota o limite de conexões da Neon sob carga.
- Rode `npm run db:migrate` contra o `DATABASE_URL` de produção antes/depois de qualquer deploy que altere `db/schema.ts`. Não há passo automático de migração no deploy ainda — é manual. Se não tiver acesso direto ao banco de onde estiver fazendo o deploy (ex: rede restrita), a alternativa é rodar o SQL da migração direto no **SQL Editor** do console do Neon — o conteúdo de cada arquivo em `db/migrations/*.sql` é idempotente o suficiente pra colar e rodar com segurança.
- O plano gratuito da Vercel tem limite de deploys — junte várias alterações num commit só antes de dar push, em vez de ir empurrando aos poucos.

## Importação de XML de NF-e

- `lib/parseNfeXml.ts` lê o XML (com ou sem o envelope `nfeProc`), extrai `nNF`, `emit.xNome` e, de cada `<det><prod>`, o código de barras (`cEAN`, com fallback pra `cEANTrib` quando `cEAN` vem como `SEM GTIN`), o SKU (`cProd`), o nome (`xProd`) e a quantidade (`qCom`). Itens com o mesmo código de barras em `<det>` diferentes são somados.
- `POST /api/countings/import-xml` usa esse parser pra criar a contagem (`source: 'xml'`, com `invoiceNumber`/`supplierName` preenchidos), atualizar o catálogo (`skus`) e gravar as quantidades esperadas em `invoice_items`.
- `GET /api/countings/:id` calcula, pra contagens de origem XML, o `invoiceCheck`: por produto, quanto era esperado (da nota) x quanto já foi contado (via `scans`).

## Convenção: novas rotas de API

Toda rota em `app/api/**/route.ts` **precisa** exportar `export const dynamic = 'force-dynamic';`. Sem isso, o Next.js às vezes otimiza estaticamente um handler `GET` em build time (congelando a resposta e quebrando os outros métodos HTTP daquele mesmo path) — um problema invisível em `npm run dev` e em testes que chamam o route handler isoladamente; só aparece rodando `npm run build && npx next start`. `app/api/dynamicConfig.test.ts` garante isso automaticamente para todo arquivo de rota (falha o `npm test` se faltar), mas vale entender o porquê já que o teste sozinho não explica.

## Convenção: formulários de criação

Todo formulário que cria um registro (nova contagem, novo produto, novo grupo) guarda um `useRef` booleano (ex: `creatingRef`) checado no início do handler de submit, além do `useState` que desabilita visualmente o botão. Só o `useState` não basta: dois cliques/toques rápidos disparam dois `submit` antes do primeiro re-render desabilitar o botão, criando registros duplicados — o `ref` bloqueia isso de forma síncrona. Ao adicionar um novo formulário de criação, replique o padrão.

## Câmera: feedback sem depender de áudio

`speechSynthesis` não é confiável enquanto a câmera fica decodificando frames em segundo plano (em qualquer navegador/aparelho, não é uma limitação específica do iOS Safari) — o áudio pode simplesmente não sair, mesmo com o `unlockSpeech()` já disparado por um gesto do usuário. Por isso a leitura via câmera (`components/CameraScanner.tsx`) nunca depende só do som:
- vibração + contorno verde a cada código lido, imediatamente, antes mesmo da resposta do servidor;
- ao confirmar em qual caixa o item entrou, um overlay grande (`Caixa N`) cobre boa parte da tela por ~3s, com uma vibração diferente;
- a tentativa de falar por voz continua acontecendo (com `cancel()` antes de cada fala e um `resume()` periódico pra contornar o bug conhecido de navegadores que pausam a fila de voz sozinhos), mas é tratada como bônus, nunca como o único feedback.

## Limitações conhecidas

- Sem login — intencional, conforme o spec.
- O catálogo de Grupos hoje só suporta adicionar/remover pela UI, não renomear (o endpoint de rename existe e está testado; falta ligar isso em `app/groups/page.tsx` — é um follow-up pequeno).
- O agrupamento por prefixo de código de barras (`getPrefixLength`/`lib/prefix.ts`, fixo em 7 dígitos por padrão) existe internamente mas não tem UI própria — na prática o app funciona igual com ou sem essa parte.

