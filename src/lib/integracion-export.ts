// Descarga del flujo de /integracion como libro de Excel.
// Tres hojas: el resumen del escenario, el flujo consolidado tal como se ve en
// pantalla, y el desglose partida por partida. Los importes van como NÚMEROS
// (no texto) para que el que reciba el archivo pueda sumarlos y pivotearlos.
//
// El diseño es el mismo del deck del Directorio: cabecera verde con texto
// blanco, bandas de sección en verde claro, Arial, miles con punto y negativos
// en rojo. ExcelJS y no SheetJS porque la versión libre de SheetJS no escribe
// estilos — es la razón por la que el archivo salía en blanco y negro.

import type { Workbook, Worksheet, Borders } from "exceljs";
import {
  CONTEXTO,
  LAYERS,
  PARIDAD_PPTX,
  SEM,
  trunc,
  type FlujoResult,
  type LayerState,
} from "./integracion-model";

// ── paleta Modela (ARGB) ─────────────────────────────────────
export const VERDE = "FF2C4A3B"; // cabecera de tabla, igual que el deck
export const VERDE_CLARO = "FFD9E5DD"; // bandas de sección
export const ZEBRA = "FFF5F8F6";
export const BORDE = "FFD5DDD8";
export const TINTA = "FF1B2A22";
export const GRIS = "FF7C8A83";

export const FUENTE = "Arial";
export const N_UF = "#,##0;[Red]-#,##0";
/** Solo para el FLUJO NETO: positivo en verde y negativo en rojo, como en pantalla. */
export const N_NETO = "[Green]#,##0;[Red]-#,##0";
export const LINEA_ABAJO: Partial<Borders> = { bottom: { style: "hair", color: { argb: BORDE } } };

/** UF enteras; las celdas nulas quedan en blanco, como el "·" de la tabla. */
const n0 = (v: number): number | null => (Math.abs(v) > 0.5 ? Math.round(v) : null);

export interface ExportFlujosConfig {
  r: FlujoResult;
  layers: LayerState;
  share: number;
  /** Nombre legible del escenario: "Venta a terceros", "Vertical integrado" o "Personalizado". */
  escenario: string;
  /** Escenario del deck contra el que contrastar, si el actual es uno de los dos. */
  paridad: keyof typeof PARIDAD_PPTX | null;
}

/** Arma el libro. Separado de la descarga para poder inspeccionarlo fuera del navegador. */
export async function construirLibro({
  r,
  layers,
  share,
  escenario,
  paridad,
}: ExportFlujosConfig): Promise<Workbook> {
  // Carga diferida: son ~900 KB que no tienen por qué pesar en el primer render.
  const ExcelJS = (await import("exceljs")).default;
  const sems = Array.from({ length: r.nfv }, (_, i) => SEM(i));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Modela";
  wb.company = "Modela";

  hojaResumen(wb, { r, layers, share, escenario, paridad, vertical: layers.inmobiliario, sems });
  hojaFlujo(wb, r, sems, escenario);
  hojaDetalle(wb, r, sems, escenario);
  return wb;
}

