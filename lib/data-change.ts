// Workspace focus/visibility/polling recovers updates missed by Realtime.
// Callers retain their existing debounce and remove this listener on unmount.
export function subscribeWorkspaceDataChanges(
  refresh: () => void,
  tables: readonly string[],
) {
  const onChange = (event: Event) => {
    const table = (event as CustomEvent<{ table?: unknown }>).detail?.table;
    if (typeof table === "string" && !tables.includes(table)) return;
    refresh();
  };
  window.addEventListener("horaria:data-change", onChange);
  return () => window.removeEventListener("horaria:data-change", onChange);
}
