# Lupo Contagem — Design

**Status:** aprovado, pronto para plano de implementação
**Data:** 2026-09-03

## Contexto e problema

Uma loja de produtos da marca Lupo recebe entregas com milhares de modelos
diferentes (ex: cuecas em muitas cores/tamanhos). Para conferir a nota
fiscal, é preciso contar manualmente quantas peças de cada "grupo" de
produto chegaram — hoje isso é feito olhando o início do código de barras
pra identificar o grupo (o restante do código varia por tamanho/cor, o que
é irrelevante pra essa contagem) e separando fisicamente as peças em caixas
por grupo. É um processo exaustivo e manual que consome muitas horas.

A ideia é automatizar a contagem: ao escanear cada peça, o sistema identifica
o grupo pelo prefixo do código de barras, atribui automaticamente uma "Caixa"
(numerada) a cada grupo novo encontrado, e vai incrementando o total de cada
caixa a cada leitura — eliminando a necessidade de contar manualmente ao
final.

## Requisitos e decisões de escopo

- **Sem login.** Sistema simples, qualquer pessoa na loja pode usar.
- **Leitura dupla:** leitor de código de barras físico (USB/Bluetooth, atua
  como teclado — "HID") **e** câmera do celular via navegador, como
  alternativa quando não há leitor físico à mão.
- **Tamanho do prefixo configurável.** Ainda não se sabe com certeza quantos
  dígitos iniciais do código de barras da Lupo definem o grupo — em vez de
  travar essa regra agora, o sistema permite ajustar esse número numa tela
  de configuração, e valida/ajusta na prática.
- **Múltiplas pessoas podem contar ao mesmo tempo, em contagens
  independentes com nome livre** (ex: "Entrega Lupo 03/09"). Qualquer pessoa
  pode abrir uma contagem já em andamento e continuar escaneando nela — não
  é uma sessão local de um único usuário.
- **Criação automática e travada de caixas:** ao ler um prefixo que ainda
  não apareceu naquela contagem, o sistema cria a próxima "Caixa N"
  automaticamente e a associa a esse prefixo pelo resto da contagem. Não há
  edição/merge manual de caixas no MVP.
- **Leitura duplicada rápida é filtrada:** o mesmo código de barras lido
  de novo em menos de ~1 segundo é ignorado (mitiga o "double-fire" comum de
  leitores HID), não conta como peça extra.
- **Catálogo de grupos opcional:** o usuário pode, se quiser, cadastrar um
  nome para um prefixo (ex: "789123" = "Cueca Slip Preta P"), a seu
  critério — nada obriga a cadastrar. Quando existir cadastro para o
  prefixo de uma caixa, o nome aparece na tela e nos relatórios ao lado do
  número da caixa; quando não existir, aparece só o número.
- **Áudio da caixa:** a cada leitura válida, o sistema anuncia por voz
  "Caixa N" (o número, sempre — é o que está escrito na caixa física),
  pra quem está contando só escutar e jogar a peça na caixa certa sem
  precisar olhar a tela.
- **Vínculo código de barras → SKU (nome + SKU), com exigência
  configurável:** cada código de barras exato pode ter um SKU e um nome
  de produto vinculados. Numa configuração global (congelada por
  contagem, como o tamanho do prefixo), o usuário decide se isso é
  **obrigatório** (padrão, comportamento original) ou **opcional**:
  - **Obrigatório (ligado):** ao escanear um código sem SKU vinculado,
    o sistema pausa e pede o SKU antes de contar a peça — como já
    funcionava.
  - **Opcional (desligado):** um código sem vínculo é contado
    normalmente, sem parar pra perguntar nada; a peça aparece na caixa
    como "Sem SKU".
  Em ambos os casos, se o código já tem um vínculo cadastrado (seja
  criado na hora de bipar, seja pré-cadastrado na tela **Produtos**), o
  SKU (e nome, se tiver) aparecem direto, sem perguntar nada. A contagem
  é sempre quebrada por SKU dentro de cada caixa (uma caixa agrupa
  vários SKUs diferentes — por exemplo, tamanhos/cores distintos do
  mesmo grupo — incluindo, quando aplicável, um grupo "Sem SKU").
- **Cadastro de produtos (tela própria):** além de vincular um SKU na
  hora de bipar, o usuário pode pré-cadastrar produtos (código de
  barras + SKU + nome) numa tela dedicada — adicionar, editar e remover
  — para que já apareçam reconhecidos assim que forem bipados pela
  primeira vez.