export async function descargarFlujos(cfg: ExportFlujosConfig) {
  const wb = await construirLibro(cfg);
  const { escenario } = cfg;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // el enlace tiene que estar en el documento (Firefox lo exige) y la URL no
  // se puede revocar en el mismo tick: Safari cancela la descarga
  a.style.display = "none";
  const slug = escenario.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  a.download = `flujo-integracion-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}

// ── piezas de diseño compartidas ─────────────────────────────

/** Título y bajada de cada hoja, sobre el ancho de la tabla. */
export function portada(ws: Worksheet, subtitulo: string, escenario: string, ancho: number, titulo = "Integración Vertical — AUDP Batuco + Colina") {
  // Que al imprimir entre a lo ancho: si no, las columnas de semestres se parten en dos hojas.
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  ws.mergeCells(1, 1, 1, ancho);
  const t = ws.getCell(1, 1);
  t.value = titulo;
  t.font = { name: FUENTE, size: 14, bold: true, color: { argb: VERDE } };

  ws.mergeCells(2, 1, 2, ancho);
  const s = ws.getCell(2, 1);
  s.value = `${subtitulo} · escenario ${escenario}`;
  s.font = { name: FUENTE, size: 9, color: { argb: GRIS } };

  ws.getRow(1).height = 21;
  ws.getRow(2).height = 14;
}

/** Banda de sección: verde claro a todo el ancho, como los "INGRESOS / COSTOS" del deck. */
export function banda(ws: Worksheet, texto: string, ancho: number) {
  const row = ws.addRow([texto]);
  ws.mergeCells(row.number, 1, row.number, ancho);
  const c = ws.getCell(row.number, 1);
  c.font = { name: FUENTE, size: 9, bold: true, color: { argb: VERDE } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_CLARO } };
  c.alignment = { vertical: "middle" };
  row.height = 16;
  return row;
}

/** Fila de encabezado de columnas: fondo verde, texto blanco. */
export function cabecera(ws: Worksheet, cols: string[]) {
  const row = ws.addRow(cols);
  row.height = 18;
  row.eachCell((c, i) => {
    c.font = { name: FUENTE, size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    c.alignment = { horizontal: i === 1 ? "left" : "right", vertical: "middle" };
  });
  return row;
}

// ── hoja 1 · Resumen ─────────────────────────────────────────

function hojaResumen(
  wb: Workbook,
  ctx: ExportFlujosConfig & { vertical: boolean; sems: string[] },
) {
  const { r, layers, share, escenario, paridad, vertical, sems } = ctx;
  const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 46 }, { width: 18 }, { width: 30 }, { width: 14 }];
  portada(ws, `Flujo semestral en UF · ${sems[0]} – ${sems[r.nfv - 1]}`, escenario, 4);
  ws.addRow([]);

  /** Fila etiqueta/valor; el valor va como número con formato de miles. */
  const dato = (label: string, valor: number | string, destacar = false) => {
    const row = ws.addRow([label, valor]);
    row.getCell(1).font = { name: FUENTE, size: 10, bold: destacar, color: { argb: TINTA } };
    row.getCell(1).border = LINEA_ABAJO;
    const v = row.getCell(2);
    v.font = { name: FUENTE, size: 10, bold: destacar, color: { argb: TINTA } };
    v.alignment = { horizontal: "right" };
    v.border = LINEA_ABAJO;
    if (typeof valor === "number") v.numFmt = N_UF;
    return row;
  };

  banda(ws, "CAPAS DEL NEGOCIO", 4);
  for (const l of LAYERS) {
    const row = dato(`${l.n}. ${l.nombre}`, layers[l.id] ? "Encendida" : "Apagada");
    row.getCell(2).alignment = { horizontal: "right" };
    if (!layers[l.id]) {
      row.getCell(1).font = { name: FUENTE, size: 10, color: { argb: GRIS } };
      row.getCell(2).font = { name: FUENTE, size: 10, color: { argb: GRIS } };
    }
  }
  if (vertical) {
    const row = dato("Participación en el negocio inmobiliario", share);
    row.getCell(2).numFmt = "0%";
  }

  ws.addRow([]);
  banda(ws, "RESULTADO", 4);
  dato("Ingresos", Math.round(r.ingresos));
  dato("Costos", Math.round(r.costos));
  dato("Resultado neto", Math.round(r.neto), true);
  if (vertical) {
    dato("Utilidad inmobiliaria", Math.round(r.utilidadInmob));
    dato("Caja máxima del macroloteador", Math.round(r.valleMacro));
    dato("Máximo financiamiento de capital de trabajo", Math.round(r.valleInmob));
  } else {
    dato(`Máximo financiamiento · ${SEM(r.valleIdx)}`, Math.round(r.valle));
  }

  ws.addRow([]);
  banda(ws, "CONTEXTO DEL PROYECTO", 4);
  dato("Ventas brutas", Math.round(CONTEXTO.pxq));
  dato("Unidades", Math.round(CONTEXTO.unidades));
  dato("Valor del suelo", Math.round(CONTEXTO.suelo));
  dato("Capital de trabajo", Math.round(CONTEXTO.capitalTrabajo));

  if (!paridad) return;

  const p = PARIDAD_PPTX[paridad];
  ws.addRow([]);
  banda(ws, `PARIDAD CON EL DECK DEL DIRECTORIO · láminas ${p.slide}`, 4);
  cabecera(ws, ["Concepto", "Modelo en vivo", "Presentacion_Directorio.pptx", "Diferencia"]);
  const comparar = (label: string, vivo: number, deck: number) => {
    const row = ws.addRow([label, Math.round(vivo), deck, Math.round(vivo - deck)]);
    row.eachCell((c, i) => {
      c.font = { name: FUENTE, size: 10, color: { argb: TINTA } };
      c.border = LINEA_ABAJO;
      if (i > 1) {
        c.numFmt = N_UF;
        c.alignment = { horizontal: "right" };
      }
    });
    // La diferencia es el semáforo: verde si cuadra, rojo si el modelo se desvió.
    const d = row.getCell(4);
    const cuadra = Math.abs(vivo - deck) < 1;
    d.font = { name: FUENTE, size: 10, bold: true, color: { argb: cuadra ? "FF1D7A45" : "FFB91C1C" } };
  };
  comparar("Ingresos", r.ingresos, p.ingresos);
  comparar("Costos", r.costos, p.costos);
  comparar("Resultado neto", r.neto, p.neto);
  comparar("Valle de caja", r.valle, p.valle);
  if (paridad === "vertical") {
    comparar("Valle del macroloteador", r.valleMacro, PARIDAD_PPTX.vertical.valleMacro);
    comparar("Valle de capital de trabajo", r.valleInmob, PARIDAD_PPTX.vertical.valleInmob);
  }
}

// ── hoja 2 · Flujo consolidado ───────────────────────────────

function hojaFlujo(wb: Workbook, r: FlujoResult, sems: string[], escenario: string) {
  const ws = wb.addWorksheet("Flujo", { views: [{ showGridLines: false }] });
  const ancho = sems.length + 2;
  ws.columns = [{ width: 34 }, ...sems.map(() => ({ width: 11 })), { width: 13 }];
  portada(ws, "Flujo consolidado por concepto · UF", escenario, ancho);
  ws.addRow([]);

  cabecera(ws, ["Concepto", ...sems, "Total"]);
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4, showGridLines: false }];

  let sec = "";
  let z = 0;
  for (const g of r.groups) {
    if (g.sec !== sec) {
      sec = g.sec;
      banda(ws, sec, ancho);
      z = 0;
    }
    const row = ws.addRow([g.name, ...g.arr.map(n0), Math.round(g.total)]);
    pintarFila(row, ancho, z++ % 2 === 1);
    const total = row.getCell(ancho);
    total.font = { name: FUENTE, size: 9.5, bold: true, color: { argb: TINTA } };
  }

  // FLUJO NETO — la fila que se lee primero, con el mismo peso que en el deck.
  const neto = ws.addRow(["FLUJO NETO", ...r.net.map(n0), Math.round(r.neto)]);
  neto.height = 17;
  neto.eachCell((c, i) => {
    c.font = { name: FUENTE, size: 10, bold: true, color: { argb: TINTA } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_CLARO } };
    c.border = { top: { style: "thin", color: { argb: VERDE } } };
    if (i > 1) {
      c.numFmt = N_NETO;
      c.alignment = { horizontal: "right" };
    }
  });

  const caja = ws.addRow(["Caja acumulada", ...r.caja.map(n0), Math.round(r.caja[r.nfv - 1])]);
  caja.eachCell((c, i) => {
    c.font = { name: FUENTE, size: 9.5, italic: true, color: { argb: GRIS } };
    c.border = LINEA_ABAJO;
    if (i > 1) {
      c.numFmt = N_UF;
      c.alignment = { horizontal: "right" };
    }
  });
}

/** Fila de datos: Arial 9,5, números a la derecha con miles y negativos en rojo. */
function pintarFila(row: import("exceljs").Row, ancho: number, zebra: boolean) {
  row.eachCell({ includeEmpty: true }, (c, i) => {
    if (i > ancho) return;
    c.font = { name: FUENTE, size: 9.5, color: { argb: TINTA } };
    c.border = LINEA_ABAJO;
    if (zebra) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    if (i > 1) {
      c.numFmt = N_UF;
      c.alignment = { horizontal: "right" };
    }
  });
}

// ── hoja 3 · Detalle por partida ─────────────────────────────

function hojaDetalle(wb: Workbook, r: FlujoResult, sems: string[], escenario: string) {
  const ws = wb.addWorksheet("Detalle", { views: [{ showGridLines: false }] });
  const CAP = { macro: "Macroloteador", inmob: "Inmobiliario" } as const;
  const ancho = sems.length + 5;
  ws.columns = [
    { width: 24 },
    { width: 34 },
    { width: 15 },
    { width: 24 },
    ...sems.map(() => ({ width: 11 })),
    { width: 13 },
  ];
  portada(ws, "Detalle partida por partida · UF", escenario, ancho);
  ws.addRow([]);

  cabecera(ws, ["Grupo", "Partida", "Cuenta", "Capa", ...sems, "Total"]);
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 4, showGridLines: false }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: ancho } };

  r.lines.forEach((l, i) => {
    const arr = trunc(l.arr, r.nfv);
    const capa = LAYERS.find((x) => x.id === l.layer);
    const row = ws.addRow([
      l.grp,
      l.label,
      CAP[l.cap],
      capa ? `${capa.n}. ${capa.nombre}` : l.layer,
      ...arr.map(n0),
      Math.round(arr.reduce((a, b) => a + b, 0)),
    ]);
    row.eachCell({ includeEmpty: true }, (c, j) => {
      if (j > ancho) return;
      c.font = { name: FUENTE, size: 9.5, color: { argb: TINTA } };
      c.border = LINEA_ABAJO;
      if (i % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      if (j > 4) {
        c.numFmt = N_UF;
        c.alignment = { horizontal: "right" };
      }
    });
    row.getCell(ancho).font = { name: FUENTE, size: 9.5, bold: true, color: { argb: TINTA } };
  });
}
