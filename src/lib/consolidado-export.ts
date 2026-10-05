// Descarga del Consolidado como libro de Excel de TRES hojas — Tierra,
// Sanitaria y Consolidado — cada una con su flujo anual y sus indicadores.
//
// Todo lo calculado va con FÓRMULA (más su resultado cacheado). La hoja
// Consolidado referencia celda a celda a las otras dos. La factibilización
// va agrupada en "por gastar" y "gastada", cada una CON APERTURA: sub-filas
// colapsables (outline nativo de Excel, botón +/− en el margen) por AUDP en
// la Tierra y por unidad en el Consolidado; la fila agrupada es =SUM de sus
// hijas. El FLUJO NETO suma explícitamente las filas de nivel 0 para no
// contar dos veces las aperturas.
//
// Criterios: la TIR corre desde 2026 e INCLUYE la factibilización gastada;
// el VAN la excluye (costo hundido) — tierra al 8%, sanitaria al 7%, y el
// consolidado suma los VAN por unidad.
// Ojo: en el XML de xlsx las fórmulas van SIEMPRE con coma como separador.

import type { Workbook, Worksheet, Row, CellValue } from "exceljs";
import {
  banda,
  FUENTE,
  GRIS,
  LINEA_ABAJO,
  N_UF,
  portada,
  TINTA,
  VERDE,
  ZEBRA,
} from "./integracion-export";
import { AUDP_LABEL, TIERRA_AUDP, VAN_RATE, VAN_RATE_SAN, YEARS, type Audp, type Linea, type Unidad } from "./consolidado-model";

const TITULO_BASE = "Consolidado por Unidad de Negocio";
/** Título del libro según la AUDP en pantalla. */
let TITULO = `${TITULO_BASE} — AUDP Batuco + Colina`;
const NY = YEARS.length; // 20 años → columnas B..U; V = Total
const COL_TOT = NY + 2;
const L = (n: number) => String.fromCharCode(64 + n); // 2→B … 22→V
const LT = L(COL_TOT);
const LU = L(NY + 1);
const rango = (row: number) => `B${row}:${LU}${row}`;
const n0 = (v: number): number | null => (Math.abs(v) > 0.5 ? Math.round(v) : null);

/** Fórmula con resultado cacheado: Excel/LibreOffice muestran el valor y recalculan al editar. */
const F = (formula: string, result: number): CellValue => ({ formula, result });

interface Ctx {
  ws: Worksheet;
  hdrRow: number;
  zebra: number;
  filas: Record<string, number>;
}

export async function construirLibroConsolidado(unidades: Unidad[]): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Modela";
  wb.company = "Modela";
  const [tierra, sanitaria, consolidado] = unidades;
  const ctxT = hojaTierra(wb, tierra);
  const ctxS = hojaSanitaria(wb, sanitaria);
  hojaConsolidado(wb, consolidado, ctxT, ctxS);
  return wb;
}

