"use client";

import { Fragment, useMemo, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import { descargarConsolidado } from "@/lib/consolidado-export";
import {
  ALCANCE_LABEL,
  AUDP_LABEL,
  MACRO_AUDP,
  MACRO_INICIO,
  MACRO_PRECIO,
  computeConsolidado,
  PARIDAD_PLANILLAS,
  TIERRA_AUDP,
  TASAS,
  VAN_RATE,
  YEARS,
  type Alcance,
  type Audp,
  type Fisico,
  type Unidad,
} from "@/lib/consolidado-model";

// ── formato ──────────────────────────────────────────────────
const nf = (n: number) => Math.round(Math.abs(n)).toLocaleString("es-CL");
const sg = (n: number) => (n < -0.5 ? "−" : "") + nf(n);
const uf = (n: number) => `${sg(n)} UF`;
const tasa_ = (r: number) => `${(r * 100).toFixed(0)}%`;
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1).replace(".", ",")}%`);
const ha = (n: number) => (Math.abs(n) < 0.0005 ? "·" : n.toFixed(2).replace(".", ","));
const un = (n: number) => (Math.abs(n) < 0.5 ? "·" : Math.round(n).toLocaleString("es-CL"));

export default function ConsolidadoPage() {
  const [audp, setAudp] = useState<Audp>("ambos");
  const [tasa, setTasa] = useState<number>(VAN_RATE);
  const [alcance, setAlcance] = useState<Alcance>("inmobiliario");
  const [macrolotes, setMacrolotes] = useState(false);
  const { inmobiliario, fisico } = useMemo(
    () => computeConsolidado(audp, tasa, alcance, macrolotes),
    [audp, tasa, alcance, macrolotes],
  );
  const [bajando, setBajando] = useState(false);
  const exportar = async () => {
    setBajando(true);
    try {
      await descargarConsolidado([inmobiliario], audp, tasa);
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* ── header ── */}
      <header className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <a href={`${BASE_PATH}/`} className="text-zinc-500 hover:text-white text-sm transition-colors shrink-0">
          ← Inicio
        </a>
        <div className="h-5 w-px bg-zinc-800" />
        <div className="min-w-0 shrink">
          <h1 className="text-base font-bold leading-tight">Consolidado — {ALCANCE_LABEL[alcance]}</h1>
          <p className="text-[11px] text-zinc-500 truncate">
            {ALCANCE_LABEL[alcance]}{macrolotes ? " · Macrolotes" : ""} · {AUDP_LABEL[audp]} · UF · {YEARS[0]} – {YEARS[YEARS.length - 1]}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => setMacrolotes((m) => !m)}
            aria-pressed={macrolotes}
            title="Vender la superficie bruta en macrolotes de 5 a 7 ha, uno por año en cada AUDP; el desarrollador urbaniza"
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
              macrolotes ? "bg-amber-300 text-zinc-900 border-amber-300" : "border-zinc-700 text-zinc-400 hover:text-white"
            }`}
          >
            Macrolotes
          </button>
          <div className="flex items-center rounded-md border border-zinc-700 overflow-hidden">
            {(["inmobiliario", "completo"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setAlcance(k)}
                title={`Evaluar ${ALCANCE_LABEL[k]}`}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  alcance === k ? "bg-zinc-200 text-zinc-900" : "text-zinc-400 hover:text-white"
                }`}
              >
                {k === "inmobiliario" ? "Inmobiliario" : "Proyecto completo"}
              </button>
            ))}
          </div>
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
          <div className="flex items-center rounded-md border border-zinc-700 overflow-hidden">
            {TASAS.map((r) => (
              <button
                key={r}
                onClick={() => setTasa(r)}
                title={`Descontar al ${tasa_(r)}`}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  tasa === r ? "bg-zinc-200 text-zinc-900" : "text-zinc-400 hover:text-white"
                }`}
              >
                {tasa_(r)}
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
        <UnidadCard u={inmobiliario} destacada />

        <Fisico f={fisico} u={inmobiliario} audp={audp} macrolotes={macrolotes} />
        <FlujoChart u={inmobiliario} />
        <FlujoTable unidades={[inmobiliario]} fisico={fisico} />
        {macrolotes && <CriteriosMacro />}
        <Criterios />
        {macrolotes ? null : audp === "ambos" ? (
          <Paridad tierra={inmobiliario} />
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
          label={`VAN ${tasa_(u.vanTasa ?? VAN_RATE)} c/ tierra`}
          value={uf(u.van)}
          color={u.van >= 0 ? "text-green-400" : "text-red-400"}
        />
        <Kpi
          label="TIR c/ tierra"
          value={pct(u.tir)}
          color={(u.tir ?? 0) >= (u.vanTasa ?? VAN_RATE) ? "text-green-400" : "text-red-400"}
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

// ── superficie y viviendas vendidas ──────────────────────────
function Fisico({ f, u, audp, macrolotes }: { f: Fisico; u: Unidad; audp: Audp; macrolotes: boolean }) {
  // siempre sobre el ingreso de SUELO: en el proyecto completo el total
  // arrastra la operación sanitaria y el UF/ha dejaría de significar nada
  const ingSuelo = u.ingresos
    .filter((l) => /Venta de Tierra|COPEC/.test(l.label))
    .reduce((s, l) => s + l.total, 0);
  const ufPorHa = f.haTot > 0 ? ingSuelo / f.haTot : 0;
  const ufPorViv = f.vivTot > 0 ? ingSuelo / f.vivTot : 0;
  const datos: Array<[string, string, string]> = [
    ["Hectáreas vendidas", ha(f.haTot), macrolotes ? `${AUDP_LABEL[audp]} · brutas` : AUDP_LABEL[audp]],
    ["Viviendas vendidas", un(f.vivTot), macrolotes ? "las construye el desarrollador" : "con el lote urbanizado"],
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
          Flujo de caja anual
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
          Flujo anual · UF
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
function CriteriosMacro() {
  const b = MACRO_AUDP.batuco, c = MACRO_AUDP.colina;
  return (
    <div className="bg-amber-950/20 border border-amber-800/50 rounded-lg p-3.5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[11px] text-zinc-400 leading-relaxed">
      <p>
        <span className="text-amber-300 font-semibold">Macrolotes:</span> se vende la superficie bruta, uno por año en
        cada AUDP desde {MACRO_INICIO}. Batuco {ha(b.ha)} ha en {b.orden.length} macrolotes de {ha(b.ha / b.orden.length)} ha;
        Colina {ha(c.ha)} ha en {c.orden.length} de {ha(c.ha / c.orden.length)} ha. Se alternan, partiendo por edificios.
      </p>
      <p>
        <span className="text-amber-300 font-semibold">Precios:</span> casas y townhouses{" "}
        {MACRO_PRECIO.C.toLocaleString("es-CL")} UF/m² (rango 0,75–1) y edificios {MACRO_PRECIO.E.toLocaleString("es-CL")}{" "}
        UF/m² (rango 2–3, de 4,5–6 UF/m² como lote individual). Batuco 2 macrolotes de casas y 3 de edificios; Colina 3 y 4.
      </p>
      <p>
        <span className="text-amber-300 font-semibold">Fuera del flujo:</span> infraestructura, mantención y seguridad,
        terreno COPEC y equipamiento comercial — la urbanización la asume el desarrollador.
      </p>
      <p>
        <span className="text-amber-300 font-semibold">Siguen a cargo del dueño:</span> factibilización por gastar,
        mitigaciones e inversiones sanitarias, con su calendario original hasta 2041, y la tierra devengada contra la venta
        de cada AUDP.
      </p>
    </div>
  );
}

function Criterios() {
  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3.5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[11px] text-zinc-500 leading-relaxed">
      <p>
        <span className="text-zinc-300 font-semibold">Hectáreas y viviendas:</span> 39,98 ha (Batuco 16,51 · Colina
        23,47) y 4.350 viviendas (1.906 · 2.444), del simulador en modo Solo AUDP. Se reparten con la curva de venta de
        suelo de esta vista, así que arrancan en 2031 con el primer macrolote.
      </p>
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
        <span className="text-zinc-300 font-semibold">Qué se evalúa:</span> solo el negocio inmobiliario. Asume las
        inversiones sanitarias (318.587 UF) y la factibilización por gastar completa, la suya y la de la sanitaria,
        porque las financia. No toma nada operacional de la sanitaria, ni el pago del desarrollador, ni la venta del negocio
        sanitario: el VAN y la TIR de esta lámina son del inmobiliario solo.
      </p>
      <p>
        <span className="text-zinc-300 font-semibold">Capital de trabajo:</span> el valle del resultado acumulado.
      </p>
      <p>
        <span className="text-zinc-300 font-semibold">Tasas y TIR:</span> la TIR corre desde 2026 y el VAN descuenta a
        la tasa elegida arriba. El 8% es la del negocio inmobiliario; el 7% era la de la sanitaria y queda disponible
        para comparar. La factibilización ya gastada no se carga por ser costo hundido: solo corre la que queda
        por gastar. La etapa 6 de la planta cierra completa en 2041.
      </p>
    </div>
  );
}

// ── paridad con las planillas anuales del simulador ──────────
function Paridad({ tierra }: { tierra: Unidad }) {
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
  ];
  const cuadra = filas.every(([, v, p]) => Math.abs(v - p) < 2);
  return (
    <div className={`rounded-lg border p-3.5 ${cuadra ? "bg-emerald-950/20 border-emerald-900/50" : "bg-red-950/20 border-red-900/50"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[12px] font-bold ${cuadra ? "text-emerald-400" : "text-red-400"}`}>
          {cuadra ? "✓ Totales calzan con las planillas del simulador" : "✗ Los totales se desviaron de las planillas"}
        </span>
        <span className="text-[10px] text-zinc-500">
          primeras_etapas_audp · única diferencia: equipamiento comercial ({sg(PARIDAD_PLANILLAS.equipamientoSemestral)} UF, viene de la semestral)
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
