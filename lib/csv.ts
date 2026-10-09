/** Quote a CSV cell and prevent user-controlled text from becoming a formula. */
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe =
    /^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)
      ? "'" + text
      : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
