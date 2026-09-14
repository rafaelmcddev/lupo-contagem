# Refresh visual profissional (design system) — Spec

## Contexto e motivação

O usuário reportou que a interface do lupo-contagem, embora responsiva e funcional, tem
aparência amadora — não parece um "sistema digno de venda". Pediu para estabelecer
padrões de design/UI/UX mais próximos do que se vê em produtos profissionais atuais.

Decisões já tomadas em conversa (brainstorming bounded/architectural, aprovadas pelo
usuário):

- **Sem dependência nova**: refino em cima do Tailwind + tokens já existentes
  (`tailwind.config.ts`), não adotar Radix UI/shadcn nem nenhuma lib de componentes.
  Mesma lógica da decisão anterior de usar SVGs inline em vez de uma lib de ícones.
- **Escopo**: o sistema inteiro — telas de contagem/bipe (grandes, touch-friendly,
  pensadas pro depósito) E telas de escritório/cadastro (Recompensas, Clientes,
  Produtos, Grupos, Configurações). A distinção de **tamanho** entre essas duas
  "personalidades" (já estabelecida num fix anterior nesta mesma sessão) **não muda**
  — esta spec é só sobre acabamento visual (bordas, sombra, foco), não sobre
  tamanho de fonte/padding.
- **Direção visual**: proposta pelo assistente, não uma referência externa específica.

## Diagnóstico: por que a UI parece amadora

Não é a paleta de cores (já é razoável: verde-petróleo `accent`, neutros `ink`/`paper`/
`canvas`). O problema é a falta de profundidade e de feedback visual:

1. Toda superfície (cards, tabela, nav, inputs) usa só borda plana, nunca sombra —
   tudo fica "grudado" no mesmo plano, sem hierarquia visual.
2. Todo input usa borda grossa (`border-2`, 2px) e nenhum feedback de foco além do
   outline genérico do navegador — falta o "clique e veja a borda acender" que
   qualquer produto atual tem.
3. Cabeçalho de tabela é um bloco sólido (`bg-canvas`) em vez do padrão mais atual de
   texto leve/uppercase sem preenchimento.
4. Nenhuma linha de tabela ou card reage ao hover além de mudança de cor de borda em
   alguns lugares isolados.

## O que muda

### 1. Padrão de input (o maior impacto, tocando quase todo arquivo)

Todo input de texto/número/data/senha do tipo "caixa com borda cinza" muda de:

```
border-2 border-gray-300
```

para:

```
border border-gray-300 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none
```

Inputs que já usam borda simples de 1px dentro da `Table` (modo edição de linha, ex.
`border border-gray-300 px-2 py-1`) só ganham o trecho `focus:border-accent
focus:ring-2 focus:ring-accent/20 focus:outline-none` acrescentado — a espessura já
está certa.

**Exceção**: `components/BarcodeInput.tsx` já usa `border-2 border-accent` +
`focus:ring-2 focus:ring-accent/40` — é o campo mais usado do app inteiro (bipagem
contínua), já tem uma borda colorida sempre visível de propósito (indica "isto está
ativo e pronto pra bipar"), e já segue a mesma lógica de anel de foco proposta aqui.
**Não mexer** nele.

Tamanho de fonte/padding de cada input **não muda** — cada tela mantém o que já foi
definido no fix anterior (compacto nas telas de escritório, grande nas de contagem).

Arquivos com inputs a ajustar (todos os `border-2 border-gray-*` fora do
`BarcodeInput`):

- `app/page.tsx` (nome da contagem, busca no histórico de contagens)
- `app/products/page.tsx` (código de barras, SKU, nome, busca, SKU/nome em edição)
- `app/countings/[id]/page.tsx` (campo de SKU vinculado, busca)
- `app/settings/page.tsx` (quantidade de dígitos do prefixo)
- `app/groups/page.tsx` (prefixo, nome do grupo)
- `app/history/page.tsx` (busca)
- `app/recompensas/page.tsx` (data da venda, valor — via `CurrencyInput`; data em
  edição de linha na `Table`)
- `app/recompensas/clientes/page.tsx` (nome, telefone — via `PhoneInput`; nome em
  edição de linha na `Table`)
- `components/CustomerPicker.tsx` (busca, nome/telefone do cadastro inline)
- `components/PinGate.tsx` (PIN)

`CurrencyInput`/`PhoneInput` não têm classe própria — cada tela passa a `className`
inteira via prop, então o ajuste acontece nos arquivos acima, não nesses dois
componentes.

### 2. `components/ui/Table.tsx`

- Cabeçalho: troca `bg-canvas` por texto leve — `text-xs font-semibold uppercase
  tracking-wide text-gray-500`, sem preenchimento de fundo, com `border-b
  border-gray-200` separando do corpo.
- Linhas: mantém o zebra-striping atual (`bg-paper`/`bg-canvas` alternado), acrescenta
  `hover:bg-accent-light/60 transition-colors` pra destacar a linha sob o cursor.
- Container: troca `border border-gray-200` por `border border-gray-200 shadow-sm`.

### 3. `components/ui/Card.tsx`

Acrescenta `shadow-sm transition-shadow` na classe base. Onde o `Card` já é usado como
item clicável de lista (`app/page.tsx`, contagens), o `hover:border-accent` existente
continua, e ganha `hover:shadow-md` junto.

### 4. `components/ui/Button.tsx`

A variante `primary` ganha `shadow-sm` (mesmo em `size="sm"` e `size="lg"`) — o botão
de ação principal passa a ter uma elevação sutil, sinal comum de "esta é a ação
principal" em produtos atuais. `secondary`/`danger` continuam sem sombra (mais
neutros).

### 5. `components/ui/Pagination.tsx`

Hoje duplica markup de botão (`<button className="rounded-lg border ...">`) em vez de
usar o componente `Button` compartilhado. Passa a usar `<Button variant="secondary"
size="sm">`, herdando automaticamente o padrão de borda/foco/sombra definido acima —
sem precisar duplicar a regra aqui.

### 6. `components/ui/Nav.tsx`

Acrescenta `shadow-sm` na barra de navegação (`<nav>`), mantendo o `border-b` que já
existe — reforça a separação entre a nav e o conteúdo ao rolar a página. O tratamento
de link ativo (`bg-accent-light text-accent`) já está bom, não muda.

## O que NÃO muda (fora de escopo)

- Paleta de cores, tipografia (família/escala de `fontSize`), border-radius scale —
  já são razoáveis, o problema era acabamento, não os tokens em si.
- Tamanho de fonte/padding de inputs e botões por tela (já resolvido num fix
  anterior nesta mesma sessão — telas de escritório compactas, telas de
  contagem/bipe grandes).
- `components/BarcodeInput.tsx` (já segue o padrão proposto).
- Qualquer dependência nova (ícones, componentes, animação).
- Estados de loading/empty state mais elaborados (fora do pedido original).
- Refatorar o padrão `Card` (Produtos/Grupos) para usar `Table` — os dois padrões
  continuam coexistindo, como já é hoje.

## Testes

Mudança é quase inteiramente visual (classes Tailwind), sem lógica nova — os testes
existentes (que verificam texto/comportamento, não classes CSS específicas na maioria
dos casos) devem continuar passando sem alteração. Onde um teste already asserts uma
classe específica que muda (ex.: nenhum teste hoje verifica `border-2`), não há
conflito conhecido. Verificação real fica por conta de: `npm test` (suite completa,
pristine) + checagem visual manual no navegador em pelo menos uma tela de cada
"personalidade" (uma de escritório, ex. Recompensas, e uma de contagem, ex.
`/countings/[id]`) antes de considerar concluído.
