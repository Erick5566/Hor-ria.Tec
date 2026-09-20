"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase, message } from "./supabase";
import { useWorkspace } from "@/components/workspace";
export const statuses = {
  novo: "Novo",
  recebido: "Recebido",
  em_diagnostico: "Em diagnóstico",
  aguardando_orcamento: "Aguardando orçamento",
  orcamento_enviado: "Orçamento enviado",
  aguardando_aprovacao: "Aguardando aprovação",
  orcamento_aprovado: "Orçamento aprovado",
  em_reparo: "Em reparo",
  aguardando_peca: "Aguardando peça",
  em_testes: "Em testes",
  pronto_retirada: "Pronto para retirada",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};
export type Status = keyof typeof statuses;
export const categories = [
  "Celular",
  "Notebook",
  "Computador",
  "Tablet",
  "Console",
  "TV",
  "Monitor",
  "Impressora",
  "Smartwatch",
  "Acessório",
  "Outro",
];
export const conditions = [
  "Tela quebrada",
  "Trincado",
  "Arranhões",
  "Amassado",
  "Oxidação",
  "Tampa danificada",
  "Sem parafusos",
  "Não liga",
  "Sem chip",
  "Sem cartão de memória",
  "Sem carregador",
  "Com acessórios",
  "Outro",
];
export const photoCategories = [
  "Entrada",
  "Diagnóstico",
  "Durante o reparo",
  "Após o reparo",
  "Entrega",
  "Outro",
];
export type Cliente = {
  id: string;
  empresa_id: string;
  nome: string;
  whatsapp: string;
  email: string | null;
  documento: string | null;
  telefone: string | null;
  endereco: string | null;
  observacoes: string | null;
  criado_em: string;
};
export type Equipamento = {
  id: string;
  empresa_id: string;
  cliente_id: string;
  categoria: string;
  tipo_personalizado: string;
  marca: string;
  modelo: string;
  cor: string;
  numero_serie: string;
  imei: string;
  acessorios: string;
  criado_em: string;
};
export type Ordem = {
  id: string;
  numero: number;
  empresa_id: string;
  cliente_id: string;
  equipamento_id: string;
  codigo_publico: string;
  token_acompanhamento: string;
  problema: string;
  estado: string[];
  observacoes_estado: string;
  tecnico: string;
  mesa_id: string | null;
  prioridade: "baixa" | "normal" | "alta" | "urgente";
  iniciado_em: string | null;
  prazo_previsto: string | null;
  status: Status;
  previsao: string | null;
  criado_em: string;
  atualizado_em: string;
  entrada_confirmada: boolean;
  origem: string;
};
export type Item = {
  nome: string;
  quantidade: number;
  valor: number;
  peca_id?: string;
  servico_id?: string;
};
export type Orcamento = {
  id: string;
  empresa_id: string;
  ordem_id: string;
  versao: number;
  servicos: Item[];
  pecas: Item[];
  mao_obra: number;
  desconto: number;
  total: number;
  validade: string;
  status: string;
  resposta: string;
  criado_em: string;
};
export type Foto = {
  id: string;
  empresa_id: string;
  ordem_id: string;
  caminho: string;
  url: string;
  categoria: string;
  descricao: string;
  criado_em: string;
  usuario_id: string;
  autor: string;
};
export type Historico = {
  usuario_id?: string;
  id: number;
  ordem_id: string;
  evento: string;
  detalhes: string;
  publico: boolean;
  criado_em: string;
  autor: string;
};
export type Peca = {
  id: string;
  empresa_id: string;
  nome: string;
  compatibilidade: string;
  quantidade: number;
  custo: number;
  preco: number;
  fornecedor: string;
  estoque_minimo: number;
  tipo: "Peça" | "Acessório" | "Produto";
  categoria: string;
  sku: string | null;
  codigo_barras: string | null;
  unidade: "un" | "kit" | "par" | "m" | "caixa";
  ativo: boolean;
  descricao: string | null;
  foto_url: string | null;
  na_vitrine: boolean;
  descricao_vitrine: string | null;
};
export type Seminovo = {
  id: string;
  empresa_id: string;
  vendedor_id: string | null;
  comprador_id: string | null;
  categoria: string;
  marca: string;
  modelo: string;
  cor: string | null;
  imei: string | null;
  numero_serie: string | null;
  estado: string | null;
  checklist: string[];
  foto_urls: string[];
  documentacao: string | null;
  observacoes: string | null;
  status:
    | "em_avaliacao"
    | "em_manutencao"
    | "pronto_venda"
    | "reservado"
    | "vendido"
    | "descartado";
  valor_estimado: number;
  valor_compra: number;
  custos_reparo: number;
  preco_venda: number;
  valor_vendido: number | null;
  forma_pagamento: string | null;
  garantia_fim: string | null;
  na_vitrine: boolean;
  adquirido_em: string;
  vendido_em: string | null;
};
export type PosVenda = {
  id: string;
  empresa_id: string;
  cliente_id: string;
  ordem_id: string | null;
  venda_id: string | null;
  seminovo_id: string | null;
  tipo: "reparo" | "venda" | "seminovo";
  disponivel_em: string;
  status: "pendente" | "contatado" | "concluido" | "dispensado";
  mensagem: string | null;
  contatado_em: string | null;
  criado_em: string;
};
export type MesaReparo = {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  ordem_exibicao: number;
  ativo: boolean;
};
export type Garantia = {
  id: string;
  empresa_id: string;
  ordem_id: string;
  ordem_origem_id: string | null;
  descricao: string;
  inicio: string;
  fim: string;
  observacoes: string | null;
  status: "ativa" | "acionada" | "encerrada" | "cancelada";
  criado_em: string;
};
export type Venda = {
  id: string;
  numero: number;
  empresa_id: string;
  cliente_id: string | null;
  status: "finalizada" | "cancelada";
  subtotal: number;
  desconto: number;
  total: number;
  custo_total: number;
  observacoes: string | null;
  vendido_em: string;
};
export type Lancamento = {
  id: string;
  empresa_id: string;
  ordem_id: string | null;
  descricao: string;
  tipo: "receita" | "despesa";
  valor: number;
  status: "pendente" | "pago";
  vencimento: string;
  pago_em: string | null;
  origem: "reparo" | "loja" | "seminovo" | "despesa" | "manual";
  venda_id: string | null;
};
export type Diagnostico = {
  ordem_id: string;
  empresa_id: string;
  problema_identificado: string;
  testes_realizados: string;
  pecas_necessarias: string;
  observacoes: string;
};
export function money(value: number | string = 0) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
export function stamp(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}
export function phone(value: string) {
  return value.replace(/\D/g, "");
}
export async function rows<T>(table: string, empresaId: string): Promise<T[]> {
  let all: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase!
      .from(table)
      .select("*")
      .eq("empresa_id", empresaId)
      .order(
        table === "diagnosticos" || table === "equipamento_segredos"
          ? "ordem_id"
          : "id",
      )
      .range(offset, offset + 999);
    if (error) throw error;
    all = all.concat(data as T[]);
    if (data.length < 1000) return all;
  }
}
type RowCacheEntry = {
  data: unknown[];
  fetchedAt: number;
  ready: boolean;
  inFlight?: Promise<unknown[]>;
};

