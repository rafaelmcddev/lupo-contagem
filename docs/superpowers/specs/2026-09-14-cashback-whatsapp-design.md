# Cashback: Cálculo, Relatório e WhatsApp (Sub-projeto 3) — Spec

## Contexto

Terceiro e último sub-projeto do programa de recompensas do lupo-contagem (depois de
[store scoping] e [cadastro de clientes + lançamento de vendas], ambos já em
produção). As vendas já são registradas em `/recompensas`; este sub-projeto adiciona
o cálculo do cashback em si, um relatório operacional, e a automação de aviso por
WhatsApp — sem a qual, nas palavras do usuário, "o cashback só funciona se o cliente
lembrar que tem saldo disponível".

## Regras de negócio (já confirmadas em conversas anteriores desta sessão)

- **Percentual**: 5% do valor da venda.
- **Validade**: 30 dias a partir da data da venda.
- **Lembrete automático**: ~5 dias antes de vencer (ou seja, no dia 25 após a
  compra).
- **Texto padrão da mensagem** (usar literalmente, com os placeholders):

  ```
  Olá, %nome%! 👋

  Agradecemos por escolher a loja Up! 💙

  Temos uma boa notícia para você! 🎉

  Sua compra realizada no dia %dia% gerou R$ %cashback% de crédito para desconto em sua próxima compra.

  📅 Você pode utilizar esse valor até: %data_limite%

  É só visitar nossa loja física e aproveitar o seu crédito para pagar menos na sua próxima compra! 😊

  Após essa data, o crédito não poderá mais ser utilizado.

  Esperamos você! 💙
  ```

  Usado tanto para a confirmação de compra quanto para o lembrete (mesmo texto —
  não há uma variação "urgente" separada, isso não foi pedido).

## Decisões desta rodada de brainstorm

- **Cálculo**: recompensa (5% do valor) e data de vencimento (compra + 30 dias) são
  **derivados na hora**, nunca guardados em coluna própria — evita dado duplicado
  que poderia dessincronizar.
- **Envio de WhatsApp — dois modos, com troca automática, sem precisar mexer em
  código**:
  - **Modo API (quando `META_WHATSAPP_TOKEN` e `META_WHATSAPP_PHONE_NUMBER_ID`
    estiverem configurados)**: envio automático de verdade, em segundo plano — a
    confirmação de compra dispara ao registrar a venda (melhor esforço: se a Meta
    falhar, a venda continua sendo registrada normalmente), e o lembrete roda 1x
    por dia via Vercel Cron, verificando vendas de todas as lojas.
  - **Modo fila (enquanto a API não estiver configurada — é o modo em que o
    sistema nasce, já que a conta Meta ainda não existe)**: nenhum envio é
    silencioso, porque não tem como um site controlar outra aba do navegador — essa
    é uma proteção de segurança de todo navegador, não uma limitação deste projeto.
    Em vez disso, a tela `/recompensas` verifica quais mensagens estão pendentes
    (consulta pura ao banco, sem depender do WhatsApp) e mostra uma fila. Cada
    "Processar próxima" abre uma aba do WhatsApp Web (`web.whatsapp.com`) já
    preenchida com número e texto, usando a sessão logada do navegador — a pessoa
    confere e clica em enviar lá dentro. O sistema registra o envio como "aberto"
    (não há como confirmar que o clique de enviar aconteceu de fato dentro do
    WhatsApp Web).
  - A troca de modo é automática: a mesma função que decide "quais mensagens estão
    pendentes" é usada nos dois modos — só muda o que acontece depois (Meta manda
    de verdade vs. fila manual abre o link).
- **Botão manual "Enviar lembrete"** (por venda, na grid de `/recompensas`):
  disponível a qualquer momento, independente do modo — sempre abre o WhatsApp Web
  com o texto de lembrete, não fica esperando os 25 dias.
- **Toggle de cashback utilizado**: campo booleano por venda, com botão pra marcar
  e desmarcar (a funcionária pode ter clicado errado).
- **Relatório de recompensas a vencer**: nova tela, mostrando por padrão o que
  vence nos próximos 10 dias, com filtro de "cashback já utilizado" (padrão: não),
  filtro de intervalo de datas de vencimento, paginação de 20 por página, ordenado
  por data da venda DESC.
