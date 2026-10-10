# Recursos globais — catálogo completo do painel

## Escopo

A configuração global passa de cinco para vinte controles, agrupados em Operação, Clientes e vendas, Administrativo, Ajustes e Integrações. Cada controle informa o que afeta. As páginas novas ficam habilitadas quando a chave ainda não existe, preservando o comportamento das empresas já cadastradas. Valores existentes de IA, WhatsApp, estoque, financeiro e agenda são respeitados; chaves desconhecidas são preservadas no salvamento.

As configurações são persistidas pela RPC administrativa existente, com Super Admin + MFA e auditoria. Não há migration nem alteração automática das opções dos clientes. A precedência já existente de opções específicas por empresa permanece para os recursos que as possuem.

## Disponibilidade

O catálogo central controla os menus desktop/mobile, o conteúdo da página na atualização do contexto de acesso e as rotas do servidor. As rotas de detalhes de clientes, equipamentos, OS e impressão fiscal herdam a verificação. As regras de cargo existentes continuam em vigor.

Ordens, recebimento e mesa de reparo compartilham um controle. Financeiro e relatórios compartilham outro. Perfil, ajuda, assinatura, tela de indisponibilidade e Super Admin não podem ser desativados por esses controles.

Os novos controles são de disponibilidade de páginas do painel: não constituem novas permissões SQL, não interrompem workers, não encerram processos e não excluem registros. A consulta de orçamentos tem controle próprio; orçamentos dentro de uma OS permanecem parte de Ordens. Gestão da vitrine e Minha página controlam os editores internos, mantendo conteúdo público publicado. IA e WhatsApp continuam dependendo das respectivas integrações/configurações; marcar a opção não implementa nem contrata um provedor.

## Verificação

- Suíte geral: 190 testes aprovados.
- Adicionais, executados separadamente: persistência SQL com MFA e contexto de acesso, e bloqueio da página dinâmica preservando regras de cargo; ambos aprovados (192 casos no conjunto final).
- TypeScript e build aprovados.
- Smoke HTTP: 21 rotas aprovadas; rotas privadas redirecionam sem sessão, portanto não é homologação autenticada.
- Renderização SSR dos vinte controles, valores iniciais, campos desabilitados durante gravação, grupos e descrições validada.
- Navegador visual não executado: Chromium ausente e download do executável inválido no ambiente. CSS tem duas colunas no desktop e uma abaixo de 700 px, mas falta inspeção visual autenticada nos dispositivos.
