"use client";

import { Fragment, useMemo, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import { descargarConsolidado } from "@/lib/consolidado-export";
import {
  acum,
  AUDP_LABEL,
  HA_TOTAL_DE,
  computeConsolidado,
  HECTAREAS,
  PARIDAD_PLANILLAS,
  TIERRA_AUDP,
  VAN_RATE,
  VAN_RATE_SAN,
  VIVIENDAS,
  YEARS,
  type Audp,
  type Unidad,
} from "@/lib/consolidado-model";

// ── formato ──────────────────────────────────────────────────
const nf = (n: number) => Math.round(Math.abs(n)).toLocaleString("es-CL");
const sg = (n: number) => (n < -0.5 ? "−" : "") + nf(n);
const uf = (n: number) => `${sg(n)} UF`;
const tasa = (r: number) => `${(r * 100).toFixed(0)}%`;
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1).replace(".", ",")}%`);
const ha = (n: number) => (Math.abs(n) < 0.0005 ? "·" : n.toFixed(2).replace(".", ","));
const un = (n: number) => (Math.abs(n) < 0.5 ? "·" : Math.round(n).toLocaleString("es-CL"));

export default function ConsolidadoPage() {
  const [audp, setAudp] = useState<Audp>("ambos");
  const { tierra, sanitaria, consolidado } = useMemo(() => computeConsolidado(audp), [audp]);
  const unidades = [tierra, sanitaria, consolidado];
  const fisico = useMemo(() => {
    const h = HECTAREAS[audp], v = VIVIENDAS[audp];
    // el total viene de las constantes del proyecto: la serie anual redondea
    // a 3 decimales y perdería 0,006 ha al sumarse
    return { haAnual: h, haAcum: acum(h), vivAnual: v, vivAcum: acum(v), haTot: HA_TOTAL_DE[audp], vivTot: acum(v)[v.length - 1] };
  }, [audp]);
  const [bajando, setBajando] = useState(false);
  const exportar = async () => {
    setBajando(true);
    try {
      await descargarConsolidado(unidades, audp);
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* ── header ── */}
      <header className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-5 py-3 flex items-center gap-4">
        <a href={`${BASE_PATH}/`} className="text-zinc-500 hover:text-white text-sm transition-colors shrink-0">
          ← Inicio
        </a>
        <div className="h-5 w-px bg-zinc-800" />
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-tight">Consolidado por Unidad de Negocio</h1>
          <p className="text-[11px] text-zinc-500 truncate">
            {AUDP_LABEL[audp]} · flujo anual en UF · {YEARS[0]} – {YEARS[YEARS.length - 1]}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center rounded-md border border-zinc-700 overflow-hidden">
            {(["ambos", "batuco", "colina"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setAudp(k)}
                title={`Ver ${AUDP_LABEL[k]}`}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  audp === k ? "bg-zinc-200 text-zinc-900" : "text-zinc-400 hover:text-white"
                }`}
              >
                {k === "ambos" ? "Ambos" : k === "batuco" ? "Batuco" : "Colina"}
              </button>
            ))}
          </div>
          <button
            onClick={exportar}
            disabled={bajando}
            title="Descargar el consolidado en Excel: indicadores y flujo anual por unidad de negocio"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 disabled:opacity-50 transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" aria-hidden="true" fill="none">
              <path
                d="M8 1.5v8.5m0 0L4.75 6.75M8 10l3.25-3.25M2 11.5v1.75a1.25 1.25 0 0 0 1.25 1.25h9.5A1.25 1.25 0 0 0 14 13.25V11.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {bajando ? "Generando…" : "Excel"}
          </button>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-[1500px] mx-auto">
        {/* ── indicadores por unidad ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {unidades.map((u) => (
            <UnidadCard key={u.id} u={u} destacada={u.id === "consolidado"} />
          ))}
        </div>

        <Fisico f={fisico} u={consolidado} audp={audp} />
        <FlujoChart u={consolidado} />
        <FlujoTable unidades={unidades} fisico={fisico} />
        <Criterios />
        {audp === "ambos" ? (
          <Paridad tierra={tierra} sanitaria={sanitaria} />
        ) : (
          <p className="text-[11px] text-zinc-500 px-1">
            El contraste con las planillas del simulador corre sobre el total; vuelve a <span className="text-zinc-300">Ambos</span> para verlo.
          </p>
        )}
      </main>
    </div>
  );
}

// ── tarjeta de indicadores de una unidad ─────────────────────
function UnidadCard({ u, destacada }: { u: Unidad; destacada?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3.5 ${
        destacada ? "bg-emerald-950/30 border-emerald-800/60" : "bg-zinc-900/40 border-zinc-800"
      }`}
    >
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className={`text-[12px] uppercase tracking-wider font-bold ${destacada ? "text-emerald-300" : "text-zinc-300"}`}>
          {u.nombre}
        </h2>
        <span className={`text-sm font-bold tabular-nums ${u.totalResultado >= 0 ? "text-green-400" : "text-red-400"}`}>
          {uf(u.totalResultado)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Kpi
          label={u.id === "sanitaria" ? `VAN ${tasa(VAN_RATE_SAN)}` : u.id === "consolidado" ? `VAN · T ${tasa(VAN_RATE)} / S ${tasa(VAN_RATE_SAN)}` : `VAN ${tasa(VAN_RATE)} c/ tierra`}
          value={uf(u.van)}
          color={u.van >= 0 ? "text-green-400" : "text-red-400"}
        />
        <Kpi
          label={u.id === "sanitaria" ? "TIR (incl. f. gastada)" : "TIR c/ tierra (incl. f. gastada)"}
          value={pct(u.tir)}
          color={(u.tir ?? 0) >= (u.id === "sanitaria" ? VAN_RATE_SAN : VAN_RATE) ? "text-green-400" : "text-red-400"}
        />
        <Kpi label="Capital de Trabajo" value={uf(-u.capitalTrabajo)} color="text-red-400" />
        <Kpi label="Payback" value={String(u.payback ?? "—")} color="text-amber-400" />
        <Kpi label="Flujos (+) permanentes" value={String(u.flujosPermanentes)} color="text-zinc-200" />
        <Kpi label="Ingresos · Costos" value={`${nf(u.totalIngresos)} · ${sg(u.totalCostos)}`} color="text-zinc-400" />
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider leading-tight">{label}</div>
      <div className={`text-[13px] font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

interface Fisico {
  haAnual: number[];
  haAcum: number[];
  vivAnual: number[];
  vivAcum: number[];
  haTot: number;
  vivTot: number;
}

// ── superficie y viviendas vendidas ──────────────────────────
function Fisico({ f, u, audp }: { f: Fisico; u: Unidad; audp: Audp }) {
  const ufPorHa = f.haTot > 0 ? u.totalIngresos / f.haTot : 0;
  const ufPorViv = f.vivTot > 0 ? u.totalIngresos / f.vivTot : 0;
  const datos: Array<[string, string, string]> = [
    ["Hectáreas vendidas", ha(f.haTot), AUDP_LABEL[audp]],
    ["Viviendas vendidas", un(f.vivTot), "con el lote urbanizado"],
    ["UF por hectárea", nf(ufPorHa), "ingreso medio del suelo"],
    ["UF por vivienda", nf(ufPorViv), "ingreso medio por unidad"],
  ];
  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3.5">
      <h3 className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 mb-2.5">
        Superficie y viviendas vendidas
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {datos.map(([label, valor, sub]) => (
          <div key={label}>
            <div className="text-[9px] text-zinc-500 uppercase tracking-wider leading-tight">{label}</div>
            <div className="text-[17px] font-bold tabular-nums text-zinc-100 leading-tight">{valor}</div>
            <div className="text-[10px] text-zinc-500 leading-tight mt-0.5">{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── gráfico: barras del flujo neto consolidado + caja acumulada ──
function FlujoChart({ u }: { u: Unidad }) {
  const n = YEARS.length;
  const W = 1000, H = 300, PADL = 62, PADR = 14, PADT = 14, PADB = 30;
  const plotW = W - PADL - PADR;
  const plotH = H - PADT - PADB;
  const vals = [...u.resultado, ...u.resultadoAcum, 0];
  const maxV = Math.max(...vals);
  const minV = Math.min(...vals);
  const span = maxV - minV || 1;
  const y = (v: number) => PADT + ((maxV - v) / span) * plotH;
  const step = plotW / n;
  const bw = Math.min(30, step * 0.62);
  const tickStep = span > 1200000 ? 400000 : span > 600000 ? 200000 : 100000;
  const ticks: number[] = [];
  for (let t = Math.ceil(minV / tickStep) * tickStep; t <= maxV; t += tickStep) ticks.push(t);
  const line = u.resultadoAcum.map((v, i) => `${i === 0 ? "M" : "L"} ${PADL + step * (i + 0.5)} ${y(v)}`).join(" ");

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center gap-4 mb-1 flex-wrap">
        <h3 className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">
          Flujo de caja anual consolidado
        </h3>
        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
          <Legend color="#15803D" label="Flujo positivo" />
          <Legend color="#B91C1C" label="Flujo negativo" />
          <span className="flex items-center gap-1">
            <svg width="14" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke="#e4e4e7" strokeWidth="1.5" /></svg>
            Caja acumulada
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "clamp(220px, 32vh, 320px)" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} stroke={Math.abs(t) < 1 ? "#52525b" : "#27272a"} strokeWidth={Math.abs(t) < 1 ? 1 : 0.5} />
            <text x={PADL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#71717a" className="tabular-nums">
              {t === 0 ? "0" : `${t < 0 ? "−" : ""}${Math.abs(t) / 1000}k`}
            </text>
          </g>
        ))}
        {u.resultado.map((v, i) => {
          const cx = PADL + step * (i + 0.5);
          const zero = y(0);
          const top = y(Math.max(v, 0));
          const h = Math.abs(y(v) - zero);
          return (
            <rect
              key={i}
              x={cx - bw / 2}
              y={v >= 0 ? top : zero}
              width={bw}
              height={Math.max(h, 0.5)}
              fill={v >= 0 ? "#15803D" : "#B91C1C"}
              rx="2"
            />
          );
        })}
        <path d={line} fill="none" stroke="#e4e4e7" strokeWidth="1.5" />
        {u.resultadoAcum.map((v, i) => (
          <circle key={i} cx={PADL + step * (i + 0.5)} cy={y(v)} r="2.4" fill="#e4e4e7" />
        ))}
        {YEARS.map((yr, i) =>
          i % 2 === 0 ? (
            <text key={yr} x={PADL + step * (i + 0.5)} y={H - 10} textAnchor="middle" fontSize="9" fill="#71717a">
              {yr}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
      {label}
    </span>
  );
}

// ── tabla anual por unidad de negocio ────────────────────────
function FlujoTable({ unidades, fisico }: { unidades: Unidad[]; fisico: Fisico }) {
  const cols = YEARS;
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const toggleFila = (k: string) =>
    setAbiertas((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const cell = (v: number) =>
    Math.abs(v) > 0.5 ? (
      <span className={v < -0.5 ? "text-red-400" : "text-zinc-300"}>{sg(v)}</span>
    ) : (
      <span className="text-zinc-700">·</span>
    );

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800">
        <h3 className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">
          Flujo anual por unidad de negocio · UF
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums whitespace-nowrap">
          <thead>
            <tr className="bg-[#2C4A3B] text-white">
              <th className="text-left font-semibold px-3 py-1.5 sticky left-0 bg-[#2C4A3B] z-10">Concepto</th>
              {cols.map((y) => (
                <th key={y} className="text-right font-semibold px-2 py-1.5 text-[10px]">{y}</th>
              ))}
              <th className="text-right font-semibold px-3 py-1.5">Total</th>
            </tr>
          </thead>
          <tbody>
            {/* ── venta física: hectáreas y viviendas ── */}
            <tr className="bg-[#D9E5DD]">
              <td colSpan={cols.length + 2} className="px-3 py-1 text-[10px] font-bold text-[#2C4A3B] uppercase tracking-wide sticky left-0 bg-[#D9E5DD]">
                Venta física
              </td>
            </tr>
            {(
              [
                ["Hectáreas vendidas", fisico.haAnual, ha, false],
                ["Hectáreas acumuladas", fisico.haAcum, ha, true],
                ["Viviendas vendidas", fisico.vivAnual, un, false],
                ["Viviendas acumuladas", fisico.vivAcum, un, true],
              ] as Array<[string, number[], (n: number) => string, boolean]>
            ).map(([label, arr, fmt, acumulada]) => (
              <tr key={label} className="border-b border-zinc-800/70 hover:bg-zinc-800/30">
                <td className={`px-3 py-1 text-left sticky left-0 bg-zinc-950/95 ${acumulada ? "italic text-zinc-500" : "text-zinc-300"}`}>
                  {label}
                </td>
                {arr.map((v, i) => (
                  <td key={i} className={`px-2 py-1 text-right ${acumulada ? "italic text-zinc-500" : "text-zinc-300"}`}>
                    {fmt(v)}
                  </td>
                ))}
                <td className={`px-3 py-1 text-right font-semibold ${acumulada ? "italic text-zinc-500" : "text-zinc-200"}`}>
                  {fmt(acumulada ? arr[arr.length - 1] : arr.reduce((a, b) => a + b, 0))}
                </td>
              </tr>
            ))}
            {unidades.map((u) => {
              const tierraLinea = u.costos.find((c) => c.label.startsWith("Costo de la Tierra"));
              return (
                <Fragment key={u.id}>
                  <tr className="bg-[#D9E5DD]">
                    <td colSpan={cols.length + 2} className="px-3 py-1 text-[10px] font-bold text-[#2C4A3B] uppercase tracking-wide sticky left-0 bg-[#D9E5DD]">
                      Unidad {u.nombre}
                    </td>
                  </tr>
                  {[...u.ingresos, ...u.costos.filter((c) => !c.label.startsWith("Costo de la Tierra"))].map((l) => {
                    const k = `${u.id}·${l.label}`;
                    const abierta = abiertas.has(k);
                    return (
                      <Fragment key={k}>
                        <tr className="border-b border-zinc-800/70 hover:bg-zinc-800/30">
                          <td className="px-3 py-1 text-left text-zinc-300 sticky left-0 bg-zinc-950/95">
                            {l.detalle ? (
                              <button onClick={() => toggleFila(k)} className="flex items-center gap-1 hover:text-white transition-colors">
                                <span className={`inline-block text-[9px] text-zinc-500 transition-transform ${abierta ? "rotate-90" : ""}`}>▶</span>
                                {l.label}
                              </button>
                            ) : (
                              l.label
                            )}
                          </td>
                          {l.arr.map((v, i) => (
                            <td key={i} className="px-2 py-1 text-right">{cell(v)}</td>
                          ))}
                          <td className={`px-3 py-1 text-right font-semibold ${l.total < -0.5 ? "text-red-400" : "text-zinc-200"}`}>
                            {sg(l.total)}
                          </td>
                        </tr>
                        {abierta &&
                          l.detalle?.map((h) => (
                            <tr key={`${k}·${h.label}`} className="border-b border-zinc-800/50">
                              <td className="pl-8 pr-3 py-0.5 text-left text-[10px] text-zinc-500 italic sticky left-0 bg-zinc-950/95">{h.label}</td>
                              {h.arr.map((v, i) => (
                                <td key={i} className="px-2 py-0.5 text-right text-[10px] italic text-zinc-500">
                                  {Math.abs(v) > 0.5 ? sg(v) : "·"}
                                </td>
                              ))}
                              <td className="px-3 py-0.5 text-right text-[10px] italic text-zinc-500">{sg(h.total)}</td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                  <tr className="bg-zinc-800/60 border-t border-zinc-700">
                    <td className="px-3 py-1.5 text-left font-bold sticky left-0 bg-zinc-800">FLUJO NETO</td>
                    {u.resultado.map((v, i) => (
                      <td key={i} className={`px-2 py-1.5 text-right font-bold ${v < -0.5 ? "text-red-400" : "text-green-400"}`}>
                        {sg(v)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-bold">{sg(u.totalResultado)}</td>
                  </tr>
                  <tr className="bg-zinc-900 border-b border-zinc-800">
                    <td className="px-3 py-1.5 text-left italic text-zinc-400 sticky left-0 bg-zinc-900">Caja acumulada</td>
                    {u.resultadoAcum.map((v, i) => (
                      <td key={i} className={`px-2 py-1.5 text-right ${v < -0.5 ? "text-red-400" : "text-zinc-400"}`}>
                        {sg(v)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-bold">{sg(u.resultadoAcum[u.resultadoAcum.length - 1])}</td>
                  </tr>
                  {tierraLinea && (
                    <tr className="border-b border-zinc-800/70">
                      <td className="px-3 py-1 text-left italic text-zinc-500 sticky left-0 bg-zinc-950/95">{tierraLinea.label}</td>
                      {tierraLinea.arr.map((v, i) => (
                        <td key={i} className="px-2 py-1 text-right italic text-zinc-500">
                          {Math.abs(v) > 0.5 ? sg(v) : "·"}
                        </td>
                      ))}
                      <td className="px-3 py-1 text-right italic text-zinc-500 font-semibold">{sg(tierraLinea.total)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── criterios ────────────────────────────────────────────────
function Criterios() {
  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3.5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[11px] text-zinc-500 leading-relaxed">
      <p>
        <span className="text-zinc-300 font-semibold">Tierra ({nf(TIERRA_AUDP)} UF):</span> se devenga proporcional a la
        venta e impacta VAN, TIR y costos, pero no el capital de trabajo — es un aporte de los dueños, no caja a financiar.
      </p>
      <p>
        <span className="text-zinc-300 font-semibold">Primeros años:</span> hasta 2034 mandan los números de la planilla
        semestral de Integración (urbanizar primero, vender después: caja más negativa, escenario real). Desde 2035 los
        residuos siguen la forma de las planillas anuales para que los totales calcen con ellas.
      </p>
      <p>
        <span className="text-zinc-300 font-semibold">Unidades:</span> la tierra asume las inversiones sanitarias; la
        sanitaria las paga y recibe del desarrollador un pago equivalente (neto 0), opera la planta y el 2045 vende el
        negocio en 147.433 UF.
      </p>
      <p>
        <span className="text-zinc-300 font-semibold">Capital de trabajo:</span> Tierra y Consolidado sobre el resultado
        acumulado (incluye factibilización gastada); Sanitaria sobre el flujo futuro — el pago del desarrollador ya netea
        las inversiones (criterio del simulador).
      </p>
      <p>
        <span className="text-zinc-300 font-semibold">Tasas y TIR:</span> la TIR corre desde 2026 e incluye la
        factibilización gastada. El VAN la excluye (costo hundido): tierra al {tasa(VAN_RATE)}, sanitaria al {tasa(VAN_RATE_SAN)},
        y el consolidado suma los VAN por unidad. La etapa 6 de la planta cierra completa en 2041.
      </p>
    </div>
  );
}

// ── paridad con las planillas anuales del simulador ──────────
function Paridad({ tierra, sanitaria }: { tierra: Unidad; sanitaria: Unidad }) {
  const total = (labelStart: string) => {
    const l = tierra.costos.find((c) => c.label.startsWith(labelStart));
    return l ? Math.round(l.total) : 0;
  };
  const filas: Array<[string, number, number]> = [
    ["Ingresos Venta de Tierra", Math.round(tierra.totalIngresos), PARIDAD_PLANILLAS.ingresosTierra],
    ["Costos Infraestructura", total("Costos Infraestructura"), PARIDAD_PLANILLAS.infraestructura],
    ["Costos Mitigaciones", total("Costos Mitigaciones"), PARIDAD_PLANILLAS.mitigaciones],
    ["Mantención y seguridad", total("Mantención"), PARIDAD_PLANILLAS.mantencion],
    ["Inversiones Sanitarias", total("Inversiones Sanitarias"), PARIDAD_PLANILLAS.inversionesSanitarias],
    ["Resultado Sanitaria", Math.round(sanitaria.totalResultado), PARIDAD_PLANILLAS.resultadoSanitariaPlanilla],
  ];
  const cuadra = filas.every(([, v, p]) => Math.abs(v - p) < 2);
  return (
    <div className={`rounded-lg border p-3.5 ${cuadra ? "bg-emerald-950/20 border-emerald-900/50" : "bg-red-950/20 border-red-900/50"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[12px] font-bold ${cuadra ? "text-emerald-400" : "text-red-400"}`}>
          {cuadra ? "✓ Totales calzan con las planillas del simulador" : "✗ Los totales se desviaron de las planillas"}
        </span>
        <span className="text-[10px] text-zinc-500">
          primeras_etapas_audp · primeras_etapas_sanAudp · única diferencia: equipamiento comercial ({sg(PARIDAD_PLANILLAS.equipamientoSemestral)} UF, viene de la semestral)
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {filas.map(([label, vivo, deck]) => (
          <div key={label}>
            <div className="text-[9px] text-zinc-500 uppercase tracking-wider leading-tight">{label}</div>
            <div className="text-[12px] font-bold tabular-nums text-zinc-200">{uf(vivo)}</div>
            <div className={`text-[10px] tabular-nums ${Math.abs(vivo - deck) < 2 ? "text-zinc-500" : "text-red-400"}`}>
              planilla {sg(deck)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
