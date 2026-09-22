/**
 * Public customer-page theme defaults.
 *
 * The administrative panel uses CSS --ui-* tokens from app/theme.css.
 * Customer public pages intentionally have a separate, configurable theme so
 * changing a company's brand never changes the Horária management interface.
 */
export const publicPageThemeDefaults = {
  primary: "#06141B",
  secondary: "#253745",
  button: "#11212D",
  accent: "#4A5C6A",
  background: "#CCD0CF",
  text: "#06141B",
  theme: "claro" as const,
} as const;

export type PublicPageTheme = {
  primary: string;
  secondary: string;
  button: string;
  accent: string;
  background: string;
  text: string;
  theme: "claro" | "escuro";
};
