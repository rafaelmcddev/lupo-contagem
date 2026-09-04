# Lupo Contagem

Ferramenta interna, sem login, para contar por código de barras as peças de produtos Lupo que chegam numa entrega — o leitor identifica o grupo pelo prefixo do código de barras e atribui automaticamente uma "Caixa" a cada grupo, somando o total em tempo real.

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
- Rode `npm run db:migrate` contra o `DATABASE_URL` de produção antes/depois de qualquer deploy que altere `db/schema.ts`. Não há passo automático de migração no deploy ainda — é manual.

## Convenção: novas rotas de API

Toda rota em `app/api/**/route.ts` **precisa** exportar `export const dynamic = 'force-dynamic';`. Sem isso, o Next.js às vezes otimiza estaticamente um handler `GET` em build time (congelando a resposta e quebrando os outros métodos HTTP daquele mesmo path) — um problema invisível em `npm run dev` e em testes que chamam o route handler isoladamente; só aparece rodando `npm run build && npx next start`. `app/api/dynamicConfig.test.ts` garante isso automaticamente para todo arquivo de rota (falha o `npm test` se faltar), mas vale entender o porquê já que o teste sozinho não explica.

## Limitações conhecidas

- Sem login — intencional, conforme o spec.
- O catálogo de Grupos hoje só suporta adicionar/remover pela UI, não renomear (o endpoint de rename existe e está testado; falta ligar isso em `app/groups/page.tsx` — é um follow-up pequeno).
- O Histórico ainda não mostra o total de cada contagem (só nome + data).
- Anúncios por voz não foram verificados no iOS Safari, que exige que a primeira chamada a `speechSynthesis.speak()` venha de um gesto do usuário — vale testar num iPhone de verdade antes de confiar nisso na loja.
