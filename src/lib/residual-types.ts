/**
 * Método Residual Dinámico — Type Definitions
 *
 * Replicates the financial model from "Evaluación C.T. Batuco Edificios 2026.xlsx"
 * All monetary values in UF unless noted otherwise.
 */

// ── Unit model (apartment/house type within a project) ──────

export interface UnitModel {
  name: string;
  supVendibleM2: number;
  supConstruidaM2: number;
  count: number;
  priceUFm2: number;       // sale price per m² vendible (gross, includes IVA)
  parkingCount: number;     // parking spots TOTAL for this model (surface + subt)
  parkingPriceUF: number;   // price per parking spot superficie (gross)
  parkingPriceSubtUF: number; // price per parking spot subterráneo (gross)
  bodegaCount: number;
  bodegaPriceUF: number;
}

// ── Full input set for the residual engine ───────────────────

export interface ResidualInputs {
  // Lot identification
  lotAreaM2: number;
  lotFid: string;
  productId: string;

  // Unit configuration
  unitModels: UnitModel[];
  totalUnits: number;         // derived: sum(unitModels[].count)
  totalSupConstruidaM2: number;  // derived
  totalSupVendibleM2: number;    // derived

  // Sales
  salesVelocity: number;      // units/month

  // PRC (Plan Regulador Comunal) — si hay nuevo PRC aprobado,
  // la densidad permitida es mayor (190 viv/ha para deptos con 6 pisos)
  // vs. norma actual (150 viv/ha con 4 pisos).
  prcOn: boolean;

  // Áreas comunes: % sobre vendible que se agrega a la superficie construida
  // supConstruida = supVendible × (1 + commonAreaPct)
  // 0.20 (20%) → ratio 1.20× (típico chileno, equivalente a ~83% de "eficiencia")
  commonAreaPct: number;           // 0.10 - 0.30

  // Placas comerciales (locales en primer piso u otro)
  comercioOn: boolean;             // activa/desactiva placas comerciales
  comercioM2: number;              // m² de superficie comercial
  comercioPriceUFm2: number;       // precio de venta UF/m² (bruto, con IVA)
  comercioConstructionCostUFm2: number; // costo directo UF/m² (sin postventa/utilidad/imprevistos)

  // Subterranean parking
  subterraneoOn: boolean;          // include subterranean garage in construction cost
  subterraneoPct: number;          // % of parking spots that go to subterranean (0-1)
  subterraneoAreaPerUnit: number;  // m² BRUTO por estac (incluye muros, rampas, circulación — típico 30)
  subterraneoCostUFm2: number;     // costo directo bajo cota 0 UF/m² (default 10)
  subterraneoConstructionMonths: number; // plazo construcción subterráneo (meses, default 1) → suma gastos generales
  subterraneoExcavationCostUFm2: number; // mov. tierra = excavación cuando hay subt (UF/m², default 0.5)

  // Construction costs
  constructionCostUFm2: number;    // UF/m² construido (direct cost)
  urbanizationCostUFm2: number;    // UF/m² terreno
  earthMovementCostUFm2: number;   // UF/m² terreno
  indirectCostsUFMonth: number;    // UF/month during construction
  postVentaConstructionPct: number; // % of construction cost (2.5%)
  constructorUtilityPct: number;    // % of construction cost (6.5%)
  contingenciesPct: number;         // % of construction cost (1.0%)

  // IVA
  ivaRate: number;                  // 19%

  // GAV (Gastos de Administración y Ventas) — nombres exactos del Excel
  escrituracionUFPerUnit: number;
  salesCommissionPct: number;      // Ventas Fijas + Variables (% bruto)
  marketingPct: number;            // Marketing Fijo + Variable (% bruto)
  decoracionPilotoUF: number;      // Decoración Piloto y Pto.Venta (UF total, default 0)
  stockMaintenanceUFPerUnit: number; // Condominios y Mantención Stock (UF/viv/mes)
  postVentaGavPct: number;         // Post Venta Inmobiliaria (% neto)
  contribucionesViviendasUFPerUnit: number; // Contribuciones Viviendas Stock (UF/viv)
  administracionGeneralFijoUF: number; // Administración General (UF fijos, default 0)
  tarifaGestionInmobiliariaPct: number; // Tarifa por Gestión Inmobiliaria (% bruto, era "adminPct")
  greenInsuranceUFPerUnit: number;   // Seguro Venta en Verde