const ROW_CACHE_TTL_MS = 30_000;
const rowCache = new Map<string, RowCacheEntry>();

function rowCacheKey(table: string, empresaId: string) {
  return `${empresaId}:${table}`;
}

async function cachedRows<T>(
  table: string,
  empresaId: string,
  force = false,
): Promise<T[]> {
  const key = rowCacheKey(table, empresaId);
  const current = rowCache.get(key);

  if (
    !force &&
    current?.ready &&
    Date.now() - current.fetchedAt < ROW_CACHE_TTL_MS
  )
    return current.data as T[];
  if (current?.inFlight) return current.inFlight as Promise<T[]>;

  const request = rows<T>(table, empresaId)
    .then((data) => {
      rowCache.set(key, {
        data,
        fetchedAt: Date.now(),
        ready: true,
      });
      return data;
    })
    .catch((error) => {
      if (current?.ready) {
        rowCache.set(key, {
          data: current.data,
          fetchedAt: current.fetchedAt,
          ready: true,
        });
      } else {
        rowCache.delete(key);
      }
      throw error;
    });

  rowCache.set(key, {
    data: current?.data || [],
    fetchedAt: current?.fetchedAt || 0,
    ready: current?.ready || false,
    inFlight: request as Promise<unknown[]>,
  });

  return request;
}

export function useRows<T>(table: string) {
  const { empresa } = useWorkspace();
  const key = rowCacheKey(table, empresa.id);
  const initialCache = rowCache.get(key);
  const [data, setData] = useState<T[]>(
      () => (initialCache?.ready ? (initialCache.data as T[]) : []),
    ),
    [loading, setLoading] = useState(!initialCache?.ready),
    [error, setError] = useState("");

  const load = useCallback(
    async (force = false) => {
      const cached = rowCache.get(rowCacheKey(table, empresa.id));
      if (!cached?.ready) setLoading(true);
      try {
        setData(await cachedRows<T>(table, empresa.id, force));
        setError("");
      } catch (e) {
        setError(message(e as Error));
      } finally {
        setLoading(false);
      }
    },
    [table, empresa.id],
  );

  const reload = useCallback(async () => {
    await load(true);
  }, [load]);

  useEffect(() => {
    const cached = rowCache.get(key);
    if (cached?.ready) {
      setData(cached.data as T[]);
      setLoading(false);
    } else {
      setData([]);
      setLoading(true);
    }
    void load(false);
  }, [key, load]);

  useEffect(() => {
    const realtimeTables = new Set([
      "agendamentos",
      "ordens_servico",
      "orcamentos",
      "clientes",
      "equipamentos",
      "financeiro",
      "pecas",
      "servicos",
    ]);
    if (!realtimeTables.has(table) || !supabase) return;

    let refreshTimer: number | undefined;
    const refreshSoon = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void reload(), 250);
    };

    const channel = supabase
      .channel(`rows-${table}-${empresa.id}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      )
      .subscribe();

    return () => {
      window.clearTimeout(refreshTimer);
      void supabase!.removeChannel(channel);
    };
  }, [table, empresa.id, reload]);

  return { data, loading, error, reload };
}
export async function saveRow(
  table: string,
  value: Record<string, unknown>,
  id?: string,
) {
  const result = id
    ? await supabase!
        .from(table)
        .update(value)
        .eq("id", id)
        .select("id")
        .single()
    : await supabase!.from(table).insert(value).select("id").single();
  if (result.error) throw result.error;
  return result.data.id as string;
}
export function latestQuotes(quotes: Orcamento[]) {
  return quotes.reduce<Record<string, Orcamento>>((map, q) => {
    if (!map[q.ordem_id] || map[q.ordem_id].versao < q.versao)
      map[q.ordem_id] = q;
    return map;
  }, {});
}
