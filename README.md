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

## Lojas (Coxim-MS e Campo Grande-MS)

O sistema roda para duas lojas físicas. Ao abrir qualquer página sem uma loja escolhida, o usuário é redirecionado para `/loja` — a escolha fica salva num cookie `store_id` no navegador (sem expiração curta), e "Trocar loja" no menu limpa esse cookie. Contagens, Produtos (SKUs) e Grupos são independentes por loja; Configurações (prefixo de grupo, exigir SKU) é global para as duas.

As duas lojas nascem via seed na migração `db/migrations/0004_*.sql` — abrir uma terceira loja hoje é um `INSERT` manual na tabela `stores`, sem UI de administração (fora do escopo atual).

## Programa de recompensa: clientes e vendas

`/recompensas` registra vendas (cliente, data, valor) pro programa de cashback — sem produto, já que a venda em si continua sendo lançada no sistema de vendas da loja. A tela busca clientes já cadastrados (com opção de cadastrar um novo na hora, telefone com máscara `(00) 00000-0000` e DDD local pré-preenchido) e lista as vendas já lançadas naquela loja, 20 por página, ordenadas por compra mais recente (com opção de ordenar por nome do cliente). `/recompensas/clientes` gerencia o cadastro de clientes separadamente.

### PIN de acesso — o que é e onde ver/trocar

Ambas as telas ficam atrás de um PIN por loja — **não é controle de usuário** (não sabe quem lançou o quê), só uma trava simples contra acesso por pessoas de fora. O PIN de cada loja é uma variável de ambiente, nome derivado do slug: `SALE_PIN_COXIM_MS`, `SALE_PIN_CAMPO_GRANDE_MS`. Digitar o PIN uma vez destrava o dispositivo pra aquela loja (cookie perene) até trocar de loja ou limpar os cookies.

Pra ver ou trocar o PIN de produção: painel da Vercel → o projeto → **Settings → Environment Variables** → procure `SALE_PIN_COXIM_MS`/`SALE_PIN_CAMPO_GRANDE_MS`. A Vercel mostra o valor já salvo ali (ou permite revelar). Se trocar o valor, é preciso fazer um novo deploy pra pegar — env vars não atualizam um deploy já publicado sozinhas.

### Cálculo do cashback

A recompensa é **5% do valor da venda**, válida por **30 dias** a partir da data da compra — calculada na hora, em toda tela que precisa dela (o valor nunca fica guardado numa coluna própria, pra nunca dessincronizar). A lógica inteira vive em `lib/rewards.ts` (`calculateRewardCents`, `calculateExpiresAt`) — é o único lugar que sabe esses dois números; se o percentual ou o prazo mudar um dia, é só ali.

Cada venda tem um campo "cashback usado" (booleano, `sales.cashback_used`) — o botão "Marcar como usado"/"Desmarcar" em `/recompensas` deixa a funcionária corrigir na hora se clicar errado. Não afeta o cálculo nem o vencimento, só o status pro relatório.

### Avisos por WhatsApp: como funciona hoje, e como ligar o modo automático

O aviso ao cliente (mensagem de "você ganhou cashback") funciona em **dois modos**, trocados **automaticamente** pela presença de três variáveis de ambiente — `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID` e `META_WHATSAPP_TEMPLATE_NAME` — sem precisar mexer em nenhuma linha de código pra trocar de um modo pro outro:

**Modo fila (é o modo atual, enquanto as 3 variáveis não existem):**

Como nenhum site consegue controlar o que acontece dentro de outro (proteção de segurança de todo navegador, não uma limitação deste projeto), não tem como o sistema mandar a mensagem sozinho sem a API oficial. Em vez disso, `/recompensas` mostra uma faixa "N mensagens pendentes" sempre que existir uma confirmação de compra ou um lembrete (5 dias antes de vencer os 30) ainda não tratado. Cada clique em **"Processar próxima"** abre uma aba nova do WhatsApp Web (`web.whatsapp.com`) já com o número e o texto preenchidos, usando a sessão que já estiver logada no navegador — a funcionária só confere e clica em **Enviar** dentro do próprio WhatsApp. O botão **"Enviar lembrete"** (na linha de cada venda) faz a mesma coisa a qualquer momento, sem depender dos 5 dias.

**Modo automático (liga sozinho assim que as 3 variáveis existirem):**

- A confirmação de compra sai na hora, ao registrar a venda.
- O lembrete roda sozinho, uma vez por dia, via **Vercel Cron** (configurado em `vercel.json`, rota `GET /api/cron/reward-reminders`, protegida por uma quarta variável, `CRON_SECRET`, pra ninguém mais conseguir chamar essa rota).
- A fila manual desaparece sozinha (deixa de mostrar qualquer coisa, já que os envios acontecem em segundo plano).

**Passo a passo pra ativar o modo automático, quando for a hora:**

