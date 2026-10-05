// Consolidado anual por unidades de negocio — AUDP Batuco + Colina.
//
// Dos unidades: VENTA DE TIERRA y SANITARIA, más su suma. Reglas del
// Directorio (2026-08-25):
//
//  · Hasta 2034 mandan los números, periodos y costos de la planilla
//    SEMESTRAL de /integracion (venta a terceros), anualizada. Ese plan
//    urbaniza primero y vende después: más infraestructura temprana y una
//    caja más negativa — el escenario real.
//  · Desde 2035, cada concepto recibe su residuo (total de la planilla
//    anual de Primeras Etapas menos lo ya consumido) repartido con la
//    forma de esa planilla, para que los TOTALES calcen con ella.
//  · La tierra (343.000 UF — AUDP_TIERRA_TOTAL del simulador) se devenga
//    proporcional a la venta e impacta VAN, TIR y costos, pero NO el
//    capital de trabajo: es un aporte de los dueños, no caja a financiar.
//  · La tierra asume las inversiones sanitarias. La sanitaria las paga y
//    recibe del desarrollador un pago equivalente (efecto neto 0), opera
//    la planta y el 2045 vende el negocio en 147.433 UF.
//  · Capital de trabajo: tierra y consolidado sobre el resultado acumulado
//    (incluye la factibilización gastada, como la planilla AUDP); la
//    sanitaria sobre el flujo futuro (el pago del desarrollador ya netea
//    las inversiones — criterio del simulador para los modos sanitarios).
//
// Fuentes: primeras_etapas_audp / primeras_etapas_sanAudp (simulador,
// modo Solo AUDP y Sanitaria AUDP) y el flujo semestral de /integracion.

export const YEARS: number[] = [];
for (let y = 2026; y <= 2045; y++) YEARS.push(y);
const NY = YEARS.length;
const iy = (y: number) => y - 2026;

const serie = (pairs: Record<number, number>) => {
  const a = new Array(NY).fill(0);
  for (const [y, v] of Object.entries(pairs)) a[iy(Number(y))] += v;
  return a;
};
const suma = (a: number[]) => a.reduce((x, y) => x + y, 0);
const addv = (...as: number[][]) => {
  const r = new Array(NY).fill(0);
  for (const a of as) for (let i = 0; i < NY; i++) r[i] += a[i];
  return r;
};
export const acum = (a: number[]) => {
  let s = 0;
  return a.map((v) => (s += v));
};

// ── semestral anualizada (manda 2030–2034; equipamiento sigue su serie) ──
const SEM = {
  ingresos: serie({ 2030: 30000, 2031: 306201, 2032: 49738, 2033: 157028, 2034: 62875 }), // incluye COPEC 30.000
  infra: serie({ 2030: -103934, 2031: -97987, 2032: -104820, 2033: -68119 }), // vialidades + plazas + mejoramiento
  mitigaciones: serie({ 2031: -35810, 2032: -23262, 2033: -9132, 2034: -5000 }),
  sanitariaInv: serie({ 2030: -53735, 2031: -35824 }), // etapas 1-2 de la planta, adelantadas
  mantencion: serie({ 2032: -778, 2033: -1556, 2034: -2334 }),
  equipamiento: serie({ 2030: -7700, 2031: -1400, 2032: -2274, 2033: -124, 2034: -124, 2035: -246 }),
};

// ── planilla anual Primeras Etapas AUDP (tierra): totales y forma 2035+ ──
const AN_T = {
  ingresos: serie({ 2029: 173755, 2030: 177230, 2031: 184740, 2032: 184699, 2033: 288727, 2034: 319805, 2035: 289627, 2036: 236969, 2037: 253497, 2038: 258088, 2039: 267514, 2040: 277390, 2041: 119801 }),
  infra: serie({ 2030: -89447, 2031: -80246, 2032: -66157, 2033: -87138, 2034: -80446, 2035: -55352, 2036: -31247, 2037: -22647, 2038: -18036, 2039: -14991, 2040: -12728, 2041: -4855 }),
  mitigaciones: serie({ 2030: -35809, 2031: -23262, 2032: -9131, 2033: -5000, 2034: -14417, 2035: -23664, 2036: -20103, 2037: -14924, 2038: -8731, 2039: -7880, 2040: -8695, 2041: -13459 }),
  mantencion: serie({ 2031: -778, 2032: -1555, 2033: -2333, 2034: -2415, 2035: -3234, 2036: -4170, 2037: -6335, 2038: -7716, 2039: -9495, 2040: -4736 }),
  // la etapa 6 de la planta cierra completa en 2041: sin flujo negativo en un año sin venta
  sanitariaInv: serie({ 2031: -53735, 2032: -19703, 2033: -16121, 2035: -56222, 2036: -83480, 2037: -30666, 2039: -19358, 2040: -15838, 2041: -23464 }),
  factibPorGastar: serie({ 2026: -58923, 2027: -34641, 2028: -24350, 2029: -4909, 2030: -2813, 2031: -1139, 2032: -133 }),
  factibGastada: serie({ 2026: -132513 }),
};

