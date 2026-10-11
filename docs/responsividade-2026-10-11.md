# Responsividade — Horária

As alterações reorganizam os layouts, mantendo textos, cores, fontes, dados e ações existentes. O layout parte do celular e usa os pontos de expansão de 640, 768, 1024 e 1280px.

## Correções por tamanho

| Resolução | Correções |
| --- | --- |
| 320×568, 360×640 e 390×844 | Entrada e cadastro com altura natural; textos e formulários sem recortes; cartões, indicadores, formulários e kanban em colunas adaptáveis; navegação hambúrguer; tabelas com os rótulos de cada campo; botões e controles de pelo menos 44px; correção dos seletores de cor e campos invisíveis que causavam estouro. |
| 640×360 e 844×390, paisagem | Rolagem vertical para formulários e diálogos; limites com `dvh`; navegação conforme a largura; controle de data da agenda reorganizado; áreas seguras nas barras e diálogos. |
| 768×1024, 820×1180 e 1024×768 | Navegação completa horizontal com quebra de linhas; cartões e formulários em grades flexíveis; tabelas empilhadas até 1279px para preservar os campos; calendário e etapas da OS reorganizados; gráficos ajustados ao espaço disponível. |
| 1366×768 e 1920×1080 | Tabelas em colunas; expansão das grades e formulários; gráficos proporcionais; navegação horizontal; quebra de nomes, mensagens e valores extensos sem aumentar a largura da página. |

Também foram ajustados recuperação de senha, estados do sistema, páginas legais, portal público, acompanhamento, equipe, PIX, MFA, resumo fiscal e configurações do ADM. O viewport já estava correto e continua usando `width=device-width, initial-scale=1, viewport-fit=cover`.

As tabelas mantêm seus elementos HTML, ações e associações acessíveis entre cabeçalhos e valores. Os rótulos das versões empilhadas derivam dos cabeçalhos existentes. As regras de impressão restauram a tabela convencional.

## Validação

- 73 telas e estados, com dados sintéticos incluindo nomes extensos, linhas preenchidas, formulários, modais e gráficos, nas dez dimensões acima.
- Auditoria do tamanho do documento, elementos fora da largura da janela, estouro interno e textos/controles recortados. A proteção `overflow-x: hidden` do body é desativada durante a medição.
- Auditoria dos alvos de toque abaixo de 768px.
- CSS fonte e CSS compilado pelo Next, incluindo a ordem dos estilos de cada layout. Fontes DM Sans e Manrope carregadas a partir das famílias usadas pelo projeto.
- 80 verificações nas rotas públicas servidas pelo Next compilado, sem erros de hidratação. Sem credenciais, os estados de entrada, cadastro e recuperação nessa rodada são os de configuração ausente; os formulários completos foram cobertos pelo renderizador de componentes com dados de teste.
- 195 testes automatizados aprovados; TypeScript e compilação de produção com webpack aprovados.

A validação ocorreu em Chromium com dimensões emuladas. Não inclui homologação em aparelhos físicos, Safari/WebKit ou execução de pagamentos, envio de mensagens, captura real de câmera e desafios reais de CAPTCHA.

## Repetir as verificações

```sh
npm run typecheck
node --test --test-concurrency=2 tests/*.test.mjs
npm run build -- --webpack
node tests/responsive-fixtures.mjs /tmp/horaria-responsive
node tests/responsive-browser.mjs /tmp/horaria-responsive /tmp/horaria-responsive-results
```

O auditor precisa de Playwright e Chromium disponíveis no ambiente. `PLAYWRIGHT_MODULE` e `CHROMIUM_EXECUTABLE` permitem indicar instalações existentes. `RESPONSIVE_PAGES` restringe a rodada a nomes de arquivos separados por vírgula.

Depois do build, `RESPONSIVE_COMPILED_CSS=1` no renderizador usa os arquivos CSS dos manifests do Next. `RESPONSIVE_FONT_CSS` permite apontar para um arquivo de fontes `@font-face` com URLs de dados incorporadas, para verificar a tipografia original sem depender de solicitações externas durante a auditoria. Sem essa opção, a rodada usa as fontes de fallback do projeto.
