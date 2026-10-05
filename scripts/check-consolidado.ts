// Chequeo del consolidado por AUDP. Corre con:
//   npx tsx --tsconfig tsconfig.json scripts/check-consolidado.ts
//
// Guarda tres invariantes que es fácil romper al tocar el modelo:
//  1. Batuco + Colina = Ambos, año a año y en los totales (incluido el VAN).
//  2. El modo Ambos sigue calzando con las planillas del simulador.
//  3. Las hectáreas y las viviendas cuadran con las constantes del proyecto.
import { computeConsolidado, PARIDAD_PLANILLAS, YEARS } from "@/lib/consolidado-model";

const A = computeConsolidado("ambos");
const B = computeConsolidado("batuco");
const C = computeConsolidado("colina");
const r2 = (n: number) => Math.round(n * 100) / 100;
let fallas = 0;
const chk = (nombre: string, a: number, b: number, tol = 1) => {
  const ok = Math.abs(a - b) <= tol;
  if (!ok) fallas++;
  console.log(`${ok ? "OK " : "MAL"}  ${nombre.padEnd(42)} ${r2(a)}  vs  ${r2(b)}`);
};

console.log("── invariante: Batuco + Colina = Ambos ──");
for (const u of ["tierra", "sanitaria"] as const) {
  const i = { tierra: 0, sanitaria: 1 }[u];
  const g = (x: ReturnType<typeof computeConsolidado>) => [x.tierra, x.sanitaria][i];
  chk(`${u} · resultado`, g(B).totalResultado + g(C).totalResultado, g(A).totalResultado);
  chk(`${u} · ingresos`, g(B).totalIngresos + g(C).totalIngresos, g(A).totalIngresos);
  chk(`${u} · costos`, g(B).totalCostos + g(C).totalCostos, g(A).totalCostos);
}
console.log("\n── aditividad del VAN y del costo de la tierra ──");
for (const u of ["tierra", "sanitaria"] as const) {
  const i = { tierra: 0, sanitaria: 1 }[u];
  const g = (x: ReturnType<typeof computeConsolidado>) => [x.tierra, x.sanitaria][i];
  chk(`${u} · VAN`, g(B).van + g(C).van, g(A).van, 0.5);
}
const tierraDe = (x: ReturnType<typeof computeConsolidado>) =>
  x.tierra.costos.find((c) => c.label.startsWith("Costo de la Tierra"))!.total;
chk("Costo de la Tierra · Batuco", -tierraDe(B), 141644, 2);
chk("Costo de la Tierra · Colina", -tierraDe(C), 201356, 2);
chk("Costo de la Tierra · suma", -(tierraDe(B) + tierraDe(C)), 343000, 1);

console.log("\n── año a año del flujo consolidado ──");
let peor = 0;
YEARS.forEach((y, i) => {
  const d = Math.abs(B.tierra.resultado[i] + C.tierra.resultado[i] - A.tierra.resultado[i]);
  if (d > peor) peor = d;
});
chk("peor desviación anual (UF)", peor, 0, 0.01);

console.log("\n── paridad con las planillas (modo Ambos, no debe moverse) ──");
chk("Ingresos Venta de Tierra", A.tierra.totalIngresos, PARIDAD_PLANILLAS.ingresosTierra, 2);
const tot = (u: typeof A.tierra, p: string) => u.costos.find((c) => c.label.startsWith(p))?.total ?? 0;
chk("Costos Infraestructura", tot(A.tierra, "Costos Infraestructura"), PARIDAD_PLANILLAS.infraestructura, 2);
chk("Costos Mitigaciones", tot(A.tierra, "Costos Mitigaciones"), PARIDAD_PLANILLAS.mitigaciones, 2);
chk("Mantención y seguridad", tot(A.tierra, "Mantención"), PARIDAD_PLANILLAS.mantencion, 2);
chk("Inversiones Sanitarias", tot(A.tierra, "Inversiones Sanitarias"), PARIDAD_PLANILLAS.inversionesSanitarias, 2);
chk("Resultado Sanitaria", A.sanitaria.totalResultado, PARIDAD_PLANILLAS.resultadoSanitariaPlanilla, 2);

console.log("\n── hectáreas y viviendas ──");
const s = (a: number[]) => a.reduce((x, y) => x + y, 0);
chk("ha Batuco", s(B.fisico.haAnual), 16.51, 0.001);
chk("ha Colina", s(C.fisico.haAnual), 23.47, 0.001);
chk("ha ambos", s(A.fisico.haAnual), 39.98, 0.001);
chk("viviendas Batuco", s(B.fisico.vivAnual), 1906, 0);
chk("viviendas Colina", s(C.fisico.vivAnual), 2444, 0);
chk("viviendas ambos", s(A.fisico.vivAnual), 4350, 0);
chk("Batuco + Colina = ambos · ha", s(B.fisico.haAnual) + s(C.fisico.haAnual), s(A.fisico.haAnual), 0.001);
chk("Batuco + Colina = ambos · viviendas", s(B.fisico.vivAnual) + s(C.fisico.vivAnual), s(A.fisico.vivAnual), 0);

// nada puede venderse antes del primer macrolote
const primero = (a: number[]) => YEARS[a.findIndex((v) => v > 0.0005)];
chk("primer año con hectáreas", primero(A.fisico.haAnual), 2031, 0);
chk("primer año con viviendas", primero(A.fisico.vivAnual), 2031, 0);

// el inmobiliario no puede llevarse nada operacional ni la venta de la sanitaria
const etiquetas = [...A.tierra.ingresos, ...A.tierra.costos].map((l) => l.label).join(" | ");
chk("inmobiliario sin líneas de la sanitaria",
  /Operacional|Pago Desarrollador|Venta Negocio Sanitario/.test(etiquetas) ? 1 : 0, 0, 0);
chk("inmobiliario conserva el capex sanitario",
  A.tierra.costos.some((l) => l.label.startsWith("Inversiones Sanitarias")) ? 1 : 0, 1, 0);

console.log("\n── indicadores por AUDP ──");
for (const [n, x] of [["Batuco", B], ["Colina", C], ["Ambos", A]] as const) {
  const c = x.tierra;
  console.log(`  ${n.padEnd(7)} resultado ${Math.round(c.totalResultado).toLocaleString("es-CL").padStart(10)} UF · VAN ${Math.round(c.van).toLocaleString("es-CL").padStart(9)} · TIR ${((c.tir ?? 0) * 100).toFixed(1)}% · KT ${Math.round(c.capitalTrabajo).toLocaleString("es-CL").padStart(8)} · payback ${c.payback}`);
}
console.log(fallas === 0 ? "\n✓ TODO CUADRA" : `\n✗ ${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
