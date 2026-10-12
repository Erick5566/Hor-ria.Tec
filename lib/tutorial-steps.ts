import type { AccessContext } from "@/lib/access";
import { panelPathEnabled } from "@/lib/platform-features";

export type TourStep = {
  key: string;
  kind: "welcome" | "navigate" | "explain" | "click" | "type" | "finish";
  title: string;
  description: string;
  path?: string;
  selector?: string;
  optional?: boolean;
};
export type ModuleGuide = {
  path: string;
  title: string;
  introduction: string;
  details: string;
  selector?: string;
  manager?: boolean;
  feature?: "stockEnabled" | "financialEnabled" | "appointmentsEnabled";
};
export const moduleGuides: readonly ModuleGuide[] = [
  { path: "/painel", title: "Visão geral", introduction: "O painel mostra o que está aberto, em andamento e pronto, além de avisos e indicadores da assistência.", details: "Use os cards para acompanhar as ordens e os gráficos para descobrir quais serviços exigem atenção.", selector: ".dashboard-hero, .dashboard-pro h1, .workspace-breadcrumbs" },
  { path: "/painel/clientes", title: "Clientes", introduction: "Aqui ficam os cadastros e o histórico de atendimento dos clientes.", details: "Pesquise um nome ou número de WhatsApp, abra a ficha ou use Novo cliente. Os dados digitados são reais e só são salvos quando você confirmar.", selector: ".records-main-card" },
  { path: "/painel/ordens/nova", title: "Recebimento", introduction: "Registre quem trouxe o aparelho, qual é o equipamento e qual defeito o cliente relatou.", details: "Confira nome, WhatsApp, marca, modelo, estado de entrada, fotos e descrição do defeito. Só conclua quando estiver registrando um atendimento verdadeiro.", selector: "form.panel" },
  { path: "/painel/ordens", title: "Ordens de serviço e mesa", introduction: "Acompanhe as OS, seus estados, responsáveis, prazos e o andamento de cada reparo.", details: "Abra uma OS para diagnóstico, orçamento, peças aplicadas, fotos e histórico. Na visão de bancada, organize o serviço por etapa.", selector: ".module, .workspace-breadcrumbs" },
  { path: "/painel/orcamentos", title: "Orçamentos", introduction: "Prepare e acompanhe a aprovação dos valores de reparo enviados ao cliente.", details: "Confira diagnóstico, itens e valor antes de enviar. Uma aprovação real atualiza o andamento do atendimento.", selector: ".module, .workspace-breadcrumbs" },
  { path: "/painel/agenda", title: "Agenda", introduction: "Organize horários de atendimento, reservas e compromissos da assistência.", details: "Use datas e horários de funcionamento configurados. Confirme o agendamento somente quando houver cliente real.", selector: ".module, .workspace-breadcrumbs", feature: "appointmentsEnabled" },
  { path: "/painel/equipamentos", title: "Aparelhos", introduction: "Consulte aparelhos cadastrados, dados técnicos e histórico de serviços.", details: "Você pode registrar marca, modelo, cor e outras características, associando os equipamentos aos clientes.", selector: ".records-main-card" },
  { path: "/painel/servicos", title: "Serviços", introduction: "Consulte os tipos de serviços realizados pela assistência e informações relacionadas.", details: "Utilize esta seção para localizar serviços, prazos e registros correspondentes ao seu trabalho.", selector: ".module, .workspace-breadcrumbs" },
  { path: "/painel/estoque", title: "Estoque", introduction: "Controle peças, produtos, quantidades, movimentações e seus custos.", details: "Esta área é reservada à administração. Técnicos podem registrar peças usadas na OS sem ver custos internos.", selector: ".module, .workspace-breadcrumbs", manager: true, feature: "stockEnabled" },
  { path: "/painel/vendas", title: "Vendas", introduction: "Registre a saída dos produtos e acompanhe a operação comercial.", details: "Revise quantidades e valores antes de concluir uma venda real, pois ela pode movimentar o estoque.", selector: ".module, .workspace-breadcrumbs", manager: true },
  { path: "/painel/seminovos", title: "Seminovos", introduction: "Gerencie aparelhos usados e operações de troca e revenda.", details: "Confira avaliação, descrição, preço e histórico antes de cadastrar ou negociar um aparelho.", selector: ".module, .workspace-breadcrumbs", manager: true },
  { path: "/painel/vitrine", title: "Vitrine", introduction: "Organize a apresentação pública dos produtos da sua assistência.", details: "Escolha o que deseja exibir e revise as informações antes de publicar para os clientes.", selector: ".module, .workspace-breadcrumbs", manager: true },
  { path: "/painel/pos-venda", title: "Pós-venda", introduction: "Acompanhe o relacionamento depois da entrega do serviço.", details: "Use retornos, garantias e pedidos de avaliação conforme a situação real de cada cliente.", selector: ".module, .workspace-breadcrumbs", manager: true },
  { path: "/painel/financeiro", title: "Financeiro", introduction: "Aqui estão receitas, despesas, saldo, lucros e gráficos financeiros.", details: "Selecione um período, confira movimentações e relatórios. Esta área é exclusiva dos responsáveis autorizados.", selector: ".module, .workspace-breadcrumbs", manager: true, feature: "financialEnabled" },
  { path: "/painel/notas-fiscais", title: "Notas fiscais", introduction: "Acompanhe as configurações e os registros fiscais relacionados aos serviços.", details: "Verifique todos os dados antes de emitir documentos fiscais; emissão depende de configuração e requisitos legais.", selector: ".module, .workspace-breadcrumbs", manager: true },
  { path: "/painel/equipe", title: "Equipe", introduction: "Convide técnicos e atendentes com acesso individual, sem compartilhar sua senha.", details: "Confira vagas do plano, escolha a função, envie convites e desative acessos quando necessário.", selector: ".team-list, .team-dashboard, .module" , manager: true },
  { path: "/painel/empresa", title: "Minha assistência", introduction: "Personalize nome, endereço, contatos e horários da sua assistência.", details: "Revise os dados comerciais e a identidade visual; são informações usadas em outras partes da Horária.", selector: ".module, .workspace-breadcrumbs", manager: true },
  { path: "/painel/minha-pagina", title: "Minha página", introduction: "Organize a apresentação pública da assistência e informações para o cliente.", details: "Confira prévia, links e dados antes de compartilhar sua página de agendamento ou acompanhamento.", selector: ".module, .workspace-breadcrumbs", manager: true },
  { path: "/painel/configuracoes", title: "Configurações", introduction: "Ajuste as preferências e funções administrativas da assistência.", details: "Altere somente as opções que deseja aplicar ao negócio, respeitando as permissões da sua conta.", selector: ".module, .workspace-breadcrumbs", manager: true },
  { path: "/painel/ajuda", title: "Ajuda", introduction: "Encontre orientações e suporte quando precisar.", details: "Você poderá reiniciar este treinamento pelo botão Conheça a Horária no topo da tela.", selector: ".module, .workspace-breadcrumbs" },
];

