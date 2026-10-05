// Chequeo del Excel del consolidado. Corre con:
//   npx tsx --tsconfig tsconfig.json scripts/check-excel.ts
//
// Genera el libro de las tres vistas y verifica que ninguna celda haya quedado
// con el texto '{"formula"...}'. Ese era el síntoma de pasar una fórmula vacía
// a exceljs: Excel abría el archivo "Reparado" y sin contenido.
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { construirLibroConsolidado } from "@/lib/consolidado-export";
import { computeConsolidado, AUDP_LABEL, type Audp } from "@/lib/consolidado-model";
import ExcelJS from "exceljs";

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "xls-"));
  let fallas = 0;
  for (const audp of ["ambos", "batuco", "colina"] as Audp[]) {
    const { inmobiliario } = computeConsolidado(audp);
    const wb = await construirLibroConsolidado([inmobiliario]);
    const ruta = join(dir, `${audp}.xlsx`);
    writeFileSync(ruta, Buffer.from(await wb.xlsx.writeBuffer()));

    const leido = new ExcelJS.Workbook();
    await leido.xlsx.readFile(ruta);
    const sucias: string[] = [];
    let celdas = 0, formulas = 0;
    leido.eachSheet((ws) =>
      ws.eachRow((row) =>
        row.eachCell((c) => {
          celdas++;
          const v = c.value;
          if (v && typeof v === "object" && "formula" in v) {
            formulas++;
            if (!(v as { formula: string }).formula) sucias.push(`${ws.name}!${c.address} fórmula vacía`);
          }
          if (typeof v === "string" && v.includes('{"formula"')) sucias.push(`${ws.name}!${c.address} ${v.slice(0, 40)}`);
        }),
      ),
    );
    const ok = sucias.length === 0;
    if (!ok) fallas++;
    console.log(
      `${ok ? "OK " : "MAL"}  ${AUDP_LABEL[audp].padEnd(24)} hojas ${leido.worksheets.length} · ${celdas} celdas · ${formulas} fórmulas${ok ? "" : "  → " + sucias.slice(0, 4).join(" | ")}`,
    );
  }
  console.log(fallas === 0 ? "\n✓ LOS TRES LIBROS ESTÁN SANOS" : `\n✗ ${fallas} LIBROS CORRUPTOS`);
  process.exit(fallas === 0 ? 0 : 1);
}
main().catch((e) => { console.error("FALLÓ:", e.message); process.exit(1); });
