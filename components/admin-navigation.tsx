"use client";

import { useState, type ReactNode } from "react";

export default function AdminNavigation({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="admin-navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        className="admin-menu-toggle"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        aria-controls="admin-navigation-links"
        onClick={() => setOpen((value) => !value)}
      >
        ☰
      </button>
      <div
        id="admin-navigation-links"
        className={
          open ? "admin-navigation-links is-open" : "admin-navigation-links"
        }
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