- **Importação de produtos por CSV:** na tela de Produtos, um botão
  permite importar um arquivo `.csv` com várias linhas de uma vez (ex:
  antes de uma entrega grande), em vez de cadastrar um por um.
- **Ao final:** ver totais na tela, exportar/compartilhar (CSV e texto
  pronto pra WhatsApp) e manter histórico de contagens finalizadas.

## Arquitetura

- **Next.js (App Router)**, deploy na **Vercel**.
- **Postgres via Neon** (integração nativa com Vercel), acesso via um ORM
  leve (Drizzle ou Prisma — decidir na fase de plano).
- Sem autenticação/autorização — qualquer visitante do site tem acesso
  completo.

### Telas

1. **Início** — lista as **contagens abertas** (nome + data/hora de início);
   clicar em uma entra na tela de Contagem ativa daquela contagem. Botão
   **"Nova contagem"** pede um nome (texto livre) e cria a contagem.
   Atalhos para **Histórico** e **Configurações**.
2. **Contagem ativa** — campo de texto sempre em foco (recebe a digitação
   do leitor físico), botão "usar câmera" (abre modal de leitura via
   câmera), lista ao vivo das caixas da contagem (número + nome do grupo,
   quando cadastrado, com quebra por SKU dentro de cada caixa) com
   contagem atualizada em tempo real, anúncio por voz "Caixa N" a cada
   leitura válida, botão **"Finalizar contagem"**. Quando um código de
   barras sem SKU vinculado é lido e a contagem exige SKU, um campo
   aparece pedindo o SKU antes de contar a peça; com a exigência
   desligada, a peça é contada direto como "Sem SKU".
3. **Resumo** — tabela Caixa × Quantidade + total geral da contagem
   (mostrando o nome do grupo ao lado do número quando cadastrado, e a
   quebra por SKU dentro de cada caixa, incluindo "Sem SKU" quando
   aplicável); botões para exportar CSV e gerar texto de WhatsApp. Usada
   tanto logo após finalizar quanto ao abrir o detalhe de uma contagem no
   Histórico.
4. **Histórico** — lista de contagens já finalizadas (nome, data, total),
   abre o Resumo daquela contagem.
5. **Configurações** — campo numérico para o tamanho do prefixo (dígitos)
   e um checkbox "Exigir SKU ao bipar"; ambos usados como padrão em toda
   nova contagem criada dali em diante (congelados na contagem no momento
   da criação).
6. **Grupos** — catálogo opcional de prefixo → nome: lista os cadastrados,
   formulário pra adicionar/editar/remover. Independente de qualquer
   contagem específica (é um catálogo global e persistente).
7. **Produtos** — catálogo de código de barras exato → SKU + nome: lista
   os cadastrados, formulário pra adicionar/editar/remover um por vez, e
   um botão pra importar vários de uma vez por arquivo `.csv`.
   Independente de qualquer contagem específica.

## Design visual e UX

O uso real é um funcionário de loja, em pé, olhando rapidamente pra tela
entre uma leitura e outra — não alguém sentado lendo com calma. O visual
precisa ser **profissional, mas acima de tudo funcional pra esse contexto**,
e o padrão vale para **todas as telas**, não só a Contagem ativa:

- **Textos grandes por padrão** — corpo de texto e números bem acima do
  tamanho comum de app administrativo; números de caixa e totais em
  destaque máximo (a maior fonte da tela).
- **Alto contraste** — cores e tipografia pensadas pra leitura rápida à
  distância/de relance, não exigindo aproximar o rosto da tela.
- **Alvos de toque grandes** — botões (Nova contagem, Finalizar, usar
  câmera, etc.) dimensionados para toque com o dedo, considerando uso em
  tablet/celular na loja, não só mouse.
- **Hierarquia visual simples** — cada tela tem uma ação/informação
  principal óbvia (ex: na Contagem ativa, a lista de caixas domina a
  tela; configuração e metadados ficam secundários).
- Isso é um guia de estilo para a fase de implementação/UI, não uma
  biblioteca de componentes específica — a escolha de stack de estilização
  (Tailwind, etc.) fica pra fase de plano.

## Modelo de dados

