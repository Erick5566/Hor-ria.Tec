alter table public.empresas
  drop constraint if exists empresas_slug_not_reserved;

alter table public.empresas
  add constraint empresas_slug_not_reserved
  check (
    slug not in (
      'painel',
      'agendar',
      'acompanhar',
      'api',
      'admin',
      'entrar',
      'cadastro',
      'privacidade',
      'recuperar-senha',
      'redefinir-senha',
      'solicitacao-enviada',
      'manutencao',
      'conta-bloqueada'
    )
  );
