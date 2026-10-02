-- Restringe a leitura e alteração da senha do aparelho aos papéis técnicos.
-- Atendentes continuam podendo registrar a senha durante o recebimento/abertura da OS.
begin;

drop policy if exists tenant_member_select on public.equipamento_segredos;
drop policy if exists equipamento_segredos_technical_select on public.equipamento_segredos;
create policy equipamento_segredos_technical_select
on public.equipamento_segredos
for select
to authenticated
using (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_update on public.equipamento_segredos;
drop policy if exists equipamento_segredos_technical_update on public.equipamento_segredos;
create policy equipamento_segredos_technical_update
on public.equipamento_segredos
for update
to authenticated
using (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
)
with check (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
);

commit;