// apertura de la factibilización por gastar de la tierra, por AUDP (planilla del simulador)
const FACTIB_T_BATUCO = serie({ 2026: -26496, 2027: -15577, 2028: -10949, 2029: -2207, 2030: -1265, 2031: -512, 2032: -60 });
const FACTIB_T_COLINA = serie({ 2026: -32427, 2027: -19064, 2028: -13401, 2029: -2702, 2030: -1548, 2031: -627, 2032: -73 });

// ── planilla anual Primeras Etapas SAN AUDP (sanitaria) ──
const AN_S = {
  ingOp: serie({ 2031: 2590, 2032: 4030, 2033: 7770, 2034: 11354, 2035: 16730, 2036: 23897, 2037: 28516, 2038: 31388, 2039: 34059, 2040: 36730, 2041: 39312, 2042: 41761, 2043: 43887, 2044: 44733, 2045: 44967 }),
  costOp: serie({ 2031: -8961, 2032: -10870, 2033: -14151, 2034: -26003, 2035: -27622, 2036: -29779, 2037: -31169, 2038: -32033, 2039: -32837, 2040: -33641, 2041: -34419, 2042: -35156, 2043: -35796, 2044: -36050, 2045: -36120 }),
  venta: serie({ 2045: 147433 }),
  factibPorGastar: serie({ 2026: -11850, 2027: -9099, 2028: -6336, 2029: -892, 2030: -842, 2031: -827, 2032: -779 }),
  factibGastada: serie({ 2026: -42899 }),
};

// ── APERTURA POR AUDP ────────────────────────────────────────
// Series del propio simulador en modo Solo AUDP (`_peData`: haByZ, recByZ,
// ingByZ, infraZ, mitigZ). Las hectáreas calzan con las constantes del
// proyecto: Batuco 16,51 ha y Colina 23,47 ha. Las viviendas son las
// recepciones corridas 2 años (LAG del simulador), o sea las VENDIDAS
// con el lote: 1.906 Batuco + 2.444 Colina = 4.350.
const HA_B = [0, 0, 0, 1.329, 1.329, 1.329, 1.28, 1.919, 2.027, 2.005, 1.364, 0.926, 0.798, 0.739, 0.748, 0.714, 0, 0, 0, 0];
const HA_C = [0, 0, 0, 2.244, 2.244, 2.329, 2.146, 3.219, 3.373, 1.869, 1.057, 1.172, 1.202, 1.261, 1.252, 0.099, 0, 0, 0, 0];
const VIV_B = [0, 0, 0, 152, 152, 152, 148, 222, 230, 211, 133, 120, 120, 114, 104, 48, 0, 0, 0, 0];
const VIV_C = [0, 0, 0, 184, 184, 184, 174, 261, 270, 204, 167, 180, 180, 186, 196, 74, 0, 0, 0, 0];
const ING_B = [0, 0, 0, 61678, 62912, 64170, 65214, 105915, 148903, 213549, 124641, 98629, 100602, 94725, 84034, 82914, 84572, 31906, 0, 0];
const ING_C = [0, 0, 0, 78198, 79762, 84686, 84977, 130014, 190024, 163336, 135138, 137841, 140598, 144494, 148501, 117645, 4324, 0, 0, 0];
const INFRA_B = [0, 0, 0, 0, 38683, 33967, 28713, 37819, 45174, 33061, 13438, 7497, 6583, 5299, 4018, 3389, 2976, 967, 0, 0];
const INFRA_C = [0, 0, 0, 0, 50774, 46287, 37452, 49329, 58451, 16230, 9959, 8745, 7679, 6743, 5921, 4008, 127, 0, 0, 0];
const MITIG_B = [0, 0, 0, 0, 30809, 18262, 9131, 0, 9219, 23355, 7400, 5275, 2850, 2400, 2400, 2200, 1900, 1825, 0, 0];
const MITIG_C = [0, 0, 0, 0, 5000, 5000, 0, 5000, 9350, 6525, 8700, 5100, 3600, 3600, 3600, 3600, 3600, 2775, 0, 0];

