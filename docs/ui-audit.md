# Auditoria de UI — Horária

Esta auditoria acompanha a consolidação do tema do painel. O arquivo `app/theme.css`
é a fonte central dos tokens administrativos (`--ui-*`) e `components/ui.tsx`
contém os primitives compartilhados.

## Divergências encontradas antes da migração

### Cards de métrica
Havia implementações diferentes em:
- Painel (`dashboard-kpi`)
- Agenda (`dashboard-kpi`)
- Orçamentos (`dashboard-kpi`)
- Ordens de serviço (`orders-summary-card`)
- Estoque (`orders-summary-card` + ajustes próprios)
- Mesa de reparo (`repair-summary`)
- Financeiro (`finance-kpis`, inclusive fundo escuro)
- Relatórios (`metrics > panel`)
- Vendas (`metrics > panel`)
- Pós-venda (`metrics > panel`)
- Seminovos (`metrics > panel`)
- Clientes / Equipamentos (`dashboard-kpi`)
- Catálogo de serviços / peças (`dashboard-kpi`)
- Administração da plataforma (`admin-metrics`)

Todos esses pontos passaram a renderizar `MetricGrid` + `MetricCard`.
O fundo escuro não faz mais parte do primitive de métrica; o escuro fica reservado
ao shell/sidebar.

### Botão primário
A classe compartilhada `.primary` já existia, mas havia regras locais alterando
altura, padding e border-radius em módulos como Agenda, Registros, Catálogo,
Mesa de reparo, Estoque e outros formulários.

Agora a geometria e as cores do botão primário são governadas pelos tokens de
`app/theme.css`. O markup legado `className="primary"` continua válido para
evitar uma migração de risco sem ganho funcional.

### Badges / chips
Foram encontradas famílias diferentes:
- `status-pill` para status de OS
- `orders-priority` em Ordens
- `repair-priority` na Mesa de reparo
- `quote-status` em Orçamentos
- `catalog-status` no Catálogo
- `stock-state` no Estoque
- `status` em Pós-venda e Seminovos
- `account-status` no Admin

Prioridades de Ordens e Mesa de reparo foram migradas para `SemanticBadge`.
Os demais mantêm as cores específicas do domínio, mas usam a mesma geometria
central (altura, padding, radius e tipografia) via tokens.

### Inputs, selects e textareas
Os formulários usam HTML nativo em várias telas (Ordens, Estoque, Financeiro,
Agenda, Clientes/Equipamentos, Catálogo, Vendas, Seminovos, Pós-venda,
Minha assistência e Minha página). Existiam overrides locais de altura, padding,
border e radius.

Essas propriedades agora são normalizadas pelo tema central para o painel e
admin. Permanecem fora da normalização apenas controles que precisam de
comportamento próprio: checkbox/radio, color picker, file input, hidden input,
câmera e alguns controles visuais especializados.

## Tokens centrais

`app/theme.css` define:
- cores: primary, success, warning, danger, purple e neutral;
- superfícies, bordas, texto e muted;
- padding/radius de cards;
- altura de botão e controles;
- escala tipográfica das métricas;
- escala de espaçamento em múltiplos consistentes;
- sombra padrão dos cards.

## Tema da página pública

O tema administrativo e o tema do cliente são separados de propósito.

- Painel administrativo: `app/theme.css` (`--ui-*`).
- Página pública: `lib/theme.ts` + CSS variables `--public-*`.

Em "Minha assistência", Cor principal, Cor secundária, Cor dos botões e Tema
alimentam as variáveis `--public-*` do preview em tempo real. O preview não
usa mais cores fixas para esses elementos.

## Divergências que permanecem intencionalmente

1. Gráficos e donuts continuam usando alguns estilos inline porque as cores e
   percentuais são calculados a partir dos dados em tempo real.
2. Color pickers/swatches usam estilo dinâmico porque representam a cor
   escolhida pelo próprio cliente.
3. Badges com vocabulários específicos (orçamento, estoque, pós-venda,
   seminovos e conta da plataforma) mantêm sua lógica semântica local, mas
   compartilham a geometria central.
4. CSS legado de antigos cards ainda pode existir em `workspace.css` e
   `operations.css` para compatibilidade, porém as telas migradas não usam
   mais esses componentes antigos e `theme.css` é carregado por último.

Novas telas devem preferir `MetricGrid`, `MetricCard`, `SemanticBadge`,
`Badge` e os tokens `--ui-*` em vez de criar uma nova família visual.
