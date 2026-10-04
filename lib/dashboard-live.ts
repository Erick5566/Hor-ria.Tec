import type { SupabaseClient } from "@supabase/supabase-js";

// Realtime refreshes immediately; polling also covers missed events and midnight.
export function watchDashboard(
  client: SupabaseClient,
  companyId: string,
  refresh: () => Promise<void>,
  includeFinance = true,
) {
  let stopped = false;
  let running = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const visible = () =>
    document.visibilityState !== "hidden" && navigator.onLine;
  const run = async () => {
    if (stopped || !visible()) return;
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await refresh();
    } finally {
      running = false;
      if (pending && !stopped) {
        pending = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => void run(), 250);
  };
  const channel = client.channel(`dashboard-${companyId}`);
  const tables = [
    "ordens_servico",
    "agendamentos",
    "clientes",
    "equipamentos",
    ...(includeFinance ? ["financeiro"] : []),
  ];
  for (const table of tables) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: `empresa_id=eq.${companyId}`,
      },
      schedule,
    );
  }
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") schedule();
  });
  const poll = setInterval(() => void run(), 10000);
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("online", schedule);
  window.addEventListener("focus", schedule);
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(poll);
    document.removeEventListener("visibilitychange", schedule);
    window.removeEventListener("online", schedule);
    window.removeEventListener("focus", schedule);
    void client.removeChannel(channel);
  };
}