export async function descargarConsolidado(unidades: Unidad[], audp: Audp = "ambos") {
  TITULO = `${TITULO_BASE} — ${AUDP_LABEL[audp]}`;
  const wb = await construirLibroConsolidado(unidades);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const sufijo = audp === "ambos" ? "" : `-${audp}`;
  a.download = `consolidado-unidades-negocio${sufijo}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── esqueleto común ──────────────────────────────────────────

function abrirHoja(wb: Workbook, nombre: string, subtitulo: string): Ctx {
  const ws = wb.addWorksheet(nombre, {
    views: [{ showGridLines: false }],
    properties: { outlineProperties: { summaryBelow: true, summaryRight: false } },
  });
  ws.columns = [{ width: 40 }, ...YEARS.map(() => ({ width: 10.5 })), { width: 12.5 }];
  portada(ws, subtitulo, "anual", COL_TOT, TITULO);
  ws.addRow([]);
  return { ws, hdrRow: 0, zebra: 0, filas: {} };
}

function cabeceraAnios(ctx: Ctx) {
  const row = ctx.ws.addRow(["Concepto", ...YEARS, "Total"]);
  row.height = 18;
  row.eachCell((c, i) => {
    c.font = { name: FUENTE, size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    c.alignment = { horizontal: i === 1 ? "left" : "right", vertical: "middle" };
    if (i > 1 && i < COL_TOT) c.numFmt = "0";
  });
  ctx.hdrRow = row.number;
  ctx.ws.views = [{ state: "frozen", xSplit: 1, ySplit: row.number, showGridLines: false }];
}

function linea(
  ctx: Ctx,
  label: string,
  celdas: CellValue[],
  totalResult: number,
  opts?: { informativa?: boolean; totalFormula?: string; outline?: boolean },
): Row {
  const row = ctx.ws.addRow([label, ...celdas, 0]);
  row.getCell(COL_TOT).value = F(opts?.totalFormula ?? `SUM(${rango(row.number)})`, Math.round(totalResult));
  if (opts?.outline) {
    row.outlineLevel = 1;
    row.hidden = true; // parte colapsada: el botón + la abre
  }
  const sub = opts?.informativa || opts?.outline;
  row.eachCell({ includeEmpty: true }, (c, i) => {
    if (i > COL_TOT) return;
    c.font = { name: FUENTE, size: opts?.outline ? 9 : 9.5, italic: sub, color: { argb: sub ? GRIS : TINTA } };
    c.border = LINEA_ABAJO;
    if (!sub && ctx.zebra % 2 === 1)
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    if (i > 1) {
      c.numFmt = N_UF;
      c.alignment = { horizontal: "right" };
    }
  });
  row.getCell(COL_TOT).font = {
    name: FUENTE,
    size: opts?.outline ? 9 : 9.5,
    bold: !sub,
    italic: sub,
    color: { argb: sub ? GRIS : TINTA },
  };
  if (!sub) ctx.zebra++;
  ctx.filas[label] = row.number;
  return row;
}

/** Fila agrupada = SUM de sus hijas (que van justo arriba, colapsables). */
function lineaAgrupada(ctx: Ctx, l: Linea, refHija?: (hija: Linea, col: string) => string) {
  const hijas: number[] = [];
  for (const h of l.detalle ?? []) {
    linea(
      ctx,
      `    ${h.label}`,
      h.arr.map((v, i) =>
        refHija && Math.abs(v) > 0.5 ? F(refHija(h, L(i + 2)), Math.round(v)) : n0(v),
      ),
      h.total,
      { outline: true },
    );
    hijas.push(ctx.filas[`    ${h.label}`]);
  }
  linea(
    ctx,
    l.label,
    l.arr.map((v, i) => {
      const c = L(i + 2);
      const f = hijas.map((r) => `SUM(${c}${r})`).join("+");
      return Math.abs(v) > 0.5 || hijas.length ? F(f, Math.round(v)) : null;
    }),
    l.total,
  );
}

/** FLUJO NETO = suma explícita de las filas de nivel 0 (las aperturas no se cuentan dos veces). */
function filasNeto(ctx: Ctx, filasNivel0: number[], flujo: number[], acumArr: number[], totalResultado: number) {
  const ws = ctx.ws;
  const neto = ws.addRow([
    "FLUJO NETO",
    ...flujo.map((v, i) => {
      const c = L(i + 2);
      return F(filasNivel0.map((r) => `SUM(${c}${r})`).join("+"), Math.round(v));
    }),
    0,
  ]);
  neto.getCell(COL_TOT).value = F(`SUM(${rango(neto.number)})`, Math.round(totalResultado));
  neto.height = 17;
  neto.eachCell((c, i) => {
    // tinta sobre el relleno verde claro: los positivos también se leen
    c.font = { name: FUENTE, size: 10, bold: true, color: { argb: TINTA } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E5DD" } };
    c.border = { top: { style: "thin", color: { argb: VERDE } } };
    if (i > 1) {
      c.numFmt = N_UF;
      c.alignment = { horizontal: "right" };
    }
  });
  ctx.filas["FLUJO NETO"] = neto.number;

  const nf = neto.number;
  const caja = ws.addRow([
    "Caja acumulada",
    ...acumArr.map((v, i) =>
      i === 0 ? F(`B${nf}`, Math.round(v)) : F(`${L(i + 1)}${nf + 1}+${L(i + 2)}${nf}`, Math.round(v)),
    ),
    F(`${LU}${nf + 1}`, Math.round(acumArr[NY - 1])),
  ]);
  caja.eachCell((c, i) => {
    c.font = { name: FUENTE, size: 9.5, italic: true, color: { argb: GRIS } };
    c.border = LINEA_ABAJO;
    if (i > 1) {
      c.numFmt = N_UF;
      c.alignment = { horizontal: "right" };
    }
  });
  ctx.filas["Caja acumulada"] = caja.number;
}

/** Bloque de indicadores con fórmulas. La TIR usa el flujo CON gastada; el VAN la excluye. */
function indicadores(
  ctx: Ctx,
  u: Unidad,
  cfg: {
    filaEcon: number; // flujo económico (incluye la gastada)
    filaGastada: number;
    filaCajaKT: number;
    filasIng: number[];
    filasCos: number[];
    vanLabel: string;
    vanFormula?: string; // override (consolidado = suma de hojas)
    tasaRef: string;
    tirLabel: string;
  },
) {
  const ws = ctx.ws;
  ws.addRow([]);
  banda(ws, "INDICADORES FINANCIEROS", COL_TOT);
  const { filaEcon, filaGastada, filaCajaKT, filasIng, filasCos, vanLabel, vanFormula, tasaRef, tirLabel } = cfg;
  const h = ctx.hdrRow;
  const dato = (label: string, formula: string, result: number, fmt: string, destacar = false) => {
    const row = ws.addRow([label, F(formula, result)]);
    row.getCell(1).font = { name: FUENTE, size: 10, bold: destacar, color: { argb: TINTA } };
    row.getCell(1).border = LINEA_ABAJO;
    const v = row.getCell(2);
    v.font = { name: FUENTE, size: 10, bold: destacar, color: { argb: TINTA } };
    v.alignment = { horizontal: "right" };
    v.border = LINEA_ABAJO;
    v.numFmt = fmt;
    ctx.filas[`__${label}`] = row.number;
  };
  dato("Ingresos totales", filasIng.map((r) => `${LT}${r}`).join("+"), Math.round(u.totalIngresos), N_UF);
  dato("Costos totales", filasCos.map((r) => `${LT}${r}`).join("+"), Math.round(u.totalCostos), N_UF);
  dato("Resultado (flujo de caja)", `${LT}${ctx.filas["FLUJO NETO"]}`, Math.round(u.totalResultado), N_UF, true);
  dato(
    vanLabel,
    vanFormula ?? `B${filaEcon}-SUM(B${filaGastada})+NPV(${tasaRef},C${filaEcon}:${LU}${filaEcon})`,
    Math.round(u.van),
    N_UF,
    true,
  );
  ctx.filas["__van"] = ctx.filas[`__${vanLabel}`];
  dato(tirLabel, `IRR(${rango(filaEcon)})`, u.tir ?? 0, "0.0%", true);
  dato("Capital de Trabajo", `-MIN(${rango(filaCajaKT)})`, Math.round(u.capitalTrabajo), N_UF);
  dato(
    "Payback",
    `INDEX($B$${h}:$${LU}$${h},MATCH(TRUE,INDEX(${rango(ctx.filas["Caja acumulada"])}>=0,0),0))`,
    u.payback ?? 0,
    "0",
  );
  dato(
    "Flujos positivos permanentes desde",
    `SUMPRODUCT(MAX((${rango(ctx.filas["FLUJO NETO"])}<-0.5)*($B$${h}:$${LU}$${h})))+1`,
    u.flujosPermanentes,
    "0",
  );
}

function notas(ctx: Ctx, textos: string[]) {
  const ws = ctx.ws;
  ws.addRow([]);
  for (const t of textos) {
    const row = ws.addRow([t]);
    ws.mergeCells(row.number, 1, row.number, COL_TOT);
    row.getCell(1).font = { name: FUENTE, size: 9, color: { argb: GRIS } };
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
  }
}

const lineaDe = (u: Unidad, label: string) => [...u.ingresos, ...u.costos].find((l) => l.label === label)!;

// ── hoja TIERRA ──────────────────────────────────────────────

function hojaTierra(wb: Workbook, u: Unidad): Ctx {
  const ctx = abrirHoja(wb, "Tierra", "Negocio Venta de Tierra · flujo anual en UF");
  const ws = ctx.ws;

  banda(ws, "SUPUESTOS", COL_TOT);
  const sup = (label: string, v: number, fmt: string) => {
    const row = ws.addRow([label, v]);
    row.getCell(1).font = { name: FUENTE, size: 9.5, color: { argb: TINTA } };
    row.getCell(1).border = LINEA_ABAJO;
    const c = row.getCell(2);
    c.font = { name: FUENTE, size: 9.5, bold: true, color: { argb: TINTA } };
    c.alignment = { horizontal: "right" };
    c.numFmt = fmt;
    c.border = LINEA_ABAJO;
    return row.number;
  };
  const rTasa = sup("Tasa de descuento", VAN_RATE, "0%");
  const rCom = sup("Comisión de venta", 0.02, "0%");
  const rTierra = sup("Valor de la tierra (aporte)", TIERRA_AUDP, N_UF);
  ctx.filas["__tasa"] = rTasa;
  ws.addRow([]);

  cabeceraAnios(ctx);
  banda(ws, "INGRESOS", COL_TOT);
  const ing = lineaDe(u, "Ingresos Venta de Tierra");
  const copec = lineaDe(u, "Venta terreno COPEC");
  linea(ctx, ing.label, ing.arr.map(n0), ing.total);
  linea(ctx, copec.label, copec.arr.map(n0), copec.total);
  const rIng = ctx.filas[ing.label];
  const rCopec = ctx.filas[copec.label];

  banda(ws, "COSTOS", COL_TOT);
  for (const label of ["Costos Infraestructura", "Costos Mitigaciones"]) {
    const l = lineaDe(u, label);
    linea(ctx, l.label, l.arr.map(n0), l.total);
  }
  const com = lineaDe(u, "Comercialización (2%)");
  linea(
    ctx,
    com.label,
    com.arr.map((v, i) => {
      const c = L(i + 2);
      return Math.abs(v) > 0.5 ? F(`-$B$${rCom}*SUM(${c}${rIng}:${c}${rCopec})`, Math.round(v)) : null;
    }),
    com.total,
  );
  for (const label of ["Mantención y seguridad", "Equipamiento comercial (neto)", "Inversiones Sanitarias (asumidas)"]) {
    const l = lineaDe(u, label);
    linea(ctx, l.label, l.arr.map(n0), l.total);
  }
  lineaAgrupada(ctx, lineaDe(u, "Factibilización por gastar")); // apertura Batuco / Colina
  const gastada = lineaDe(u, "Factibilización gastada (al 2026)");
  linea(ctx, gastada.label, gastada.arr.map(n0), gastada.total);

  const filasCos = [
    "Costos Infraestructura",
    "Costos Mitigaciones",
    "Comercialización (2%)",
    "Mantención y seguridad",
    "Equipamiento comercial (neto)",
    "Inversiones Sanitarias (asumidas)",
    "Factibilización por gastar",
    "Factibilización gastada (al 2026)",
  ].map((l) => ctx.filas[l]);
  const rGastada = ctx.filas["Factibilización gastada (al 2026)"];

  filasNeto(ctx, [rIng, rCopec, ...filasCos], u.resultado, u.resultadoAcum, u.totalResultado);
  const nf = ctx.filas["FLUJO NETO"];

  const dev = lineaDe(u, "Costo de la Tierra (aporte, devengado)");
  linea(
    ctx,
    dev.label,
    dev.arr.map((v, i) => {
      const c = L(i + 2);
      return Math.abs(v) > 0.5 ? F(`-$B$${rTierra}*${c}${rIng}/$${LT}$${rIng}`, Math.round(v)) : null;
    }),
    dev.total,
    { informativa: true },
  );
  const rDev = ctx.filas[dev.label];

  // flujo económico = NETO + tierra devengada (incluye la gastada: la base de la TIR)
  const econ = u.resultado.map((v, i) => v + dev.arr[i]);
  linea(
    ctx,
    "Flujo económico (c/ tierra, incl. factib. gastada)",
    econ.map((v, i) => {
      const c = L(i + 2);
      return F(`${c}${nf}+SUM(${c}${rDev})`, Math.round(v));
    }),
    econ.reduce((a, b) => a + b, 0),
    { informativa: true },
  );

  indicadores(ctx, u, {
    filaEcon: ctx.filas["Flujo económico (c/ tierra, incl. factib. gastada)"],
    filaGastada: rGastada,
    filaCajaKT: ctx.filas["Caja acumulada"],
    filasIng: [rIng, rCopec],
    filasCos,
    vanLabel: `VAN (${VAN_RATE * 100}%) c/ tierra`,
    tasaRef: `$B$${rTasa}`,
    tirLabel: "TIR c/ tierra (incl. factib. gastada)",
  });
  notas(ctx, [
    "La tierra se devenga proporcional a la venta e impacta VAN, TIR y costos, pero no el capital de trabajo: es un aporte de los dueños, no caja a financiar. La TIR corre desde 2026 e incluye la factibilización gastada; el VAN la excluye por ser costo hundido.",
    "Hasta 2034 mandan los números de la planilla semestral de Integración (urbanizar primero, vender después). Desde 2035 los residuos siguen la forma de la planilla anual de Primeras Etapas AUDP: los totales calzan con ella. La etapa 6 de la planta cierra completa en 2041.",
    "La factibilización por gastar se apertura con el botón + del margen: AUDP Batuco y AUDP Colina.",
  ]);
  return ctx;
}

// ── hoja SANITARIA ───────────────────────────────────────────

function hojaSanitaria(wb: Workbook, u: Unidad): Ctx {
  const ctx = abrirHoja(wb, "Sanitaria", "Negocio Sanitario · flujo anual en UF");
  const ws = ctx.ws;

  banda(ws, "SUPUESTOS", COL_TOT);
  const row = ws.addRow(["Tasa de descuento sanitaria", VAN_RATE_SAN]);
  row.getCell(1).font = { name: FUENTE, size: 9.5, color: { argb: TINTA } };
  row.getCell(1).border = LINEA_ABAJO;
  const cTasa = row.getCell(2);
  cTasa.font = { name: FUENTE, size: 9.5, bold: true, color: { argb: TINTA } };
  cTasa.alignment = { horizontal: "right" };
  cTasa.numFmt = "0%";
  cTasa.border = LINEA_ABAJO;
  const rTasaS = row.number;
  ctx.filas["__tasa"] = rTasaS;
  ws.addRow([]);

  cabeceraAnios(ctx);
  banda(ws, "INGRESOS", COL_TOT);
  const ingOp = lineaDe(u, "Ingresos Operacionales");
  const pago = lineaDe(u, "Pago Desarrollador (neteo inversiones)");
  const venta = lineaDe(u, "Venta Negocio Sanitario (2045)");
  linea(ctx, ingOp.label, ingOp.arr.map(n0), ingOp.total);
  const pagoRow = linea(ctx, pago.label, pago.arr.map(n0), pago.total);
  linea(ctx, venta.label, venta.arr.map(n0), venta.total);

  banda(ws, "COSTOS", COL_TOT);
  for (const label of ["Costos Operacionales", "Inversiones Sanitarias", "Factibilización por gastar", "Factibilización gastada (al 2026)"]) {
    const l = lineaDe(u, label);
    linea(ctx, l.label, l.arr.map(n0), l.total);
  }
  const rInv = ctx.filas["Inversiones Sanitarias"];
  for (let i = 0; i < NY; i++) {
    const c = L(i + 2);
    ws.getCell(`${c}${pagoRow.number}`).value =
      Math.abs(pago.arr[i]) > 0.5 ? F(`-${c}${rInv}`, Math.round(pago.arr[i])) : null;
  }

  const filasIng = [ingOp.label, pago.label, venta.label].map((l) => ctx.filas[l]);
  const filasCos = ["Costos Operacionales", "Inversiones Sanitarias", "Factibilización por gastar", "Factibilización gastada (al 2026)"].map((l) => ctx.filas[l]);
  const rGastada = ctx.filas["Factibilización gastada (al 2026)"];
  filasNeto(ctx, [...filasIng, ...filasCos], u.resultado, u.resultadoAcum, u.totalResultado);
  const nf = ctx.filas["FLUJO NETO"];

  // caja sin la factibilización gastada: la base del KT sanitario
  linea(
    ctx,
    "Flujo s/ factib. gastada",
    u.flujo.map((v, i) => {
      const c = L(i + 2);
      return F(`${c}${nf}-SUM(${c}${rGastada})`, Math.round(v));
    }),
    u.flujo.reduce((a, b) => a + b, 0),
    { informativa: true },
  );
  const rEcon = ctx.filas["Flujo s/ factib. gastada"];
  const cajaFut: number[] = [];
  u.flujo.reduce((s, v) => {
    const n = s + v;
    cajaFut.push(n);
    return n;
  }, 0);
  linea(
    ctx,
    "Caja acumulada s/ factib. gastada",
    cajaFut.map((v, i) =>
      i === 0 ? F(`B${rEcon}`, Math.round(v)) : F(`${L(i + 1)}${rEcon + 1}+${L(i + 2)}${rEcon}`, Math.round(v)),
    ),
    cajaFut[NY - 1],
    { informativa: true, totalFormula: `${LU}${rEcon + 1}` },
  );

  indicadores(ctx, u, {
    filaEcon: nf, // TIR sanitaria sobre el flujo neto (incluye la gastada)
    filaGastada: rGastada,
    filaCajaKT: ctx.filas["Caja acumulada s/ factib. gastada"],
    filasIng,
    filasCos,
    vanLabel: `VAN (${VAN_RATE_SAN * 100}%)`,
    tasaRef: `$B$${rTasaS}`,
    tirLabel: "TIR (incl. factib. gastada)",
  });
  notas(ctx, [
    "La sanitaria paga las inversiones y recibe del desarrollador un pago equivalente (efecto neto 0): el desarrollo de la tierra las asume. Opera la planta y el 2045 vende el negocio en 147.433 UF. Se descuenta al 7%.",
    "Capital de trabajo sobre el flujo futuro (sin la factibilización gastada): el pago del desarrollador ya netea las inversiones — criterio del simulador para los modos sanitarios. La TIR sí corre desde 2026 con la gastada.",
  ]);
  return ctx;
}

// ── hoja CONSOLIDADO ─────────────────────────────────────────

function hojaConsolidado(wb: Workbook, u: Unidad, t: Ctx, s: Ctx) {
  const ctx = abrirHoja(wb, "Consolidado", "Tierra + Sanitaria · flujo anual en UF");
  const ws = ctx.ws;
  cabeceraAnios(ctx);

  const g = (label: string) => lineaDe(u, label);
  const ref = (hoja: "Tierra" | "Sanitaria", fila: number, label: string, opts?: { informativa?: boolean }) => {
    const l = g(label);
    return linea(
      ctx,
      label,
      l.arr.map((v, i) => {
        const c = L(i + 2);
        return Math.abs(v) > 0.5 ? F(`${hoja}!${c}${fila}`, Math.round(v)) : null;
      }),
      l.total,
      opts,
    );
  };

  banda(ws, "INGRESOS", COL_TOT);
  ref("Tierra", t.filas["Ingresos Venta de Tierra"], "Ingresos Venta de Tierra");
  ref("Tierra", t.filas["Venta terreno COPEC"], "Venta terreno COPEC");
  ref("Sanitaria", s.filas["Ingresos Operacionales"], "Ingresos Operacionales");
  ref("Sanitaria", s.filas["Pago Desarrollador (neteo inversiones)"], "Pago Desarrollador (neteo inversiones)");
  ref("Sanitaria", s.filas["Venta Negocio Sanitario (2045)"], "Venta Negocio Sanitario (2045)");
  const filasIng = ["Ingresos Venta de Tierra", "Venta terreno COPEC", "Ingresos Operacionales", "Pago Desarrollador (neteo inversiones)", "Venta Negocio Sanitario (2045)"].map((l) => ctx.filas[l]);

  banda(ws, "COSTOS", COL_TOT);
  ref("Tierra", t.filas["Costos Infraestructura"], "Costos Infraestructura");
  ref("Tierra", t.filas["Costos Mitigaciones"], "Costos Mitigaciones");
  ref("Tierra", t.filas["Comercialización (2%)"], "Comercialización (2%)");
  ref("Tierra", t.filas["Mantención y seguridad"], "Mantención y seguridad");
  ref("Tierra", t.filas["Equipamiento comercial (neto)"], "Equipamiento comercial (neto)");
  ref("Tierra", t.filas["Inversiones Sanitarias (asumidas)"], "Inversiones Sanitarias (asumidas)");
  ref("Sanitaria", s.filas["Costos Operacionales"], "Costos Operacionales");
  ref("Sanitaria", s.filas["Inversiones Sanitarias"], "Inversiones Sanitarias");
  // factibilización agrupada CON apertura por unidad (sub-filas que referencian cada hoja)
  lineaAgrupada(ctx, g("Factibilización por gastar"), (hija, c) =>
    hija.label === "Tierra" ? `Tierra!${c}${t.filas["Factibilización por gastar"]}` : `Sanitaria!${c}${s.filas["Factibilización por gastar"]}`,
  );
  lineaAgrupada(ctx, g("Factibilización gastada (al 2026)"), (hija, c) =>
    hija.label === "Tierra" ? `Tierra!${c}${t.filas["Factibilización gastada (al 2026)"]}` : `Sanitaria!${c}${s.filas["Factibilización gastada (al 2026)"]}`,
  );
  const filasCos = ["Costos Infraestructura", "Costos Mitigaciones", "Comercialización (2%)", "Mantención y seguridad", "Equipamiento comercial (neto)", "Inversiones Sanitarias (asumidas)", "Costos Operacionales", "Inversiones Sanitarias", "Factibilización por gastar", "Factibilización gastada (al 2026)"].map((l) => ctx.filas[l]);
  const rGastada = ctx.filas["Factibilización gastada (al 2026)"];

  filasNeto(ctx, [...filasIng, ...filasCos], u.resultado, u.resultadoAcum, u.totalResultado);
  const nf = ctx.filas["FLUJO NETO"];

  const dev = g("Costo de la Tierra (aporte, devengado)");
  ref("Tierra", t.filas["Costo de la Tierra (aporte, devengado)"], dev.label, { informativa: true });
  const rDev = ctx.filas[dev.label];

  const econ = u.resultado.map((v, i) => v + dev.arr[i]);
  linea(
    ctx,
    "Flujo económico (c/ tierra, incl. factib. gastada)",
    econ.map((v, i) => {
      const c = L(i + 2);
      return F(`${c}${nf}+SUM(${c}${rDev})`, Math.round(v));
    }),
    econ.reduce((a, b) => a + b, 0),
    { informativa: true },
  );

  indicadores(ctx, u, {
    filaEcon: ctx.filas["Flujo económico (c/ tierra, incl. factib. gastada)"],
    filaGastada: rGastada,
    filaCajaKT: ctx.filas["Caja acumulada"],
    filasIng,
    filasCos,
    vanLabel: "VAN (tierra 8% · sanitaria 7%)",
    vanFormula: `Tierra!B${t.filas["__van"]}+Sanitaria!B${s.filas["__van"]}`,
    tasaRef: `Tierra!$B$${t.filas["__tasa"]}`,
    tirLabel: "TIR c/ tierra (incl. factib. gastada)",
  });
  notas(ctx, [
    "Cada celda de esta hoja referencia a las hojas Tierra y Sanitaria: tocar un número allá recalcula el consolidado. El VAN consolidado suma los VAN por unidad (tierra al 8%, sanitaria al 7%); la TIR corre sobre el flujo combinado desde 2026, con la factibilización gastada.",
    "Las dos factibilizaciones se aperturan con el botón + del margen: la parte de la Tierra y la de la Sanitaria.",
  ]);
}
