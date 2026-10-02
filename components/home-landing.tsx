"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/home.module.css";

const devices = [
  ["celular", "Celulares"],
  ["notebook", "Notebooks"],
  ["tv", "TVs"],
  ["geladeira", "Geladeiras"],
  ["lavadora", "Máquinas de lavar"],
  ["ar", "Ar-condicionado"],
  ["outros", "Outros"],
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
    current = (current * 1103515245 + 12345) % 2147483647;
    const width = 1 + (current % 3);
    bars.push({ x, width });
    x += width + 2 + ((current >> 4) % 2);
  }
  return bars;
}

function HorariaMark() {
  return (
    <div className={styles.brandLockup} aria-label="Horária">
      <svg
        className={styles.brandMark}
        viewBox="0 0 220 240"
        role="img"
        aria-label="Símbolo Horária"
      >
        <g fill="currentColor">
          <path d="M8,0 H70 V102 L0,142 V8 Q0,0 8,0 Z" />
          <path d="M0,170 L70,130 V232 Q70,240 62,240 H8 Q0,240 0,232 Z" />
          <g transform="rotate(180 110 120)">
            <path d="M8,0 H70 V102 L0,142 V8 Q0,0 8,0 Z" />
            <path d="M0,170 L70,130 V232 Q70,240 62,240 H8 Q0,240 0,232 Z" />
          </g>
          <circle cx="86" cy="122" r="12" />
          <circle cx="112" cy="122" r="12" />
          <circle cx="138" cy="122" r="12" />
        </g>
      </svg>
      <span>Horária</span>
    </div>
  );
}

export default function HomeLanding() {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [date, setDate] = useState("--/--/----");
  const [selected, setSelected] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [error, setError] = useState("");
  const [stamped, setStamped] = useState(false);

  useEffect(() => {
    setDate(new Intl.DateTimeFormat("pt-BR").format(new Date()));
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
    const normalized = company.trim();
    if (!normalized) {
      setError("Dê um nome à sua assistência");
      return;
    }

    setError("");
    setStamped(true);
    window.setTimeout(() => {
      router.push(`/cadastro?empresa=${encodeURIComponent(normalized)}`);
    }, 420);
  }

  return (
    <main className={styles.page}>
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
            <HorariaMark />
            <p className={styles.eyebrow}>ASSISTÊNCIA TÉCNICA EM UM SÓ LUGAR</p>
            <h1 id="home-title">
              Todo aparelho que entra
              <br />
              ganha uma etiqueta.
            </h1>
            <p className={styles.supportingCopy}>
              Organize cada atendimento do recebimento à entrega, sem perder o
              histórico do aparelho.
            </p>
          </div>

          <div className={styles.tagStage}>
            <svg
              className={styles.string}
              viewBox="0 0 120 74"
              aria-hidden="true"
            >
              <path d="M60 72 C60 44, 100 38, 84 2" />
            </svg>

            <section className={styles.tagCard} aria-label="Criar espaço Horária">
              <span className={styles.hole} aria-hidden="true" />

              <div className={styles.tagHeader}>
                <strong>Horária</strong>
                <span>ORDEM DE SERVIÇO</span>
              </div>

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
                  setStamped(false);
                }}
                placeholder="Nome da sua assistência"
                autoComplete="organization"
                maxLength={100}
              />
              <p className={styles.error} role="alert">
                {error}
              </p>

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
                <legend>APARELHOS QUE VOCÊ CONSERTA</legend>
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
                {selected.includes("outros") && (
                  <input
                    className={styles.otherInput}
                    value={other}
                    onChange={(event) => setOther(event.target.value)}
                    placeholder="Quais outros aparelhos?"
                    autoComplete="off"
                  />
                )}
              </fieldset>

              <span
                className={`${styles.stamp} ${stamped ? styles.stampVisible : ""}`}
                aria-hidden="true"
              >
                ABERTA
              </span>

              <div className={styles.cutLine}>
                <span aria-hidden="true">✂</span>
                <i />
              </div>

              <div className={styles.tagFooter}>
                <div className={styles.barcodeWrap}>
                  <svg
                    className={styles.barcode}
                    viewBox="0 0 96 30"
                    aria-hidden="true"
                  >
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
                >
                  Criar espaço
                </button>
              </div>
            </section>

            <p className={styles.tagNote}>
              Você continua o cadastro na próxima etapa. Nenhum dado é salvo
              antes da confirmação.
            </p>
          </div>
        </section>

        <footer className={styles.footer}>
          <span>Ordens, clientes, equipamentos, agenda, estoque e financeiro.</span>
          <nav aria-label="Links legais">
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