  // Studies & design — detailed (UF/m² construido) — matches Excel rows
  estudioArquitecturaUFm2: number;      // 0.37
  estudioCalculoUFm2: number;           // 0.06
  estudioMecanicaSuelosUFm2: number;    // 0.05
  estudioSanitariosUFm2: number;        // 0.04
  estudioElectricoUFm2: number;         // 0.04
  estudioBasuraUFm2: number;            // 0
  estudioImpactoVialUFm2: number;       // 0.01
  estudioImpactoAmbientalUFm2: number;  // 0
  estudioSenaleticaUFm2: number;        // 0.04
  estudioOtrosGlobalUFm2: number;       // 0.05
  estudiosAntesICUFm2: number;          // 0.5 (estudios pre-IC, flat)
  studiesBeforeICPct: number;           // % of studies spent before construction (timing)

  // Licencias y Trámites (UF/m² construido)
  permisoObraUFm2: number;              // 0.03
  gastosRecepcionUFm2: number;          // 0.009

  // Contribuciones (otras)
  afrUFPerUnit: number;                 // AFR flat fee per unit (5 UF/viv default)
  vialContributionUFPerUnit: number;    // IMIV — aportes viales en UF/viv (25 default)
  itoUFMonth: number;                   // ITO UF/mes (se multiplica por plazo construcción)

  // Timeline (month offsets from project start = month 0)
  monthLandPurchase: number;
  monthPreSalesStart: number;
  monthPermitObtained: number;
  monthConstructionStart: number;     // fallback manual si autoConstructionStart = false
  autoConstructionStart: boolean;     // inicia construcción cuando se alcanza % preventa
  preventasBeforeConstructionPct: number; // % de unidades pre-vendidas antes de obra (0.20 = 20%)
  constructionMonths: number;
  monthsAfterConstructionToReception: number; // typically 2
  monthsAfterReceptionToEscrituracion: number; // typically 0
  stockAccelerationPct: number;       // aceleración de velocidad ventas tras recepción (0.30 = +30%)

  // Revenue collection structure
  piePct: number;                  // 15% = down payment
  /** @deprecated PIE ahora se reparte automáticamente entre mes de venta y escrituración */
  pieMonths: number;
  escrituracionCollectionPct: number; // 85%
  escrituracionLagMonths: number;  // months between sale and its escrituración (post-recepción stock)

  // Financial targets & solver mode
  // 'TIR'    → fija TIR, utility sale como resultado
  // 'Utility'→ fija utility, TIR sale como resultado
  // 'Both'   → exige AMBAS ≥ target, toma el land más restrictivo (MIN). Una métrica queda exacta, la otra con holgura.
  solverMode: 'TIR' | 'Utility' | 'Both';
  targetTIRAnnual: number;         // TIR anual target (unlevered)
  developerMarginPct: number;      // Utility target (acontecible)

  // Financing (for levered analysis)
  landFinancingPct: number;
  constructionFinancingPct: number;
  interestRateAnnual: number;

  // Multi-etapa: permite simular 1 o 2 etapas consecutivas con traslape.
  // Etapa 2 inicia obra cuando alcanza X% preventa (igual regla que etapa 1);
  // su preventa arranca antes para calzar con traslape deseado contra etapa 1.
  // Durante meses donde AMBAS etapas venden activamente, la velocidad total se
  // canibaliza: 2 etapas = 1.35× baseVelocity (cada una recibe 0.675×).
  /** Número de etapas consecutivas, de 1 a 7. Cada una construye en
   *  `constructionMonths` (el plazo de obra es SIEMPRE por etapa). */
  numEtapas: number;
  etapaOverlapMonths: number;  // meses de traslape de obra entre etapas sucesivas
  /** Plusvalía anual del precio de venta. 0.02 = 2% al año. El precio al que
   *  se promete una unidad crece (1+p)^(mes/12) desde el mes 0. */
  plusvaliaAnualPct: number;

