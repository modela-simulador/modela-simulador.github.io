// Chequeo del consolidado por AUDP. Corre con:
//   npx tsx --tsconfig tsconfig.json scripts/check-consolidado.ts
//
// Guarda las invariantes que es fácil romper al tocar el modelo:
//  1. Batuco + Colina = Ambos, año a año y en los totales (incluido el VAN).
//  2. El modo Ambos sigue calzando con las planillas del simulador.
//  3. Las hectáreas y las viviendas cuadran con las constantes del proyecto
//     y no se vende nada antes de 2031.
//  4. El negocio inmobiliario no arrastra nada operacional de la sanitaria.
import { computeConsolidado, PARIDAD_PLANILLAS, YEARS } from "@/lib/consolidado-model";

const A = computeConsolidado("ambos");
const B = computeConsolidado("batuco");
const C = computeConsolidado("colina");
const r2 = (n: number) => Math.round(n * 100) / 100;
let fallas = 0;
const chk = (nombre: string, a: number, b: number, tol = 1) => {
  const ok = Math.abs(a - b) <= tol;
  if (!ok) fallas++;
  console.log(`${ok ? "OK " : "MAL"}  ${nombre.padEnd(44)} ${r2(a)}  vs  ${r2(b)}`);
};
const s = (a: number[]) => a.reduce((x, y) => x + y, 0);

console.log("── invariante: Batuco + Colina = Ambos ──");
chk("resultado", B.inmobiliario.totalResultado + C.inmobiliario.totalResultado, A.inmobiliario.totalResultado);
chk("ingresos", B.inmobiliario.totalIngresos + C.inmobiliario.totalIngresos, A.inmobiliario.totalIngresos);
chk("costos", B.inmobiliario.totalCostos + C.inmobiliario.totalCostos, A.inmobiliario.totalCostos);
chk("VAN", B.inmobiliario.van + C.inmobiliario.van, A.inmobiliario.van, 0.5);
let peor = 0;
YEARS.forEach((_, i) => {
  const d = Math.abs(B.inmobiliario.resultado[i] + C.inmobiliario.resultado[i] - A.inmobiliario.resultado[i]);
  if (d > peor) peor = d;
});
chk("peor desviación anual (UF)", peor, 0, 0.01);

console.log("\n── paridad con las planillas (modo Ambos) ──");
const tot = (pref: string) => A.inmobiliario.costos.find((c) => c.label.startsWith(pref))?.total ?? 0;
chk("Ingresos Venta de Tierra", A.inmobiliario.totalIngresos, PARIDAD_PLANILLAS.ingresosTierra, 2);
chk("Costos Infraestructura", tot("Costos Infraestructura"), PARIDAD_PLANILLAS.infraestructura, 2);
chk("Costos Mitigaciones", tot("Costos Mitigaciones"), PARIDAD_PLANILLAS.mitigaciones, 2);
chk("Mantención y seguridad", tot("Mantención"), PARIDAD_PLANILLAS.mantencion, 2);
chk("Inversiones Sanitarias", tot("Inversiones Sanitarias"), PARIDAD_PLANILLAS.inversionesSanitarias, 2);

console.log("\n── el inmobiliario asume toda la factibilización ──");
chk("Factibilización por gastar", tot("Factibilización por gastar"), -58923 - 34641 - 24350 - 4909 - 2813 - 1139 - 133 - 11850 - 9099 - 6336 - 892 - 842 - 827 - 779, 2);
chk("sin factibilización gastada", tot("Factibilización gastada"), 0, 0);
const etiquetas = [...A.inmobiliario.ingresos, ...A.inmobiliario.costos].map((l) => l.label).join(" | ");
chk("sin operacionales ni venta sanitaria", /Operacional|Pago Desarrollador|Venta Negocio Sanitario/.test(etiquetas) ? 1 : 0, 0, 0);

console.log("\n── hectáreas y viviendas ──");
chk("ha Batuco", s(B.fisico.haAnual), 16.51, 0.001);
chk("ha Colina", s(C.fisico.haAnual), 23.47, 0.001);
chk("ha ambos", s(A.fisico.haAnual), 39.98, 0.001);
chk("viviendas ambos", s(A.fisico.vivAnual), 4350, 0);
chk("Batuco + Colina = ambos · viviendas", s(B.fisico.vivAnual) + s(C.fisico.vivAnual), 4350, 0);
const primero = (a: number[]) => YEARS[a.findIndex((v) => v > 0.0005)];
chk("primer año con hectáreas", primero(A.fisico.haAnual), 2031, 0);
chk("primer año con viviendas", primero(A.fisico.vivAnual), 2031, 0);

console.log("\n── proyecto completo como una sola unidad ──");
const K = computeConsolidado("ambos", 0.08, "completo");
const KB = computeConsolidado("batuco", 0.08, "completo");
const KC = computeConsolidado("colina", 0.08, "completo");
chk("resultado del proyecto completo", K.inmobiliario.totalResultado, 1651223, 2);
chk("Batuco + Colina = Ambos", KB.inmobiliario.totalResultado + KC.inmobiliario.totalResultado, K.inmobiliario.totalResultado, 1);
chk("VAN aditivo", KB.inmobiliario.van + KC.inmobiliario.van, K.inmobiliario.van, 0.5);
const etqK = [...K.inmobiliario.ingresos, ...K.inmobiliario.costos].map((l) => l.label).join(" | ");
chk("trae la operación sanitaria", /Operacionales Sanitarios/.test(etqK) ? 1 : 0, 1, 0);
chk("trae la venta del sanitario", /Venta Negocio Sanitario/.test(etqK) ? 1 : 0, 1, 0);
chk("trae la factibilización gastada", /Factibilización gastada/.test(etqK) ? 1 : 0, 1, 0);
// el pago del desarrollador era una transferencia interna: en una sola unidad no existe
chk("sin pago del desarrollador", /Pago Desarrollador/.test(etqK) ? 1 : 0, 0, 0);
const invK = K.inmobiliario.costos.filter((l) => l.label.startsWith("Inversiones Sanitarias"));
chk("las inversiones sanitarias van una sola vez", invK.length, 1, 0);
chk("y por su monto real", invK[0]?.total ?? 0, -318587, 2);

console.log("\n── tasa de descuento ──");
const A7 = computeConsolidado("ambos", 0.07);
chk("VAN al 8%", A.inmobiliario.van, 433903, 2);
chk("VAN al 7%", A7.inmobiliario.van, 504047, 2);
chk("bajar la tasa sube el VAN", A7.inmobiliario.van > A.inmobiliario.van ? 1 : 0, 1, 0);
chk("la TIR no depende de la tasa", (A7.inmobiliario.tir ?? 0) - (A.inmobiliario.tir ?? 0), 0, 1e-9);
chk("el resultado no depende de la tasa", A7.inmobiliario.totalResultado, A.inmobiliario.totalResultado, 0.5);

console.log("\n── indicadores por AUDP ──");
for (const [n, x] of [["Batuco", B], ["Colina", C], ["Ambos", A]] as const) {
  const c = x.inmobiliario;
  console.log(`  ${n.padEnd(7)} resultado ${Math.round(c.totalResultado).toLocaleString("es-CL").padStart(10)} UF · VAN ${Math.round(c.van).toLocaleString("es-CL").padStart(9)} · TIR ${((c.tir ?? 0) * 100).toFixed(1)}% · KT ${Math.round(c.capitalTrabajo).toLocaleString("es-CL").padStart(8)} · payback ${c.payback}`);
}
console.log(fallas === 0 ? "\n✓ TODO CUADRA" : `\n✗ ${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
