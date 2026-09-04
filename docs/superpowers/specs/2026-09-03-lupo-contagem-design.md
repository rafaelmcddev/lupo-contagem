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
   quando cadastrado) com contagem atualizada em tempo real, anúncio por
   voz "Caixa N" a cada leitura válida, botão **"Finalizar contagem"**.
3. **Resumo** — tabela Caixa × Quantidade + total geral da contagem
   (mostrando o nome do grupo ao lado do número, quando cadastrado);
   botões para exportar CSV e gerar texto de WhatsApp. Usada tanto logo
   após finalizar quanto ao abrir o detalhe de uma contagem no Histórico.
4. **Histórico** — lista de contagens já finalizadas (nome, data, total),
   abre o Resumo daquela contagem.
5. **Configurações** — campo numérico para o tamanho do prefixo (dígitos),
   valor usado como padrão em toda nova contagem criada dali em diante.
6. **Grupos** — catálogo opcional de prefixo → nome: lista os cadastrados,
   formulário pra adicionar/editar/remover. Independente de qualquer
   contagem específica (é um catálogo global e persistente).

## Modelo de dados

```
countings
  id                 pk
  name               text            -- nome livre digitado ao criar
  started_at         timestamp
  finished_at        timestamp null
  prefix_length_used int             -- congelado no momento da criação
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
  value  text     -- inclui "prefix_length" (padrão global atual)

groups
  id          pk
  prefix      text unique   -- prefixo cadastrado, tamanho livre
  name        text          -- nome dado ao grupo pelo usuário
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

## Fluxo de contagem e API

- `POST /api/countings` `{name}` — cria contagem (`status=active`,
  congela `prefix_length_used` a partir de `settings.prefix_length`).
- `GET /api/countings?status=active` — lista contagens abertas, para a
  tela de Início.
- `GET /api/countings?status=finished` — lista para o Histórico.
- `GET /api/countings/:id` — detalhe (caixas + totais), usado no Resumo.
- `POST /api/countings/:id/scan` `{barcode}`:
  1. Valida o `barcode` (numérico, tamanho mínimo compatível com
     `prefix_length_used`); inválido → erro, nada é gravado.
  2. Extrai o prefixo (`prefix_length_used` primeiros dígitos).
  3. Busca a última leitura da caixa candidata; se o mesmo `barcode` foi
     lido há menos de 1s, ignora (retorna "duplicado ignorado").
  4. Upsert atômico da `box` por `(counting_id, prefix)` — se não existir,
     cria com o próximo `box_number` sequencial (usando uma constraint
     única + retry, para suportar múltiplas pessoas escaneando na mesma
     contagem ao mesmo tempo sem criar caixas duplicadas para o mesmo
     grupo).
  5. Insere a linha em `scans`.
  6. Retorna a caixa atingida (número + nome do grupo, se houver
     correspondência em `groups`) e seu total atualizado.
- `POST /api/countings/:id/finish` — marca `finished_at`/`status=finished`;
  se não houver nenhum scan, o cliente pede confirmação antes de chamar
  (a API permite finalizar mesmo vazia).
- `GET /api/settings` / `PUT /api/settings` — ler/gravar `prefix_length`.
- `GET /api/groups` — lista o catálogo de grupos cadastrados.
- `POST /api/groups` `{prefix, name}` / `PUT /api/groups/:id` /
  `DELETE /api/groups/:id` — cadastrar, renomear ou remover um grupo.
  `GET /api/countings/:id` também resolve e inclui o nome do grupo de
  cada caixa na resposta (mesma lógica de prefixo mais específico).

### Entrada de leitura

- **Leitor físico:** input de texto sempre focado (via `autoFocus` +
  refoco após cada submit); captura a sequência de dígitos + Enter que o
  leitor HID emite, dispara o scan e limpa o campo.
- **Câmera:** modal com decodificação de vídeo via `@zxing/browser`;
  ao decodificar um código, chama o mesmo handler de scan usado pelo
  leitor físico.
- **Feedback em tempo real:** a cada scan bem-sucedido, a UI atualiza
  otimisticamente (ex: "Caixa 3 → 15", ou "Caixa 3 — Cueca Slip Preta →
  15" quando há grupo cadastrado) e confirma com a resposta do servidor.
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

## Testes

- **Unitário:** extração de prefixo; lógica de atribuição de caixa (prefixo
  novo → cria caixa N+1; prefixo repetido → soma na caixa existente;
  duplicata <1s → ignorada); resolução de nome de grupo por prefixo mais
  específico (inclusive caso de múltiplos cadastros compatíveis).
- **Integração de API:** contra banco de teste — criar contagem → scans →
  finish → resumo bate com o esperado; teste de concorrência simulando
  dois scans simultâneos do mesmo prefixo novo (deve gerar uma única
  caixa).
- **Manual/E2E:** via skill `run`; simular o leitor físico digitando no
  campo (sem hardware real) e testar a leitura por câmera com um código
  impresso.

## Fora de escopo (MVP)

- Edição/merge manual de caixas durante a contagem.
- Autenticação/autorização.
- Importação em massa de catálogo de grupos (ex: planilha) — cadastro é
  manual, um grupo por vez, pela tela Grupos.
- Uso 100% offline (PWA completo) — fila local cobre instabilidade
  pontual de rede, não operação totalmente offline.