export function buildTutorialSteps(
  context: AccessContext,
  enabledRoutes: ReadonlySet<string>,
): TourStep[] {
  const role = context.company?.role;
  const manager = role === "OWNER" || role === "ADMIN";
  const flags = context.company?.featureFlags;
  const modules = moduleGuides.filter((item) =>
    enabledRoutes.has(item.path) &&
    (!item.manager || manager) &&
    (!item.feature || Boolean(flags?.[item.feature])) &&
    panelPathEnabled(flags, item.path),
  );
  const steps: TourStep[] = [{
    key: "welcome", kind: "welcome", title: "Conheça a Horária",
    description: "Vou apresentar cada área de acordo com seu acesso. Você vai tocar nos menus, conhecer os controles e praticar nos próprios formulários, sem cadastrar informações fictícias.",
  }];
  for (const item of modules) {
    steps.push({
      key: item.path + ":open", kind: "navigate", title: "Abra: " + item.title,
      path: item.path, description: item.introduction,
      selector: `.main-sidebar nav a[href="${item.path}"]`,
    });
    steps.push({
      key: item.path + ":explain", kind: "explain", title: item.title + " — como funciona",
      path: item.path, description: item.details, selector: item.selector,
    });
    if (item.path === "/painel/clientes" || item.path === "/painel/equipamentos") {
      steps.push({
        key: item.path + ":new", kind: "click", path: item.path,
        title: item.path.endsWith("clientes") ? "Toque em Novo cliente" : "Toque em Novo equipamento",
        description: "Clique no botão destacado. Vamos conhecer o cadastro sem enviar dados de teste.",
        selector: "#novo-registro", optional: true,
      });
      steps.push({
        key: item.path + ":name", kind: "type", path: item.path,
        title: "Experimente o formulário",
        description: item.path.endsWith("clientes")
          ? "Toque no campo Nome. Se tiver um cliente real, digite os dados dele e salve quando quiser. Para apenas conhecer a tela, pode pular."
          : "Toque no campo Modelo e veja como cadastrar um aparelho. Salve somente informações reais.",
        selector: item.path.endsWith("clientes")
          ? ".records-editor input[name='nome']"
          : ".records-editor input[name='modelo']",
        optional: true,
      });
    }
    if (item.path === "/painel/ordens/nova") {
      steps.push({
        key: item.path + ":customer", kind: "explain", path: item.path,
        title: "Identifique o cliente",
        description: "Selecione um cliente cadastrado ou informe os dados de uma pessoa real. Confira o WhatsApp antes de criar a OS.",
        selector: ".new-order-customer-fields", optional: true,
      });
      steps.push({
        key: item.path + ":problem", kind: "type", path: item.path,
        title: "Descreva o problema",
        description: "Toque no campo e escreva o defeito informado pelo cliente. Não precisa enviar uma OS fictícia para concluir o treinamento.",
        selector: "textarea[name='problema']", optional: true,
      });
    }
    if (item.path === "/painel/equipe") {
      steps.push({
        key: item.path + ":invite", kind: "click", path: item.path,
        title: "Conheça o convite individual",
        description: "Clique em Adicionar membro. Você poderá definir o cargo, o e-mail e compartilhar um link seguro, sem enviá-lo neste exercício.",
        selector: ".team-member-actions button.primary", optional: true,
      });
      steps.push({
        key: item.path + ":email", kind: "type", path: item.path,
        title: "Como convidar um funcionário",
        description: "Observe o formulário. Digite somente um e-mail verdadeiro quando for realmente convidar alguém; você pode pular.",
        selector: "[aria-labelledby='team-invite-title'] input[type='email']",
        optional: true,
      });
    }
  }
  steps.push({
    key: "finish", kind: "finish", title: "Pronto para usar a Horária!",
    description: "Você conheceu as ferramentas disponíveis para seu perfil. Pode voltar a qualquer momento pelo botão Conheça a Horária.",
  });
  return steps;
}