```
countings
  id                 pk
  name               text            -- nome livre digitado ao criar
  started_at         timestamp
  finished_at        timestamp null
  prefix_length_used int             -- congelado no momento da criação
  require_sku_used   boolean         -- congelado no momento da criação
  status             enum('active','finished')

boxes
  id            pk
  counting_id   fk -> countings.id
  box_number    int      -- 1, 2, 3... sequencial dentro da contagem
  prefix        text     -- prefixo que travou essa caixa
  UNIQUE (counting_id, prefix)   -- garante atomicidade sob concorrência

scans
  id          pk
  box_id      fk -> boxes.id
  barcode     text        -- código completo lido
  scanned_at  timestamp

settings
  key    text pk
  value  text     -- inclui "prefix_length" e "require_sku" (padrões globais)

groups
  id          pk
  prefix      text unique   -- prefixo cadastrado, tamanho livre
  name        text          -- nome dado ao grupo pelo usuário
  created_at  timestamp

skus
  barcode     text pk         -- código de barras EXATO (não prefixo)
  sku         text not null
  name        text null       -- nome do produto; pode ficar em branco
                               -- quando o vínculo nasce só do "digitar o
                               -- SKU" na hora de bipar (essa tela não
                               -- pede nome, só a tela Produtos pede)
  created_at  timestamp
```

Os totais por caixa são derivados por `COUNT(*)` sobre `scans` (não um
contador denormalizado) — isso evita dessincronização e mantém uma trilha
de auditoria completa (cada leitura fica registrada, útil pra investigar
qualquer divergência com a nota fiscal).

`groups` é decoupled de `prefix_length`: o prefixo cadastrado num grupo
pode ter qualquer tamanho, não precisa bater exatamente com o
`prefix_length_used` de uma contagem. A resolução do nome de uma caixa é
feita em tempo de exibição (não gravada em `boxes`): busca-se, entre todos
os `groups.prefix` que são prefixo do `boxes.prefix`, o mais longo
("mais específico") — se nenhum bater, a caixa aparece sem nome. Isso
significa que nomear um grupo depois também atualiza a exibição de
contagens antigas que já tinham aquele prefixo, e mudar o `prefix_length`
global não invalida cadastros já feitos.

`skus` é diferente de `groups` em uma forma importante: a chave é o código
de barras **exato** (não um prefixo), porque cada variação de
tamanho/cor tem seu próprio código de barras único, e cada código
pertence a exatamente um SKU/produto.

Diferente da primeira versão, o vínculo com SKU **não é mais sempre
obrigatório** — depende de `countings.require_sku_used`, congelado por
contagem a partir de `settings.require_sku` (padrão: `true`, preservando
o comportamento original). Quando obrigatório, uma linha só é inserida em
`scans` depois que o código já tem (ou acabou de ganhar) uma linha
correspondente em `skus` — como antes. Quando **não** obrigatório, um
código sem vínculo em `skus` é aceito e contado mesmo assim; a linha em
`scans` é gravada normalmente, só que sem uma `skus` correspondente. Isso
significa que a quebra por SKU de uma caixa deixa de poder assumir que
toda `scans.barcode` tem uma `skus.barcode` — a consulta usa `LEFT JOIN
scans → skus`, e um `sku` nulo no resultado vira o grupo "Sem SKU" na
exibição (mesmo tratamento visual que um grupo sem nome cadastrado).

## Fluxo de contagem e API

- `POST /api/countings` `{name}` — cria contagem (`status=active`,
  congela `prefix_length_used` a partir de `settings.prefix_length` e
  `require_sku_used` a partir de `settings.require_sku`).
- `GET /api/countings?status=active` — lista contagens abertas, para a
  tela de Início.
- `GET /api/countings?status=finished` — lista para o Histórico.
- `GET /api/countings/:id` — detalhe (caixas + totais, com quebra por SKU
  dentro de cada caixa), usado no Resumo.
- `POST /api/countings/:id/scan` `{barcode, sku?}`:
  1. Valida o `barcode` (numérico, tamanho mínimo compatível com
     `prefix_length_used`); inválido → erro, nada é gravado.
  2. Extrai o prefixo (`prefix_length_used` primeiros dígitos).
  3. Busca a última leitura da caixa candidata; se o mesmo `barcode` foi
     lido há menos de 1s, ignora (retorna "duplicado ignorado").
  4. Busca o SKU vinculado a esse `barcode` exato em `skus`. Se
     existir, usa o que já está cadastrado (não precisa de `sku` no
     corpo). Se **não** existir:
     - com `sku` no corpo → cadastra o vínculo (upsert atômico por
       `barcode`, mesmo padrão de constraint única + retry das caixas,
       para suportar duas pessoas cadastrando o mesmo código novo ao
       mesmo tempo) e segue;
     - sem `sku` no corpo e `require_sku_used = true` → retorna erro
       "sku_required" (nada é gravado, a UI deve pedir o SKU e
       reenviar);
     - sem `sku` no corpo e `require_sku_used = false` → segue sem
       vincular SKU (a peça é contada como "Sem SKU").
  5. Upsert atômico da `box` por `(counting_id, prefix)` — se não existir,
     cria com o próximo `box_number` sequencial (usando uma constraint
     única + retry, para suportar múltiplas pessoas escaneando na mesma
     contagem ao mesmo tempo sem criar caixas duplicadas para o mesmo
     grupo).
  6. Insere a linha em `scans`.
  7. Retorna a caixa atingida (número + nome do grupo, se houver
     correspondência em `groups`, + o SKU resolvido, que pode ser nulo)
     e seu total atualizado.
