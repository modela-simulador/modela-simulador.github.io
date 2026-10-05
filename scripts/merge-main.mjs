// Fusiona el contenido de la rama main (hub y herramientas estáticas: territorial,
// simulador, etc.) sobre el export de Next (out/), que aporta /conectividad y el
// resto del sitio. Así un deploy desde esta rama publica AMBOS mundos y no borra
// el trabajo que main recibe por su lado. Corre solo en el build de GitHub Pages
// (DEPLOY_TARGET=gh-pages), después de `next build`.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

if (process.env.DEPLOY_TARGET !== "gh-pages") {
  console.log("[merge-main] DEPLOY_TARGET no es gh-pages: sin fusión (build local).");
  process.exit(0);
}
if (!existsSync("out")) {
  console.error("[merge-main] no existe out/: correr después de next build");
  process.exit(1);
}
const run = (cmd) => execSync(cmd, { stdio: "inherit" });
run("rm -rf /tmp/main-src");
run("git clone --depth 1 --branch main https://github.com/modela-simulador/modela-simulador.github.io.git /tmp/main-src");
// main gana (es el mundo que se edita aparte); /conectividad no existe en main,
// así que el export lo conserva intacto. Se excluye lo que no es sitio.
//
// index.html NO se pisa: el de main es un redirect de abril a simulador.html y
// tapaba el hub de herramientas (login + tarjetas de cabidas, valorización de
// suelo, consolidado, integración y conectividad), que es lo que debe recibir
// a quien entra a la raíz. El simulador sigue en /simulador.html y el hub lo
// enlaza.
run(
  "rsync -a --exclude '.git' --exclude '.github' --exclude 'CLAUDE.md' --exclude 'index.html' /tmp/main-src/ out/",
);
console.log("[merge-main] main fusionado sobre out/ (main gana salvo index.html; hub y /conectividad intactos).");