1. Criar/acessar uma conta no [Meta for Developers](https://developers.facebook.com/) e configurar o **WhatsApp Business Platform** pra essa conta.
2. Verificar um número de telefone comercial (o número que vai aparecer pro cliente como remetente da mensagem).
3. Cadastrar o texto abaixo como **template de mensagem** no painel da Meta, e esperar a aprovação (a Meta exige isso pra qualquer mensagem que a loja inicia sem o cliente ter escrito antes — pode levar de horas a alguns dias):

   ```
   Olá, {{1}}! 👋

   Agradecemos por escolher a loja Up! 💙

   Temos uma boa notícia para você! 🎉

   Sua compra realizada no dia {{2}} gerou {{3}} de crédito para desconto em sua próxima compra.

   📅 Você pode utilizar esse valor até: {{4}}

   É só visitar nossa loja física e aproveitar o seu crédito para pagar menos na sua próxima compra! 😊

   Após essa data, o crédito não poderá mais ser utilizado.

   Esperamos você! 💙
   ```

   (`{{1}}` = nome do cliente, `{{2}}` = data da compra, `{{3}}` = valor do cashback, `{{4}}` = data limite — nessa ordem; é o mesmo texto usado no modo fila, só que lá os `{{N}}` já vêm substituídos direto no link do WhatsApp Web.)
4. Depois de aprovado, pegar na Meta: o **token de acesso** permanente, o **Phone Number ID**, e o **nome exato do template** que você cadastrou.
5. No painel da Vercel → o projeto → **Settings → Environment Variables**, adicionar:
   - `META_WHATSAPP_TOKEN`
   - `META_WHATSAPP_PHONE_NUMBER_ID`
   - `META_WHATSAPP_TEMPLATE_NAME`
   - `CRON_SECRET` (qualquer texto longo/aleatório — é só uma senha interna pra rota do cron, não vem da Meta)
6. Fazer um novo deploy (env vars só entram em vigor no próximo deploy publicado).

Todo o código do envio (`lib/whatsapp.ts`, incluindo a chamada à API da Meta) já está pronto e testado esperando essas variáveis — não precisa programar nada, só cadastrar a conta e configurar.

### Relatório de recompensas a vencer e limpeza de vendas antigas

`/recompensas/relatorio` lista as vendas cujo cashback vence nos próximos 10 dias (padrão — dá pra abrir o intervalo de data), com filtro de "cashback já utilizado". Nessa mesma tela fica o botão **"Limpar vendas com cashback expirado"** — apaga permanentemente (não é soft-delete) as vendas com mais de 30 dias, já que o plano gratuito da Neon tem limite de tamanho de banco; mostra quantas vendas serão apagadas antes de confirmar, e guarda um histórico (só data/hora + quantidade) de cada limpeza já feita, embaixo do botão.

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

## Convenção: nunca aninhar `<form>`

`RecompensasPage` (lançamento de venda) embrulha a tela inteira num `<form>`; qualquer componente usado ali dentro (como `CustomerPicker`, com seu cadastro inline de cliente) **não pode** ter seu próprio `<form>` — HTML não permite `<form>` dentro de `<form>`. Isso passa despercebido em testes de componente (que renderizam só no client, sem passar pelo parser HTML de verdade), mas quebra de verdade na página real: o Next.js faz SSR, o navegador parseia o HTML recebido e corrige a estrutura inválida sozinho, silenciosamente — o que faz o botão de submit do form interno simplesmente parar de funcionar, sem erro nenhum no console além de um aviso de hidratação fácil de ignorar. Um componente pensado pra ser usado dentro de outro formulário deve disparar sua ação via um botão `type="button"` + `onClick`, nunca via `<form onSubmit>`.

## Câmera: feedback sem depender de áudio

`speechSynthesis` não é confiável enquanto a câmera fica decodificando frames em segundo plano (em qualquer navegador/aparelho, não é uma limitação específica do iOS Safari) — o áudio pode simplesmente não sair, mesmo com o `unlockSpeech()` já disparado por um gesto do usuário. Por isso a leitura via câmera (`components/CameraScanner.tsx`) nunca depende só do som:
- vibração + contorno verde a cada código lido, imediatamente, antes mesmo da resposta do servidor;
- ao confirmar em qual caixa o item entrou, um overlay grande (`Caixa N`) cobre boa parte da tela por ~3s, com uma vibração diferente;
- a tentativa de falar por voz continua acontecendo (com `cancel()` antes de cada fala e um `resume()` periódico pra contornar o bug conhecido de navegadores que pausam a fila de voz sozinhos), mas é tratada como bônus, nunca como o único feedback.

## Limitações conhecidas

- Sem login — intencional, conforme o spec.
- O catálogo de Grupos hoje só suporta adicionar/remover pela UI, não renomear (o endpoint de rename existe e está testado; falta ligar isso em `app/groups/page.tsx` — é um follow-up pequeno).
- O agrupamento por prefixo de código de barras (`getPrefixLength`/`lib/prefix.ts`, fixo em 7 dígitos por padrão) existe internamente mas não tem UI própria — na prática o app funciona igual com ou sem essa parte.
- O `middleware.ts` que garante a seleção de loja só valida que o cookie `store_id` é numérico — ele roda no runtime Edge do Next.js, que não suporta o driver `pg` usado pelo projeto, então não consulta o banco para confirmar que a loja ainda existe. Como não há UI para remover uma loja, isso não é um problema na prática hoje.