- `POST /api/countings/:id/finish` — marca `finished_at`/`status=finished`;
  se não houver nenhum scan, o cliente pede confirmação antes de chamar
  (a API permite finalizar mesmo vazia).
- `GET /api/settings` / `PUT /api/settings` — ler/gravar `prefix_length`
  e `require_sku`.
- `GET /api/groups` — lista o catálogo de grupos cadastrados.
- `POST /api/groups` `{prefix, name}` / `PUT /api/groups/:id` /
  `DELETE /api/groups/:id` — cadastrar, renomear ou remover um grupo.
  `GET /api/countings/:id` também resolve e inclui o nome do grupo de
  cada caixa na resposta (mesma lógica de prefixo mais específico).
- `GET /api/products` — lista o catálogo de produtos cadastrados
  (código de barras, SKU, nome).
- `POST /api/products` `{barcode, sku, name}` / `PUT /api/products/:barcode`
  `{sku, name}` / `DELETE /api/products/:barcode` — cadastrar, editar ou
  remover um produto. Cadastrar com um `barcode` já existente é rejeitado
  (use `PUT` pra editar).
- `POST /api/products/import` `{csv: string}` — importa várias linhas de
  uma vez a partir do conteúdo de um arquivo `.csv` (formato descrito
  abaixo). Para cada linha válida, cadastra o produto se o código de
  barras for novo, ou **sobrescreve** SKU e nome se o código já existir.
  Linhas invalidas (código de barras vazio/não numérico, SKU ou nome em
  branco) são ignoradas e reportadas. Retorna um resumo: quantas linhas
  foram criadas, quantas atualizadas, e quais foram ignoradas (com o
  número da linha e o motivo).

### Formato do arquivo de importação de produtos

CSV separado por **ponto e vírgula** (`;`), com uma linha de cabeçalho
obrigatória contendo as colunas `nome`, `sku` e `codebar` — em qualquer
ordem, reconhecidas pelo nome (case-insensitive), não pela posição:

```
nome;sku;codebar
Cueca Slip Preta P;CUECA-SLIP-P;7891234000011
Cueca Slip Preta M;CUECA-SLIP-M;7891234000028
```

### Entrada de leitura

- **Leitor físico:** input de texto sempre focado (via `autoFocus` +
  refoco após cada submit); captura a sequência de dígitos + Enter que o
  leitor HID emite, dispara o scan e limpa o campo.
- **Câmera:** modal com decodificação de vídeo via `@zxing/browser`;
  ao decodificar um código, chama o mesmo handler de scan usado pelo
  leitor físico.
- **Feedback em tempo real:** a cada scan bem-sucedido, a UI atualiza
  otimisticamente (ex: "Caixa 3 → 15", ou "Caixa 3 — Cueca Slip Preta →
  15" quando há grupo cadastrado) mostrando também o SKU da peça lida (ou
  "Sem SKU" quando não houver um vinculado e a exigência estiver
  desligada), e confirma com a resposta do servidor. Quando a resposta
  indica "sku_required" (só possível com a exigência ligada), a UI mostra
  um campo pedindo o SKU daquele código antes de reenviar o mesmo scan
  (agora com o SKU preenchido).
- **Feedback sonoro:** a cada scan bem-sucedido (não em duplicatas
  ignoradas nem em códigos inválidos), o navegador anuncia por voz
  "Caixa N" via `SpeechSynthesis` (Web Speech API nativa, PT-BR,
  sem custo/serviço externo) — sempre o número, independente de o grupo
  ter nome cadastrado, já que é o número que está escrito na caixa
  física.

## Tratamento de erros

