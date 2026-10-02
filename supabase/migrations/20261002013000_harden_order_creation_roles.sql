-- Permite que a equipe operacional crie OS e impede referências cruzadas
-- entre clientes/equipamentos de empresas diferentes.
begin;

create or replace function public.criar_ordem(
  p_empresa uuid,
  p_cliente jsonb,
  p_equipamento jsonb,
  p_ordem jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  c uuid;
  e uuid;
  o uuid;
  categoria_equipamento text;
begin
  if not private.can_access_company(p_empresa) then
    raise exception 'Empresa não autorizada';
  end if;

  if length(trim(coalesce(p_ordem->>'problema', ''))) not between 3 and 5000 then
    raise exception 'Preencha o campo Problema relatado pelo cliente, abaixo de Observações, com 3 a 5.000 caracteres. Exemplo: Não liga. Marcar as condições de entrada não preenche esse campo.';
  end if;

  p_ordem := jsonb_set(
    p_ordem,
    '{problema}',
    to_jsonb(trim(p_ordem->>'problema'))
  );

  categoria_equipamento :=
    coalesce(nullif(trim(p_equipamento->>'categoria'), ''), 'Outro');

  if categoria_equipamento = 'Outro'
     and length(trim(coalesce(p_equipamento->>'tipo_personalizado', '')))
       not between 2 and 120 then
    raise exception 'Informe o tipo do equipamento';
  end if;

  if nullif(p_cliente->>'id', '') is not null then
    select cliente.id
      into c
    from public.clientes cliente
    where cliente.id = (p_cliente->>'id')::uuid
      and cliente.empresa_id = p_empresa;

    if c is null then
      raise exception 'Cliente não pertence a esta assistência';
    end if;
  else
    insert into public.clientes(
      empresa_id,
      nome,
      whatsapp,
      email,
      documento
    )
    values(
      p_empresa,
      p_cliente->>'nome',
      regexp_replace(p_cliente->>'whatsapp', '\D', '', 'g'),
      nullif(p_cliente->>'email', ''),
      nullif(p_cliente->>'documento', '')
    )
    returning id into c;
  end if;

  if nullif(p_equipamento->>'id', '') is not null then
    select equipamento.id
      into e
    from public.equipamentos equipamento
    where equipamento.id = (p_equipamento->>'id')::uuid
      and equipamento.empresa_id = p_empresa
      and equipamento.cliente_id = c;

    if e is null then
      raise exception 'Equipamento não pertence ao cliente desta assistência';
    end if;
  else
    insert into public.equipamentos(
      empresa_id,
      cliente_id,
      categoria,
      tipo_personalizado,
      marca,
      modelo,
      cor,
      numero_serie,
      imei,
      acessorios
    )
    values(
      p_empresa,
      c,
      categoria_equipamento,
      case
        when categoria_equipamento = 'Outro'
          then trim(p_equipamento->>'tipo_personalizado')
        else null
      end,
      coalesce(p_equipamento->>'marca', ''),
      p_equipamento->>'modelo',
      p_equipamento->>'cor',
      p_equipamento->>'numero_serie',
      p_equipamento->>'imei',
      p_equipamento->>'acessorios'
    )
    returning id into e;
  end if;

  insert into public.ordens_servico(
    empresa_id,
    cliente_id,
    equipamento_id,
    problema,
    estado,
    observacoes_estado,
    tecnico,
    previsao
  )
  values(
    p_empresa,
    c,
    e,
    p_ordem->>'problema',
    coalesce(
      array(select jsonb_array_elements_text(p_ordem->'estado')),
      '{}'
    ),
    p_ordem->>'observacoes_estado',
    coalesce(p_ordem->>'tecnico', ''),
    nullif(p_ordem->>'previsao', '')::date
  )
  returning id into o;

  if length(coalesce(p_equipamento->>'senha', '')) > 0 then
    insert into public.equipamento_segredos(
      ordem_id,
      empresa_id,
      senha
    )
    values(
      o,
      p_empresa,
      p_equipamento->>'senha'
    );
  end if;

  return o;
end
$function$;

revoke all on function public.criar_ordem(uuid, jsonb, jsonb, jsonb)
from public, anon;
grant execute on function public.criar_ordem(uuid, jsonb, jsonb, jsonb)
to authenticated;

commit;