  // Crédito de Enlace (subsidio gobierno DS19): préstamo sin interés durante obra,
  // repagado proporcional a escrituraciones post-recepción. Mejora TIR reduciendo
  // capital negativo acumulado en la fase de construcción.
  creditoEnlaceOn: boolean;
  creditoEnlaceUFPerUnit: number;  // 300 UF/viv default para DS19

  // Distribución temporal del pago a contratista (todos los productos):
  // - Anticipo al inicio de obra (típico 15-20% del contrato)
  // - SoPs mensuales siguiendo curva S (menos al inicio/final, peak en mitad)
  // - Retención sobre cada SoP (típico 5%, liberada en recepción)
  // - Recuperación del anticipo via descuento en cada SoP (típico 15%)
  constructionAdvancePct: number;       // Anticipo a contratista (fracción del directo)
  constructionRetencionPct: number;     // Retención por SoP (fracción)
  anticipoRecoveryFromSoPPct: number;   // % del SoP que amortiza el anticipo

  // Income tax
  incomeTaxRate: number;           // 27%

  // Land contributions / holding costs
  landContributionsUF: number;     // contribuciones terreno during project
  landBrokerageUF: number;         // corretaje terreno
}

// ── Monthly cash flow detail ─────────────────────────────────

export interface MonthlyCashFlowRow {
  month: number;
  date: string;                    // "YYYY-MM" label
  utilidadDesarrollador: number;   // honorarios del desarrollador (costo fijo)
  ivaDebitoReceived: number;       // IVA cobrado al cliente con venta (cash IN — Excel D59)
  ivaCreditoPaid: number;          // IVA pagado a proveedor con costo (cash OUT — Excel D60)

  // Sales counters
  unitsSoldThisMonth: number;
  cumulativeUnitsSold: number;
  unitsDelivered: number;
  cumulativeUnitsDelivered: number;

  // Revenue streams
  revenuePIE: number;              // down payments received
  revenueEscrituracion: number;    // deed collection (85%)
  totalRevenue: number;

  // Cost items
  landCost: number;
  landContributions: number;
  constructionCost: number;
  urbanizationCost: number;
  earthMovementCost: number;
  indirectCosts: number;
  postVentaConstruction: number;
  constructorUtility: number;
  contingencies: number;
  constructionAdvance: number;     // anticipo al contratista (único capital propio de obra; el resto va al crédito)
  studiesPermitsCost: number;
  afrVialCost: number;
  itoCost: number;
  totalConstructionCost: number;

  // GAV
  escrituracionCost: number;
  salesCommission: number;
  marketingCost: number;
  adminCost: number;
  postVentaGav: number;
  stockMaintenance: number;
  greenInsurance: number;
  totalGAV: number;

  // Financial
  financingInterest: number;
  ivaPaid: number;
  incomeTax: number;

  // Net flows
  totalCost: number;
  netCashFlow: number;             // unlevered (pure project)
  cumulativeCashFlow: number;

  // Levered flow
  financingDrawdown: number;
  financingRepayment: number;
  netCashFlowLevered: number;
  cumulativeCashFlowLevered: number;

  // Crédito de Enlace (DS19) — desembolsos durante obra + repagos proporcional a escri
  creditoEnlaceDrawdown: number;
  creditoEnlaceRepayment: number;
}

// ── P&L Summary (EERR) — matches Excel row-by-row ────────────