- **Limpeza de vendas expiradas**: botão na mesma tela do relatório (já que giram
  em torno do mesmo problema — banco de dados grande demais pro limite gratuito da
  Neon) que faz **hard-delete** das vendas cujo cashback já expirou (mais de 30
  dias), com confirmação explícita antes (`window.confirm`, mesma convenção já
  usada em "Remover cliente?"/"Remover venda?"). Registra um log (data/hora +
  quantidade removida) que sobrevive à própria limpeza.
- **Template da Meta**: para mensagens iniciadas pela loja (não é resposta a uma
  mensagem do cliente), a API oficial da Meta exige que o texto seja pré-cadastrado
  como "template" e aprovado por eles antes de poder ser usado — não dá pra mandar
  texto livre nesse caso. Isso é uma etapa manual, feita pelo usuário no painel da
  Meta (envolve dados da empresa, fora do alcance deste projeto), e pode levar
  alguns dias. Enquanto isso não acontece, o sistema já funciona no modo fila.

## Modelo de dados

### `sales` — uma coluna nova

```sql
ALTER TABLE "sales" ADD COLUMN "cashback_used" boolean NOT NULL DEFAULT false;
```

### `whatsapp_sends` — nova tabela (log de envios)

```ts
export const whatsappSendType = pgEnum('whatsapp_send_type', ['purchase', 'reminder']);
export const whatsappSendStatus = pgEnum('whatsapp_send_status', ['sent', 'opened', 'failed']);

export const whatsappSends = pgTable('whatsapp_sends', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull().references(() => stores.id),
  saleId: integer('sale_id').references(() => sales.id, { onDelete: 'set null' }),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  type: whatsappSendType('type').notNull(),
  status: whatsappSendStatus('status').notNull(),
  trigger: text('trigger').notNull(), // 'auto' | 'queue' | 'manual'
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});
```

`saleId` é `ON DELETE SET NULL` (não `cascade`) — a limpeza de vendas expiradas faz
hard-delete de `sales`, mas o log de envios deve sobreviver a isso (é um histórico
de auditoria, não um dado derivado da venda). `customerName`/`customerPhone` ficam
duplicados no log de propósito (snapshot no momento do envio), pra que o log
continue legível mesmo depois que a venda (e potencialmente o registro de envio
associado a ela) tenha sido limpa.

`status`: `'sent'` (Meta confirmou o envio via API), `'opened'` (aba do WhatsApp
Web foi aberta — modo fila ou botão manual, sem confirmação de envio real),
`'failed'` (Meta retornou erro). Não existe status "não configurado" — nesse caso
a mensagem nem chega a virar uma linha de `whatsapp_sends`, ela aparece como
pendente até alguém processá-la pela fila.

`trigger`: `'auto'` (Modo API, automático), `'queue'` (Modo fila, processado via
`/recompensas`), `'manual'` (botão "Enviar lembrete" clicado a qualquer momento).

### `cashback_cleanup_log` — nova tabela

```ts
export const cashbackCleanupLog = pgTable('cashback_cleanup_log', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull().references(() => stores.id),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
  rowsDeleted: integer('rows_deleted').notNull(),
});
```

## Regras derivadas (sem coluna própria)

- `rewardCents = Math.round(valueCents * 0.05)`
- `expiresAt = saleDate + 30 dias`
- Uma venda está "prestes a vencer" quando `hoje` está entre `saleDate + 20 dias` e
  `saleDate + 30 dias` (janela padrão do relatório).
- Um lembrete está "devido" quando `hoje >= saleDate + 25 dias`, `cashback_used =
  false`, `hoje < saleDate + 30 dias` (não faz sentido lembrar de algo já vencido),
  e não existe linha em `whatsapp_sends` com `saleId` = essa venda e `type =
  'reminder'`.
- Uma confirmação de compra está "devida" quando não existe nenhuma linha em
  `whatsapp_sends` com `saleId` = essa venda e `type = 'purchase'`.
- Uma venda está "expirada pra limpeza" quando `hoje >= saleDate + 30 dias` —
  independente de `cashback_used` (uma vez vencida, o registro não serve mais pro
  propósito do programa, seja porque foi usada ou porque expirou sem uso).

## Endpoints novos/alterados

- `PUT /api/sales/:id` — passa a aceitar também `cashbackUsed: boolean` no corpo
  (além dos campos que já existem), atualizando só esse campo quando for o único
  enviado pelo toggle da UI.