export type Audp = "ambos" | "batuco" | "colina";

/** Qué se evalúa: solo el negocio inmobiliario, o el proyecto entero como
 *  una sola unidad de negocio (sanitaria y factibilización gastada dentro). */
export type Alcance = "inmobiliario" | "completo";
export const ALCANCE_LABEL: Record<Alcance, string> = {
  inmobiliario: "Negocio Inmobiliario",
  completo: "Proyecto Completo",
};

/** Hectáreas totales por AUDP (DISTRICTS de constants.ts; las series anuales
 *  redondean a 3 decimales y pierden 0,006 ha al sumarse). */
export const HA_TOTAL = { batuco: 16.51, colina: 23.47 } as const;
export const HA_TOTAL_DE: Record<Audp, number> = {
  batuco: HA_TOTAL.batuco,
  colina: HA_TOTAL.colina,
  ambos: HA_TOTAL.batuco + HA_TOTAL.colina,
};

export const AUDP_LABEL: Record<Audp, string> = {
  ambos: "AUDP Batuco + Colina",
  batuco: "AUDP Batuco",
  colina: "AUDP Colina",
};

/** Viviendas totales por AUDP (recepciones de la planilla Solo AUDP). */
export const VIV_TOTAL = { batuco: 1906, colina: 2444 } as const;
export const VIV_TOTAL_DE: Record<Audp, number> = {
  batuco: VIV_TOTAL.batuco,
  colina: VIV_TOTAL.colina,
  ambos: VIV_TOTAL.batuco + VIV_TOTAL.colina,
};

export interface Fisico {
  haAnual: number[];
  haAcum: number[];
  vivAnual: number[];
  vivAcum: number[];
  haTot: number;
  vivTot: number;
}

/** Reparte un total entero con el método del resto mayor: la suma no se mueve. */
function enteros(total: number, pesos: number[]): number[] {
  const base = suma(pesos);
  if (base <= 0) return pesos.map(() => 0);
  const exacto = pesos.map((w) => (total * w) / base);
  const out = exacto.map((v) => Math.floor(v));
  let resto = total - suma(out);
  const orden = exacto
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < orden.length && resto > 0; k++, resto--) out[orden[k].i]++;
  return out;
}

/**
 * Hectáreas y viviendas vendidas siguiendo la curva de venta de suelo de esta
 * misma página (el ingreso sin COPEC). Así arrancan en 2031 con el primer
 * macrolote y no en 2029, y los totales quedan clavados en los del proyecto:
 * 16,51 + 23,47 ha y 1.906 + 2.444 viviendas.
 */
function fisicoDe(ingSuelo: number[], haTot: number, vivTot: number): Fisico {
  const base = suma(ingSuelo);
  const haAnual = base > 0 ? ingSuelo.map((v) => (haTot * v) / base) : ingSuelo.map(() => 0);
  const vivAnual = enteros(vivTot, ingSuelo);
  return {
    haAnual,
    haAcum: acum(haAnual),
    vivAnual,
    vivAcum: acum(vivAnual),
    haTot,
    vivTot,
  };
}

/**
 * Reparte una serie entre las dos AUDP usando una clave año a año. Donde la
 * clave no tiene masa ese año (p. ej. un costo que corre en años sin venta),
 * cae a la proporción del total de la clave, para no perder ni inventar UF.
 */
function repartir(serie: number[], claveB: number[], claveC: number[], audp: Audp): number[] {
  if (audp === "ambos") return serie.slice();
  const totB = suma(claveB), totC = suma(claveC);
  const fallback = totB + totC > 0 ? (audp === "batuco" ? totB / (totB + totC) : totC / (totB + totC)) : 0.5;
  return serie.map((v, i) => {
    const b = claveB[i], c = claveC[i];
    const den = b + c;
    const f = Math.abs(den) > 1e-9 ? (audp === "batuco" ? b / den : c / den) : fallback;
    return v * f;
  });
}