export interface ProfitAndLoss {
  // ─── INGRESOS DE EXPLOTACIÓN ───
  ventasInmobiliariasNet: number;
  ventasInmobiliariasGross: number;
  ventasEstacionamientosNet: number;
  ventasEstacionamientosGross: number;
  ventasBodegasNet: number;
  ventasBodegasGross: number;
  ventaLocalesNet: number;
  ventaLocalesGross: number;
  totalIngresosNet: number;        // TOTAL INGRESOS DE EXPLOTACIÓN
  totalIngresosGross: number;

  // ─── COSTOS DE EXPLOTACIÓN ───
  terrenoNet: number;
  terrenoGross: number;
  contribucionesCorretajeTerreno: number;
  interesesTerreno: number;

  // Construcción (grupo que agrupa sub-items)
  construccionNet: number;         // = edificacion + urbanizacion + infraestructura
  construccionGross: number;
  edificacionNet: number;          // incluye indirectos, utilidad, post-venta, imprevistos allocados
  edificacionGross: number;
  menorCostoIVA: number;
  urbanizacionNet: number;         // incluye mov. tierra
  urbanizacionGross: number;
  infraestructuraNet: number;      // 0 by default (externa)

  afrAportesViales: number;
  estudiosDisenoVariables: number;
  licenciasTramitesVariables: number;
  inspeccionTecnica: number;
  interesesConstruccion: number;
  totalCostosExplotacionNet: number;
  totalCostosExplotacionGross: number;

  // ─── MARGEN ───
  margenExplotacion: number;
  margenExplotacionPct: number;

  // ─── GASTOS DE ADMIN Y VENTAS ───
  servicioEscrituracion: number;
  ventasFijasVariables: number;
  ventasFijasVariablesGross: number;
  seguroVentaVerde: number;
  seguroVentaVerdeGross: number;
  marketingFijoVariable: number;
  marketingFijoVariableGross: number;
  decoracionPiloto: number;
  condominiosMantencionStock: number;
  postVentaInmobiliaria: number;
  contribucionesViviendas: number;
  administracionGeneral: number;   // fijo
  tarifaGestionInmobiliaria: number;
  totalGAVNet: number;
  totalGAVGross: number;

  // ─── RESULTADO ───
  resultadoExplotacion: number;
  resultadoExplotacionPct: number;

  gastosFinCreditoConstruccion: number;
  // IVA a proveedores NO recuperable: relevante solo para exentos (DS19).
  // El desarrollador paga bruto a contratista/estudios/ITO pero no recupera
  // contra débito (porque no hay débito). Costo de caja real no reflejado en NETO.
  ivaNoRecuperable: number;
  utilidadDesarrollador: number;     // Honorarios fijos del desarrollador (% de ventas)
  utilidadDesarrolladorPct: number;
  utilidadAntesImpuesto: number;
  utilidadAntesImpuestoPct: number;
  impuestoRenta: number;
  pagoIVA: number;
  utilidadEtapa: number;
  utilidadEtapaPct: number;

  // ─── ALIAS for backwards compatibility ───
  totalRevenueGross: number;
  totalRevenueNet: number;
  revenueImmobiliaryNet: number;
  revenueParkingNet: number;
  revenueBodegaNet: number;
  landCost: number;
  landContributions: number;
  constructionTotal: number;
  urbanizationTotal: number;
  earthMovementTotal: number;
  indirectCostsTotal: number;
  postVentaConstructionTotal: number;
  constructorUtilityTotal: number;
  contingenciesTotal: number;
  studiesPermitsTotal: number;
  afrVialTotal: number;
  itoTotal: number;
  constructionInterest: number;
  totalCostsExploitation: number;
  grossMargin: number;
  grossMarginPct: number;
  totalGAV: number;
  gavBreakdown: {
    escrituracion: number;
    sales: number;
    marketing: number;
    admin: number;
    postVenta: number;
    stockMaintenance: number;
    greenInsurance: number;
  };
  operatingResult: number;
  operatingResultPct: number;
  financingCost: number;
  profitBeforeTax: number;
  incomeTax: number;
  ivaPaid: number;
  netProfit: number;
  netProfitPct: number;
}