- `GET /api/whatsapp/pending` — retorna as confirmações de compra e lembretes
  devidos (por definição acima) da loja atual, cada um já com o texto da mensagem
  montado e o telefone formatado pra link do WhatsApp Web.
- `POST /api/whatsapp/pending/:type/:saleId/mark-opened` — registra uma linha em
  `whatsapp_sends` com `status: 'opened'`, `trigger: 'queue'` — chamado pelo
  frontend depois de abrir a aba do WhatsApp Web pra aquela mensagem específica.
- `POST /api/sales/:id/send-reminder` — botão manual: monta o texto de lembrete
  pra aquela venda, registra `whatsapp_sends` com `status: 'opened'`, `trigger:
  'manual'`, retorna a URL do WhatsApp Web pro frontend abrir.
- `GET /api/whatsapp-sends?...` — não é necessário nesta spec (não foi pedido um
  histórico de envios navegável na UI, só o log em si existir no banco — YAGNI).
- `GET /api/rewards/expiring?from=&to=&cashbackUsed=&page=&pageSize=` — o
  relatório: lista vendas com `expiresAt` dentro do intervalo (padrão: hoje até
  hoje+10 dias), filtrando por `cashback_used` quando informado, paginado (padrão
  20), ordenado por `sale_date DESC`. Retorna `saleDate`, `customerName`,
  `valueCents`, `rewardCents`, `cashbackUsed`, `expiresAt`.
- `POST /api/rewards/cleanup-expired` — hard-delete de toda venda "expirada pra
  limpeza" (definição acima) da loja atual; grava uma linha em
  `cashback_cleanup_log` com a contagem; retorna `{ rowsDeleted }`.
- `GET /api/rewards/cleanup-log` — lista o histórico de limpezas da loja (data/hora
  + quantidade), sem paginação (não deve crescer rápido — uma limpeza é uma ação
  ocasional, não por venda).
- `GET /api/cron/reward-reminders` — rota do Vercel Cron, 1x/dia. Verifica
  `META_WHATSAPP_TOKEN`/`META_WHATSAPP_PHONE_NUMBER_ID` — se não configurados,
  retorna 200 sem fazer nada (modo fila está ativo, esta rota fica dormente).
  Protegida por `CRON_SECRET` (cabeçalho `Authorization: Bearer <CRON_SECRET>`,
  como o Vercel Cron já envia nativamente). Se configurado, percorre lembretes
  devidos de **todas** as lojas (rota de cron não tem cookie de loja — usa o
  `storeId` de cada venda), envia via Meta, grava `whatsapp_sends` com `status:
  'sent'` ou `'failed'`, `trigger: 'auto'`.

`POST /api/sales` (já existe) passa a, depois de criar a venda com sucesso: se o
Modo API estiver configurado, tentar o envio de confirmação de compra (melhor
esforço — falha no WhatsApp não derruba a resposta da criação da venda); grava
`whatsapp_sends`. Se não estiver configurado, não faz nada aqui — a confirmação
vira "devida" e aparece na fila da próxima vez que `/recompensas` for aberta.

## `lib/whatsapp.ts` — abstração de envio

```ts
export function isWhatsAppApiConfigured(): boolean {
  return Boolean(process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID);
}

export function buildRewardMessage(params: {
  customerName: string;
  saleDateBR: string; // já formatado dd/mm/yyyy
  rewardBRL: string; // já formatado "45,90"
  expiresAtBR: string; // já formatado dd/mm/yyyy
}): string { /* substitui %nome%, %dia%, %cashback%, %data_limite% no texto padrão */ }

export function buildWhatsAppWebUrl(phone: string, text: string): string {
  // https://web.whatsapp.com/send?phone=55<ddd><numero>&text=<encodeURIComponent(text)>
}

export async function sendViaMetaApi(phone: string, templateParams: string[]): Promise<{ ok: boolean; error?: string }> {
  // POST https://graph.facebook.com/v18.0/<PHONE_NUMBER_ID>/messages
  // Authorization: Bearer <META_WHATSAPP_TOKEN>
  // Corpo referenciando o nome do template aprovado + os parâmetros posicionais
  // (nome do template em outra env var, META_WHATSAPP_TEMPLATE_NAME, já que o
  // nome exato só existe depois da aprovação da Meta)
}
```

Testado via mock de `fetch` (mesmo padrão já usado nos testes de rota deste
projeto) — não depende de credenciais reais pra rodar `npm test`.

