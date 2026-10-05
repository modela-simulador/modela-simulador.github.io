/**
 * Canibalización de ventas en proyectos multi-etapa.
 *
 * Cuando varias etapas venden simultáneamente, el mercado absorbe MENOS
 * que la suma individual. Factor de canibalización:
 *   velocidadTotalActiva = baseVelocity × cannibalizationFactor(n)
 *
 * donde n es el número de etapas activas vendiendo en un mes dado.
 * Cada etapa recibe una fracción proporcional: baseVelocity × factor(n) / n.
 *
 * Dato conocido (aportado por Sebastián):
 *   factor(1) = 1.00  (1 etapa: vende n unidades)
 *   factor(2) = 1.35  (2 etapas: entre ambas venden 1.35n, no 2n)
 *
 * De 3 a 7 la curva se extiende manteniendo las dos propiedades que pidió el
 * negocio: cóncava (cada etapa extra suma menos) y factor(n)/n decreciente
 * (abrir más etapas baja la velocidad de cada una). Son supuestos, no dato
 * duro: si aparece evidencia de mercado, se ajusta la tabla.
 */

export function cannibalizationFactor(nActiveEtapas: number): number {
  if (nActiveEtapas <= 0) return 0;
  // Dato del fundador: factor(1)=1.00 y factor(2)=1.35. De ahí en adelante la
  // curva sigue cóncava — el mercado local absorbe cada vez menos por etapa.
  const TABLA = [0, 1.0, 1.35, 1.55, 1.7, 1.82, 1.92, 2.0];
  if (nActiveEtapas < TABLA.length) return TABLA[nActiveEtapas];
  // Por sobre la tabla, extrapolación logarítmica suave (no debería usarse).
  return 2.0 + 0.08 * Math.log2(nActiveEtapas / 7);
}