export const TIERRA_AUDP = 343000; // AUDP_TIERRA_TOTAL del simulador
const COMISION = 0.02;
export const VAN_RATE = 0.08;
/** Tasas que ofrece la lámina. El 8% es la del negocio inmobiliario; el 7%
 *  era la de la sanitaria y se deja disponible para comparar. */
export const TASAS = [0.08, 0.07] as const;
export const VAN_RATE_SAN = 0.07; // la sanitaria se descuenta al 7%
export const VENTA_SANITARIA = 147433;

/** Semestral tal cual hasta 2034 (2035 el equipamiento); residuo 2035+ con la forma anual. */
function fusion(sem: number[], an: number[]): number[] {
  const residuo = suma(an) - suma(sem);
  const base = YEARS.reduce((s, y, i) => s + (y >= 2035 ? an[i] : 0), 0);
  const out = sem.slice();
  if (Math.abs(base) > 1e-9) {
    const k = residuo / base;
    for (let i = 0; i < NY; i++) if (YEARS[i] >= 2035) out[i] += an[i] * k;
  }
  return out;
}

export interface Linea {
  label: string;
  arr: number[];
  total: number;
  /** Sub-filas de apertura (p. ej. factibilización por zona o por unidad). */
  detalle?: Linea[];
}
export interface Unidad {
  id: "tierra" | "sanitaria" | "consolidado";
  nombre: string;
  ingresos: Linea[];
  costos: Linea[];
  flujo: number[]; // flujo de caja futuro (sin factib gastada, sin tierra)
  resultado: number[]; // flujo + factib gastada — la base de caja, KT y payback
  resultadoAcum: number[];
  flujoVan: number[]; // resultado económico: flujo futuro ± tierra devengada
  // indicadores
  van: number;
  /** Tasa con la que se descontó el VAN. */
  vanTasa: number;
  tir: number | null;
  capitalTrabajo: number;
  payback: number | null;
  flujosPermanentes: number;
  totalIngresos: number;
  totalCostos: number;
  totalResultado: number;
}