// ── Full solver output ───────────────────────────────────────

export interface ResidualOutput {
  // SOLVED values
  landValueUFm2: number;
  totalLandCostUF: number;
  incidencia: number;              // land / totalRevenueNet

  // IRR/NPV
  tirMonthly: number;
  tirAnnual: number;
  tirAnnualLevered: number;
  vanUF: number;                   // at target discount rate

  // Project metrics
  paybackMonth: number;
  maxCapitalRequired: number;      // capital de trabajo activo puro: máxima exposición de caja (|mínimo del flujo acumulado|)
  maxCapitalRequiredExLand: number; // capital de trabajo activo puro excluyendo el desembolso del terreno
  // Capital de trabajo "efectivo" (capital propio): asume que el 80% de la obra se
  // financia con crédito constructor, por lo que solo el 20% sale de la caja propia.
  maxCapitalRequiredFinanced: number;        // capital propio efectivo (con terreno)
  maxCapitalRequiredExLandFinanced: number;  // capital propio efectivo sin terreno
  workingCapitalPeakMonth: number; // mes (índice) en que ocurre la máxima exposición de capital (activo puro)
  workingCapitalPeakMonthFinanced: number; // mes del pico del capital propio efectivo
  totalMonths: number;
  salesMonths: number;

  // Construction cost KPIs
  supConstruidaTotal: number;       // m² totales construidos (viv + subterráneo)
  supSubterraneoTotal: number;      // m² subterráneo
  costoConstruccionNetoUFm2: number; // UF/m² construido (TODO incluido excepto terreno)
  costoConstruccionDirectoUFm2: number; // UF/m² solo directo (input)

  // Dual-target solver diagnostics
  landByTIRUFm2: number;            // land que haría TIR = target
  landByMarginUFm2: number;         // land que haría margen = target
  bindingConstraint: 'TIR' | 'Margin'; // cuál de las dos fue binding (dio menor land)

  // Detailed outputs
  cashFlow: MonthlyCashFlowRow[];
  pnl: ProfitAndLoss;

  // Solver status
  converged: boolean;
  iterations: number;
}

// ── Defaults / presets ───────────────────────────────────────

