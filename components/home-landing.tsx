"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/home.module.css";
import HorariaHeroBrand from "@/components/horaria-hero-brand";

const devices = [
  ["celular", "Celular"],
  ["informatica", "Informática"],
  ["eletrodomesticos", "Eletrodomésticos"],
] as const;

function hash(value: string) {
  let current = 7;
  for (let index = 0; index < value.length; index += 1) {
    current = (current * 31 + value.charCodeAt(index)) % 100000;
  }
  return current;
}

function barcode(seed: number) {
  const bars: Array<{ x: number; width: number }> = [];
  let x = 0;
  let current = seed || 1234;

  while (x < 94) {
    current = (Math.imul(current, 1103515245) + 12345) >>> 0;
    const width = 1 + (current % 3);
    bars.push({ x, width });
    x += width + 2 + ((current >>> 4) % 2);
  }

  return bars;
}

export default function HomeLanding() {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [date, setDate] = useState("--/--/----");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const redirectTimer = useRef<number | null>(null);

  useEffect(() => {
    setDate(new Intl.DateTimeFormat("pt-BR").format(new Date()));

    return () => {
      if (redirectTimer.current !== null) {
        window.clearTimeout(redirectTimer.current);
      }
    };
  }, []);

  const number = useMemo(() => {
    const normalized = company.trim();
    return normalized ? (hash(normalized) % 9000) + 1000 : 1;
  }, [company]);

  const bars = useMemo(() => barcode(number * 97), [number]);

  function toggleDevice(value: string) {
    setSelected((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  function createSpace() {
    if (creating) return;

    const normalized = company.trim();
    if (!normalized) {
      setError("Dê um nome à sua assistência");
      return;
    }

    setError("");
    setCreating(true);
    redirectTimer.current = window.setTimeout(() => {
      redirectTimer.current = null;
      router.push(`/cadastro?empresa=${encodeURIComponent(normalized)}`);
    }, 280);
  }

  return (
    <main data-entry-viewport className={`${styles.page} ${styles.homeViewport}`}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <span>Já tem conta?</span>
          <Link className={styles.loginButton} href="/entrar">
            Entrar
          </Link>
        </header>

        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.brandSide}>
            <div className={styles.orbit} aria-hidden="true" />
            <HorariaHeroBrand />
            <p className={styles.eyebrow}>ASSISTÊNCIA TÉCNICA EM UM SÓ LUGAR</p>
            <h1 id="home-title">
              Todo aparelho que entra
              <br />
              ganha uma etiqueta.
            </h1>
          </div>

          <div className={styles.tagStage}>
            <svg className={styles.string} viewBox="0 0 120 74" aria-hidden="true">
              <path d="M60 72 C60 44, 100 38, 84 2" />
            </svg>

            <section className={styles.tagCard} aria-label="Criar espaço Horária">
              <span className={styles.hole} aria-hidden="true" />

              <div className={styles.tagHeader}>
                <strong>Horária</strong>
                <span>ORDEM DE SERVIÇO</span>
              </div>

              <div className={styles.companyField}>
                <label className={styles.fieldLabel} htmlFor="home-company">
                  ASSISTÊNCIA
                </label>
                <input
                  id="home-company"
                  className={styles.lineInput}
                  value={company}
                  onChange={(event) => {
                    setCompany(event.target.value);
                    setError("");
                  }}
                  placeholder="Nome da sua assistência"
                  autoComplete="organization"
                  maxLength={100}
                />
                <p className={styles.error} role="alert">{error}</p>
              </div>

              <div className={styles.metaRow}>
                <div>
                  <span>ENTRADA</span>
                  <strong>{date}</strong>
                </div>
                <div>
                  <span>PRIORIDADE</span>
                  <strong>Hoje</strong>
                </div>
              </div>

              <fieldset className={styles.deviceFieldset}>
                <legend>O QUE VOCÊ CONSERTA?</legend>
                <div className={styles.chips}>
                  {devices.map(([value, label]) => {
                    const active = selected.includes(value);
                    return (
                      <label
                        className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                        key={value}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleDevice(value)}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className={styles.cutLine} aria-hidden="true">
                <span />
                <i />
              </div>

              <div className={styles.tagFooter}>
                <div className={styles.barcodeWrap}>
                  <svg className={styles.barcode} viewBox="0 0 96 30" aria-hidden="true">
                    {bars.map((bar, index) => (
                      <rect
                        key={`${bar.x}-${index}`}
                        x={bar.x}
                        y="0"
                        width={bar.width}
                        height="30"
                      />
                    ))}
                  </svg>
                  <small>OS-{String(number).padStart(4, "0")}</small>
                </div>
                <button
                  className={styles.createButton}
                  type="button"
                  onClick={createSpace}
                  disabled={creating}
                  aria-busy={creating}
                >
                  {creating ? "Abrindo…" : "Criar espaço"}
                </button>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