function npvAt(flow: number[], rate: number) {
  return flow.reduce((s, v, i) => s + v / Math.pow(1 + rate, i), 0);
}
function tirDe(flow: number[]): number | null {
  if (!flow.some((v) => v < 0) || !flow.some((v) => v > 0)) return null;
  let lo = -0.99, hi = 10.0;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (npvAt(flow, mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
function paybackDe(resAcum: number[]): number | null {
  for (let i = 1; i < NY; i++) if (resAcum[i] >= 0 && resAcum[i - 1] < 0) return YEARS[i];
  return null;
}
/** Año desde el cual el flujo anual no vuelve a ser negativo. */
function permanentesDe(flujo: number[]): number {
  let last = -1;
  flujo.forEach((v, i) => {
    if (v < -0.5) last = i;
  });
  return last >= 0 && last + 1 < NY ? YEARS[last + 1] : YEARS[0];
}

export function computeConsolidado(audp: Audp = "ambos", tasa: number = VAN_RATE, alcance: Alcance = "inmobiliario"): { inmobiliario: Unidad; fisico: Fisico } {
  // Claves de reparto por AUDP (ver Criterios en la página):
  //  ingresos y equipamiento → venta de cada AUDP · infraestructura y
  //  mitigaciones → su propia serie por zona · mantención → hectáreas
  //  acumuladas (el verde que ya hay que mantener) · inversiones y negocio
  //  sanitario → viviendas · factibilización → su apertura de planilla.
  const rep = (x: number[], kb: number[], kc: number[]) => repartir(x, kb, kc, audp);
  const HA_ACUM_B = acum(HA_B), HA_ACUM_C = acum(HA_C);

  // ── unidad TIERRA ──
  const ingTierra = rep(fusion(SEM.ingresos, AN_T.ingresos), ING_B, ING_C);
  const infra = rep(fusion(SEM.infra, AN_T.infra), INFRA_B, INFRA_C);
  const mitig = rep(fusion(SEM.mitigaciones, AN_T.mitigaciones), MITIG_B, MITIG_C);
  const mant = rep(fusion(SEM.mantencion, AN_T.mantencion), HA_ACUM_B, HA_ACUM_C);
  const sanInv = rep(fusion(SEM.sanitariaInv, AN_T.sanitariaInv), VIV_B, VIV_C);
  const comercializacion = ingTierra.map((v) => -COMISION * v);
  const equip = rep(SEM.equipamiento, ING_B, ING_C);

  // COPEC es la venta de un terreno aparte: línea propia, fuera del devengo de tierra
  const copec = rep(serie({ 2030: 30000 }), ING_B, ING_C);
  const ingSinCopec = addv(ingTierra, copec.map((v) => -v));
  // serie total (sin filtrar) para devengar la tierra de cada AUDP
  const ingSinCopecTotal = addv(
    fusion(SEM.ingresos, AN_T.ingresos),
    serie({ 2030: 30000 }).map((v) => -v),
  );
  // La tierra se reparte por hectáreas, igual que tierraByZone del simulador:
  // Batuco 141.644 UF (41,30%) y Colina 201.356 UF (58,70%) = 343.000. Cada
  // AUDP devenga la suya contra sus propias ventas, así que el consolidado es
  // la suma de ambos devengos y las vistas son exactamente aditivas.
  const haB = HA_TOTAL.batuco, haC = HA_TOTAL.colina;
  const devengo = (monto: number, clave: number[]) => {
    const base = suma(clave);
    return base > 0 ? clave.map((v) => (-monto * v) / base) : clave.map(() => 0);
  };
  const ingSinCopecB = repartir(ingSinCopecTotal, ING_B, ING_C, "batuco");
  const ingSinCopecC = repartir(ingSinCopecTotal, ING_B, ING_C, "colina");
  const tierraDevB = devengo((TIERRA_AUDP * haB) / (haB + haC), ingSinCopecB);
  const tierraDevC = devengo((TIERRA_AUDP * haC) / (haB + haC), ingSinCopecC);
  const tierraDev =
    audp === "batuco" ? tierraDevB : audp === "colina" ? tierraDevC : addv(tierraDevB, tierraDevC);

  // El negocio inmobiliario asume la factibilización COMPLETA: la suya y la de
  // la sanitaria (criterio del Directorio, 2026-10-05). La de la tierra ya viene
  // abierta por AUDP en la planilla; la de la sanitaria se reparte con esa misma
  // proporción.
  const factPG_T = addv(
    audp === "batuco" ? FACTIB_T_BATUCO : audp === "colina" ? FACTIB_T_COLINA : AN_T.factibPorGastar,
    rep(AN_S.factibPorGastar, FACTIB_T_BATUCO, FACTIB_T_COLINA),
  );
  // La factibilización GASTADA: en el inmobiliario NO se carga (costo hundido,
  // criterio del Directorio 2026-10-05); en el proyecto completo sí entra.
  const factG_T = addv(
    rep(AN_T.factibGastada, FACTIB_T_BATUCO, FACTIB_T_COLINA),
    rep(AN_S.factibGastada, FACTIB_T_BATUCO, FACTIB_T_COLINA),
  );

  // ── operación sanitaria: solo pesa en el proyecto completo ──
  // Como es UNA sola unidad de negocio, el pago del desarrollador desaparece:
  // era una transferencia interna que neteaba las inversiones. Éstas quedan
  // una sola vez, que es el desembolso real.
  const completo = alcance === "completo";
  const cero = YEARS.map(() => 0);
  const sIngOp = completo ? rep(AN_S.ingOp, VIV_B, VIV_C) : cero;
  const sCostOp = completo ? rep(AN_S.costOp, VIV_B, VIV_C) : cero;
  const sVenta = completo ? rep(AN_S.venta, VIV_B, VIV_C) : cero;
  const factG = completo ? factG_T : cero;

  const tFlujo = addv(ingTierra, infra, mitig, comercializacion, mant, equip, sanInv, factPG_T, sIngOp, sCostOp, sVenta);
  const tRes = addv(tFlujo, factG);
  const tVanFlow = addv(tFlujo, tierraDev);
  const tResAcum = acum(tRes);

  const tierra: Unidad = {
    id: "tierra",
    nombre: ALCANCE_LABEL[alcance],
    ingresos: [
      { label: "Ingresos Venta de Tierra", arr: ingSinCopec, total: suma(ingSinCopec) },
      { label: "Venta terreno COPEC", arr: copec, total: suma(copec) },
      ...(completo
        ? [
            { label: "Ingresos Operacionales Sanitarios", arr: sIngOp, total: suma(sIngOp) },
            { label: "Venta Negocio Sanitario (2045)", arr: sVenta, total: suma(sVenta) },
          ]
        : []),
    ],
    costos: [
      { label: "Costos Infraestructura", arr: infra, total: suma(infra) },
      { label: "Costos Mitigaciones", arr: mitig, total: suma(mitig) },
      { label: "Comercialización (2%)", arr: comercializacion, total: suma(comercializacion) },
      { label: "Mantención y seguridad", arr: mant, total: suma(mant) },
      { label: "Equipamiento comercial (neto)", arr: equip, total: suma(equip) },
      {
        label: completo ? "Inversiones Sanitarias" : "Inversiones Sanitarias (asumidas)",
        arr: sanInv,
        total: suma(sanInv),
      },
      ...(completo ? [{ label: "Costos Operacionales Sanitarios", arr: sCostOp, total: suma(sCostOp) }] : []),
      {
        label: "Factibilización por gastar (incl. sanitaria)",
        arr: factPG_T,
        total: suma(factPG_T),
        detalle:
          audp === "ambos"
            ? [
                { label: "AUDP Batuco", arr: repartir(factPG_T, FACTIB_T_BATUCO, FACTIB_T_COLINA, "batuco"), total: suma(repartir(factPG_T, FACTIB_T_BATUCO, FACTIB_T_COLINA, "batuco")) },
                { label: "AUDP Colina", arr: repartir(factPG_T, FACTIB_T_BATUCO, FACTIB_T_COLINA, "colina"), total: suma(repartir(factPG_T, FACTIB_T_BATUCO, FACTIB_T_COLINA, "colina")) },
              ]
            : undefined,
      },
      ...(completo
        ? [{ label: "Factibilización gastada al 2026 (incl. sanitaria)", arr: factG, total: suma(factG) }]
        : []),
      { label: "Costo de la Tierra (aporte, devengado)", arr: tierraDev, total: suma(tierraDev) },
    ],
    flujo: tFlujo,
    resultado: tRes,
    resultadoAcum: tResAcum,
    flujoVan: tVanFlow,
    van: npvAt(tVanFlow, tasa),
    vanTasa: tasa,
    // la TIR corre desde hoy e incluye la factibilización gastada
    tir: tirDe(addv(tVanFlow, factG)),
    capitalTrabajo: Math.abs(Math.min(...tResAcum, 0)),
    payback: paybackDe(tResAcum),
    flujosPermanentes: permanentesDe(tRes),
    totalIngresos: suma(addv(ingTierra, sIngOp, sVenta)),
    totalCostos: suma(addv(infra, mitig, comercializacion, mant, equip, sanInv, sCostOp, factPG_T, factG)),
    totalResultado: suma(tRes),
  };

  // ── venta física, con la curva de venta de suelo de esta vista ──
  const fisico = fisicoDe(ingSinCopec, HA_TOTAL_DE[audp], VIV_TOTAL_DE[audp]);

  return { inmobiliario: tierra, fisico };
}

/**
 * Paridad con las planillas anuales del simulador: los totales por concepto
 * de la fusión deben calzar con Primeras Etapas AUDP / SAN AUDP. La página
 * los contrasta en vivo — si el modelo se toca y deja de calzar, se delata.
 */
export const PARIDAD_PLANILLAS = {
  ingresosTierra: 3031842, // total planilla AUDP (la fusión suma COPEC dentro)
  infraestructura: -563290,
  mitigaciones: -185075,
  mantencion: -42767,
  inversionesSanitarias: -318587, // etapas 1-6 gatilladas de la planta
  resultadoTierraPlanilla: 1602065, // sin equipamiento comercial (la anual no lo modela)
  resultadoSanitariaPlanilla: 61025,
  equipamientoSemestral: -11868, // única diferencia de total vs las anuales
} as const;