- **Código inválido** (poucos dígitos, não numérico): toast de erro,
  nenhuma caixa/scan é criado.
- **Duplicata rápida (<1s do mesmo código):** ignorada, com indicação
  discreta na UI de que foi ignorada.
- **Falha de rede durante o scan:** o scan entra numa fila local (mesmo
  dispositivo, memória/localStorage) e é reenviado automaticamente quando
  a conexão volta; a UI sinaliza "sincronizando..." em vez de perder a
  leitura.
- **Corrida entre duas pessoas lendo o mesmo prefixo novo ao mesmo
  tempo:** resolvida pela constraint única `(counting_id, prefix)` +
  retry no upsert — apenas uma caixa é criada, a segunda requisição
  encontra a caixa já criada pela primeira.
- **Finalizar contagem vazia:** permitido, com confirmação no cliente.
- **Câmera sem permissão/indisponível:** mensagem clara; não afeta o
  funcionamento do leitor físico.
- **`SpeechSynthesis` indisponível no navegador:** falha silenciosa (sem
  áudio), não bloqueia scan nem exibição — o feedback visual continua
  funcionando normalmente.
- **Prefixo de grupo duplicado/conflitante:** a constraint `UNIQUE` em
  `groups.prefix` impede cadastrar o mesmo prefixo duas vezes; ao editar,
  a mesma validação se aplica.
- **Código de barras sem SKU vinculado, com exigência ligada:** o scan
  não é gravado até que um SKU seja informado; a UI trata isso como um
  passo extra do fluxo de leitura, não como um erro bloqueante. Com a
  exigência desligada, não há erro nenhum — a peça é contada como "Sem
  SKU".
- **Corrida entre duas pessoas cadastrando SKU pro mesmo código novo ao
  mesmo tempo:** resolvida pela chave primária `skus.barcode` + upsert
  atômico com retry — o primeiro SKU gravado vence, a segunda requisição
  reaproveita esse valor (mesmo padrão usado para a criação de caixas).
- **Cadastro de produto com código de barras já existente (tela
  Produtos):** rejeitado no `POST` (use `PUT` pra editar); a constraint
  `UNIQUE`/PK em `skus.barcode` garante isso no banco também.
- **Linha inválida na importação de CSV** (código de barras vazio ou não
  numérico, SKU ou nome em branco, coluna faltando): aquela linha é
  ignorada, sem interromper a importação das demais; o resumo final
  reporta quantas linhas foram ignoradas e por quê.
- **Arquivo de CSV sem as colunas esperadas ou vazio:** erro claro antes
  de processar qualquer linha ("arquivo inválido, verifique o
  cabeçalho").

## Testes

- **Unitário:** extração de prefixo; lógica de atribuição de caixa (prefixo
  novo → cria caixa N+1; prefixo repetido → soma na caixa existente;
  duplicata <1s → ignorada); resolução de nome de grupo por prefixo mais
  específico (inclusive caso de múltiplos cadastros compatíveis).
- **Integração de API:** contra banco de teste — criar contagem → scans →
  finish → resumo bate com o esperado; teste de concorrência simulando
  dois scans simultâneos do mesmo prefixo novo (deve gerar uma única
  caixa); com exigência de SKU ligada, scan de um código sem SKU retorna
  "sku_required" e não grava nada, reenvio com `sku` cadastra o vínculo e
  grava o scan, scan subsequente do mesmo código já vem com o SKU
  automaticamente; com exigência desligada, scan de um código sem SKU é
  aceito e aparece como "Sem SKU"; resumo de uma caixa com múltiplos SKUs
  (incluindo "Sem SKU") mostra a quebra correta; CRUD de produtos
  (criar/editar/remover, rejeitar código de barras duplicado); importação
  de CSV cria produtos novos, sobrescreve os que já existem por código de
  barras, ignora e reporta linhas inválidas, e rejeita um arquivo sem as
  colunas esperadas.
- **Manual/E2E:** via skill `run`; simular o leitor físico digitando no
  campo (sem hardware real) e testar a leitura por câmera com um código
  impresso.

## Fora de escopo (MVP)

- Edição/merge manual de caixas durante a contagem.
- Autenticação/autorização.
- Importação em massa de catálogo de grupos (ex: planilha) — cadastro é
  manual, um grupo por vez, pela tela Grupos (a importação em massa
  existe só para Produtos).
- Uso 100% offline (PWA completo) — fila local cobre instabilidade
  pontual de rede, não operação totalmente offline.
