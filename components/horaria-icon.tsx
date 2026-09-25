import type { SVGProps } from "react";

export type HorariaIconName =
  | "home"
  | "receive"
  | "central"
  | "calendar"
  | "orders"
  | "clients"
  | "devices"
  | "stock"
  | "finance"
  | "reports"
  | "services"
  | "business"
  | "publicPage"
  | "team"
  | "settings"
  | "profile"
  | "help"
  | "logout"
  | "more";

type Props = SVGProps<SVGSVGElement> & {
  name: HorariaIconName;
};

// Tabler Icons, selected through the 21st.dev icon catalogue.
// Tabler Icons are MIT licensed and use one consistent 24px outline language.
export function HorariaIcon({ name, className = "", ...props }: Props) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: `horaria-icon ${className}`.trim(),
    ...props,
  };

  if (name === "home")
    return (
      <svg {...common}>
        <path d="M5 12l-2 0l9 -9l9 9l-2 0" />
        <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" />
        <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" />
      </svg>
    );

  if (name === "receive")
    return (
      <svg {...common}>
        <path d="M12 21l-8 -4.5v-9l8 -4.5l8 4.5v4.5" />
        <path d="M12 12l8 -4.5M12 12v9M12 12l-8 -4.5" />
        <path d="M22 18h-7M18 15l-3 3l3 3" />
      </svg>
    );

  if (name === "central")
    return (
      <svg {...common}>
        <path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" />
        <path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" />
      </svg>
    );

  if (name === "calendar")
    return (
      <svg {...common}>
        <path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12" />
        <path d="M16 3v4M8 3v4M4 11h16M11 15h1M12 15v3" />
      </svg>
    );

  if (name === "orders")
    return (
      <svg {...common}>
        <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
        <path d="M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2" />
        <path d="M9 12l.01 0M13 12l2 0M9 16l.01 0M13 16l2 0" />
      </svg>
    );

  if (name === "clients")
    return (
      <svg {...common}>
        <path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
        <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0 -3 -3.85" />
      </svg>
    );

  if (name === "devices")
    return (
      <svg {...common}>
        <path d="M6 5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14" />
        <path d="M11 4h2M12 17v.01" />
      </svg>
    );

  if (name === "stock")
    return (
      <svg {...common}>
        <path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" />
        <path d="M12 12l8 -4.5M12 12l0 9M12 12l-8 -4.5" />
      </svg>
    );

  if (name === "finance")
    return (
      <svg {...common}>
        <path d="M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12" />
        <path d="M20 12v4h-4a2 2 0 0 1 0 -4h4" />
      </svg>
    );

  if (name === "reports")
    return (
      <svg {...common}>
        <path d="M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6" />
        <path d="M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10" />
        <path d="M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14M4 20h14" />
      </svg>
    );

  if (name === "services")
    return (
      <svg {...common}>
        <path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5" />
      </svg>
    );

  if (name === "business")
    return (
      <svg {...common}>
        <path d="M3 21l18 0" />
        <path d="M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4" />
        <path d="M5 21l0 -10.15M19 21l0 -10.15M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4" />
      </svg>
    );

  if (name === "publicPage")
    return (
      <svg {...common}>
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0M3.6 9h16.8M3.6 15h16.8" />
        <path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18" />
      </svg>
    );

  if (name === "team")
    return (
      <svg {...common}>
        <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0M6 21v-2a4 4 0 0 1 4 -4h2.5" />
        <path d="M17.001 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M19.001 15.5v1.5M19.001 21v1.5" />
        <path d="M22.032 17.25l-1.299 .75M17.27 20l-1.3 .75M15.97 17.25l1.3 .75M20.733 20l1.3 .75" />
      </svg>
    );

  if (name === "settings")
    return (
      <svg {...common}>
        <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065" />
        <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      </svg>
    );

  if (name === "profile")
    return (
      <svg {...common}>
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
        <path d="M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855" />
      </svg>
    );

  if (name === "help")
    return (
      <svg {...common}>
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0M12 16v.01" />
        <path d="M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483" />
      </svg>
    );

  if (name === "logout")
    return (
      <svg {...common}>
        <path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" />
        <path d="M9 12h12l-3 -3M18 15l3 -3" />
      </svg>
    );

  return (
    <svg {...common}>
      <path d="M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <path d="M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <path d="M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4M14 7l6 0M17 4l0 6" />
    </svg>
  );
}