export const DEFAULT_INPUTS: Omit<ResidualInputs, 'lotAreaM2' | 'lotFid' | 'productId' | 'unitModels' | 'totalUnits' | 'totalSupConstruidaM2' | 'totalSupVendibleM2'> = {
  salesVelocity: 4,
  prcOn: false,                   // default: SIN nuevo PRC (norma actual 150 viv/ha)
  commonAreaPct: 0.20,            // 20% áreas comunes → ratio 1.20× (equivalente a ~83% eficiencia)
  comercioOn: false,              // OFF por default; usuario lo activa si el proyecto incluye placas comerciales
  comercioM2: 350,                 // 350 m² default
  comercioPriceUFm2: 55,           // 55 UF/m² bruto
  comercioConstructionCostUFm2: 15, // 15 UF/m² directo
  subterraneoOn: false,   // OFF por default — usuario lo activa manualmente si aplica
  subterraneoPct: 1.0,            // 100% de estacionamientos van al subterráneo
  subterraneoAreaPerUnit: 30,     // m² por estacionamiento (gross, incluye muros/rampas)
  subterraneoCostUFm2: 10,         // costo directo bajo cota 0
  subterraneoConstructionMonths: 1, // 1 mes extra de gastos generales cuando subt ON
  subterraneoExcavationCostUFm2: 0.5, // mov. tierra = 0.5 UF/m² (solo excavación)
  constructionCostUFm2: 18.5,          // UF/m² construido (directo)
  urbanizationCostUFm2: 2.0,           // UF/m² terreno urbanizado
  earthMovementCostUFm2: 1.5,          // UF/m² terreno movido
  indirectCostsUFMonth: 2400,
  postVentaConstructionPct: 0.025,
  constructorUtilityPct: 0.065,
  contingenciesPct: 0.01,
  ivaRate: 0.19,
  escrituracionUFPerUnit: 12,
  salesCommissionPct: 0.012,             // 1.2% global para todos los productos
  marketingPct: 0.012,
  decoracionPilotoUF: 1000,
  stockMaintenanceUFPerUnit: 4,
  postVentaGavPct: 0.006,
  contribucionesViviendasUFPerUnit: 11.6,
  administracionGeneralFijoUF: 0,
  tarifaGestionInmobiliariaPct: 0.055,     // 5.5% sobre ventas brutas (default Chile)
  greenInsuranceUFPerUnit: 2.82,
  estudioArquitecturaUFm2: 0.42,
  estudioCalculoUFm2: 0.11,
  estudioMecanicaSuelosUFm2: 0.05,
  estudioSanitariosUFm2: 0.04,
  estudioElectricoUFm2: 0.04,
  estudioBasuraUFm2: 0.01,
  estudioImpactoVialUFm2: 0.01,
  estudioImpactoAmbientalUFm2: 0,
  estudioSenaleticaUFm2: 0.04,
  estudioOtrosGlobalUFm2: 0.05,
  estudiosAntesICUFm2: 0.5,
  studiesBeforeICPct: 0.5,
  permisoObraUFm2: 0.03,
  gastosRecepcionUFm2: 0.009,
  afrUFPerUnit: 5,                     // 5 UF/viv
  vialContributionUFPerUnit: 25,       // IMIV 25 UF/viv
  itoUFMonth: 60,                      // 60 UF/mes × plazo construcción
  monthLandPurchase: 0,
  monthPreSalesStart: 6,                    // default mes 6
  monthPermitObtained: 10,
  monthConstructionStart: 12,               // fallback (se sobrescribe si autoConstructionStart=true)
  autoConstructionStart: true,              // inicia obra al alcanzar 20% preventas
  preventasBeforeConstructionPct: 0.20,     // 20% pre-vendido
  constructionMonths: 15,
  monthsAfterConstructionToReception: 2,
  monthsAfterReceptionToEscrituracion: 0,
  stockAccelerationPct: 0.30,               // stock en pie +30% velocidad
  piePct: 0.15,
  pieMonths: 6,
  escrituracionCollectionPct: 0.85,
  escrituracionLagMonths: 2,      // 2 meses post-venta para trámite bancario
  solverMode: 'TIR',            // default: terreno como variable, TIR 10% fija, utility es RESULTADO
  targetTIRAnnual: 0.10,
  developerMarginPct: 0.10,     // solo referencia informativa (no driver)
  // Default: activo PURO (sin financiamiento). TIR refleja retorno sobre equity total.
  // Si se activa financing, la TIR levered se computa aparte (informativa).
  landFinancingPct: 0,
  constructionFinancingPct: 0,             // 0 = activo puro; 1.0 = 100% financiado
  interestRateAnnual: 0.045,
  numEtapas: 1,                            // default: una sola etapa (comportamiento clásico)
  etapaOverlapMonths: 4,                   // meses de traslape de obra entre etapas sucesivas
  plusvaliaAnualPct: 0,                    // default 0: sin plusvalía (comportamiento clásico)
  creditoEnlaceOn: false,                  // OFF por default; DS19 lo activa automáticamente
  creditoEnlaceUFPerUnit: 300,             // 300 UF/viv típico Chile DS19
  constructionAdvancePct: 0.20,            // 20% anticipo al contratista
  constructionRetencionPct: 0.05,          // 5% retención por SoP
  anticipoRecoveryFromSoPPct: 0.20,        // 20% del SoP descuenta anticipo (balance: anticipo=recuperación)
  incomeTaxRate: 0.27,
  landContributionsUF: 1033,
  landBrokerageUF: 0,
};