## Telas

### `/recompensas` (já existe) — alterações

- Ao digitar o valor da venda no formulário de registro, mostrar ao lado/abaixo o
  valor da recompensa calculada em tempo real (`formatCentsAsBRL(Math.round(valueCents * 0.05))`).
- Nova coluna "Recompensa" na tabela de vendas lançadas, entre "Valor" e "Ações".
- Nova coluna/indicador "Cashback usado" com um botão de toggle (usa o mesmo padrão
  visual de botão compacto com ícone já estabelecido no resto do app).
- Novo botão "Enviar lembrete" por linha (ícone, `size="sm"`), ao lado de
  Editar/Remover.
- Se houver mensagens pendentes (Modo fila ativo) — uma faixa/seção no topo da
  página: "N mensagens pendentes" com um botão "Processar próxima", que chama
  `GET /api/whatsapp/pending`, abre a URL do WhatsApp Web da primeira pendente numa
  aba nova, chama `mark-opened`, e atualiza a contagem. Em Modo API, essa seção
  simplesmente não aparece (a lista de pendentes vem sempre vazia, já que os envios
  já aconteceram automaticamente).

### `/recompensas/relatorio` (nova)

- Tabela (usando o componente `Table` já existente): Data da compra, Cliente, Valor
  da compra, Valor da recompensa, Vence em, Cashback usado.
- Filtros: select "Cashback já utilizado?" (Não [padrão] / Sim / Todos), dois
  campos de data ("Vencimento de" / "Vencimento até", pré-preenchidos com hoje e
  hoje+10).
- Paginação de 20, ordenado por data da venda DESC (fixo, não é um seletor de
  ordenação como em `/recompensas` — não foi pedido).
- Seção "Limpeza de vendas expiradas": botão destrutivo (variant danger) com
  confirmação mostrando a contagem esperada antes de confirmar, e logo abaixo o
  histórico de limpezas já feitas (data/hora + quantidade), sem paginação.
- Link de/para `/recompensas` no cabeçalho, seguindo o padrão já usado entre
  `/recompensas` e `/recompensas/clientes`.
- Atrás do mesmo `PinGate` das outras telas de recompensas.

### Nav

`components/ui/Nav.tsx` não precisa de um link novo no menu principal — o acesso ao
relatório é via link dentro de `/recompensas` (mesmo padrão do link "Gerenciar
clientes").

## Variáveis de ambiente novas

```
META_WHATSAPP_TOKEN=
META_WHATSAPP_PHONE_NUMBER_ID=
META_WHATSAPP_TEMPLATE_NAME=
CRON_SECRET=
```

Todas opcionais em desenvolvimento/enquanto a conta Meta não existe — a ausência de
qualquer uma delas mantém o sistema em Modo fila. `.env.example` documenta as
quatro, com um comentário explicando que ficam vazias até o cadastro na Meta ser
concluído.

## `vercel.json` — configuração do Cron

```json
{
  "crons": [
    { "path": "/api/cron/reward-reminders", "schedule": "0 12 * * *" }
  ]
}
```
(Meio-dia UTC ≈ 8h/9h horário de Campo Grande, dependendo do horário de verão —
horário razoável pra já ter movimento na loja antes de qualquer lembrete manual do
dia.)

## Fora de escopo (explicitamente, pra não crescer sem pedido)

- Não há tela de histórico navegável de `whatsapp_sends` — só o dado existir no
  banco, auditável via SQL se um dia for preciso.
- Não há retry automático de mensagens que falharam no Modo API — falha vira
  `status: 'failed'` no log; reenviar é uma ação manual (o botão "Enviar lembrete"
  cobre isso, já que ele funciona independente do motivo do lembrete original ter
  falhado ou nunca ter sido tentado).
- Não há mensagem de texto diferente pro lembrete vs. a confirmação de compra —
  mesmo texto padrão pras duas situações, como já confirmado.
- Não há configuração de número de WhatsApp por loja — uma única conta/número
  Meta serve as duas lojas (Coxim-MS, Campo Grande-MS); se isso precisar mudar no
  futuro, é uma extensão pequena (adicionar `storeId` na resolução do
  `PHONE_NUMBER_ID`), não bloqueia esta spec.
- Não há paginação no histórico de limpezas (`cashback_cleanup_log`) — ação rara,
  lista deve ficar sempre pequena.
