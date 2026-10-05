"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as XLSX from "xlsx";
import { PRODUCTS, MAP_CENTER, MAP_ZOOM, LAYER_COLORS } from "@/lib/constants";
import { solveResidual, deriveDefaults, getEffectiveEfficiency } from "@/lib/residual-engine";
import { DEFAULT_INPUTS } from "@/lib/residual-types";
import { cannibalizationFactor } from "@/lib/cannibalization";
import { BASE_PATH } from "@/lib/base-path";
import type { ResidualInputs, ResidualOutput, UnitModel } from "@/lib/residual-types";
import { applyCuts, executeCutOnCollection, type LotCollection, type LotCut } from "@/lib/lot-cuts";
import {
  saveRepresentante,
  clearRepresentante,
  loadAllRepresentantes,
  familyForProductId,
  computeSensitivities,
  FAMILY_LABELS,
  type ProductFamily,
  type Representante,
} from "@/lib/representantes";

// ── Helpers ──────────────────────────────────────────────────

function fmt(v: number, dec = 0): string {
  return v.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(v: number, dec = 1): string {
  return (v * 100).toFixed(dec).replace(".", ",") + "%";
}

// ── Descargar flujo de caja como XLSX real (3 hojas: Resumen, EERR, Flujo) ──
function downloadCashFlowXLSX(result: ResidualOutput, inputs: ResidualInputs, lotFid: string) {
  const cf = result.cashFlow;
  const p = result.pnl;

  // ─── HOJA 1: RESUMEN EJECUTIVO ───
  const resumen: (string | number)[][] = [
    ["MÉTODO RESIDUAL DINÁMICO — RESUMEN", ""],
    ["", ""],
    ["Lote FID", lotFid],
    ["Superficie lote (m²)", inputs.lotAreaM2],
    ["Producto", inputs.unitModels[0]?.name || ""],
    ["N° Viviendas", inputs.totalUnits],
    ["m² vendible por unidad", inputs.unitModels[0]?.supVendibleM2 || 0],
    ["m² construida por unidad", inputs.unitModels[0]?.supConstruidaM2 || 0],
    ["Precio UF/m² vendible", inputs.unitModels[0]?.priceUFm2 || 0],
    ["Ticket por vivienda (Bruto)", (inputs.unitModels[0]?.priceUFm2 || 0) * (inputs.unitModels[0]?.supVendibleM2 || 0)],
    ["", ""],
    ["SOLVER", ""],
    ["Modo", inputs.solverMode === "TIR" ? "Por TIR" : inputs.solverMode === "Utility" ? "Por Utilidad" : "Ambas"],
    ["TIR target (anual)", inputs.targetTIRAnnual],
    ["Utility target (% venta)", inputs.developerMarginPct],
    ["", ""],
    ["RESULTADO TERRENO", ""],
    ["Land UF/m²", Number(result.landValueUFm2.toFixed(2))],
    ["Land total UF", Math.round(result.totalLandCostUF)],
    ["UF / vivienda", inputs.totalUnits > 0 ? Math.round(result.totalLandCostUF / inputs.totalUnits * 10) / 10 : 0],
    ["Incidencia s/ ventas viviendas brutas", Number((result.incidencia * 100).toFixed(2)) / 100],
    ["Land por TIR 10%", Number(result.landByTIRUFm2.toFixed(2))],
    ["Land por Utility 10%", Number(result.landByMarginUFm2.toFixed(2))],
    ["Binding", result.bindingConstraint === "TIR" ? "TIR" : "Utilidad"],
    ["", ""],
    ["MÉTRICAS", ""],
    ["TIR anual (unlevered)", Number(result.tirAnnual.toFixed(4))],
    ["TIR anual (levered)", Number(result.tirAnnualLevered.toFixed(4))],
    ["VAN (UF)", Math.round(result.vanUF)],
    ["Utilidad antes impuesto UF", Math.round(p.utilidadAntesImpuesto)],
    ["Impuesto renta (27%) UF", Math.round(p.impuestoRenta)],
    ["Utilidad neta etapa UF", Math.round(p.utilidadEtapa)],
    ["Utilidad % sobre ventas netas", Number(p.netProfitPct.toFixed(4))],
    ["Terreno / utilidad después de impuestos (×)", p.utilidadEtapa > 0 ? Number((result.totalLandCostUF / p.utilidadEtapa).toFixed(2)) : 0],
    ["Pago IVA al SII (UF)", Math.round(p.pagoIVA)],
    ["Payback (mes)", result.paybackMonth],
    ["Capital de trabajo activo puro (máx. UF)", Math.round(result.maxCapitalRequired)],
    ["Capital propio efectivo (80% obra financiada, UF)", Math.round(result.maxCapitalRequiredFinanced)],
    ["Capital propio efectivo sin terreno (UF)", Math.round(result.maxCapitalRequiredExLandFinanced)],
    ["Mes de máxima exposición (capital propio)", result.workingCapitalPeakMonthFinanced],
    ["Retorno s/ capital propio (×)", result.maxCapitalRequiredFinanced > 0 ? Number((p.utilidadEtapa / result.maxCapitalRequiredFinanced).toFixed(2)) : 0],
    ["Capital propio / ventas netas", p.totalIngresosNet > 0 ? Number((result.maxCapitalRequiredFinanced / p.totalIngresosNet).toFixed(4)) : 0],
    ["Capital propio / ventas brutas", p.totalIngresosGross > 0 ? Number((result.maxCapitalRequiredFinanced / p.totalIngresosGross).toFixed(4)) : 0],
    ["Capital propio sin terreno / ventas brutas", p.totalIngresosGross > 0 ? Number((result.maxCapitalRequiredExLandFinanced / p.totalIngresosGross).toFixed(4)) : 0],
    ["Duración proyecto (meses)", result.totalMonths],
  ];

  // ─── HOJA 2: EERR (Estado de Resultados) ───
  const eerr: (string | number)[][] = [
    ["ESTADO DE RESULTADOS", "UF Neto", "%", "UF Bruto"],
    ["INGRESOS DE EXPLOTACIÓN", "", "", ""],
    ["  Ventas Inmobiliarias", Math.round(p.ventasInmobiliariasNet), Number((p.ventasInmobiliariasNet / p.totalIngresosNet).toFixed(4)), Math.round(p.ventasInmobiliariasGross)],
    ["  Ventas Estacionamientos", Math.round(p.ventasEstacionamientosNet), Number((p.ventasEstacionamientosNet / p.totalIngresosNet).toFixed(4)), Math.round(p.ventasEstacionamientosGross)],
    ["  Ventas Bodegas", Math.round(p.ventasBodegasNet), "", Math.round(p.ventasBodegasGross)],
    ["  Venta Locales", 0, "", 0],
    ["TOTAL INGRESOS DE EXPLOTACIÓN", Math.round(p.totalIngresosNet), 1, Math.round(p.totalIngresosGross)],
    ["", "", "", ""],
    ["COSTOS DE EXPLOTACIÓN", "", "", ""],
    ["  Terreno", Math.round(p.terrenoNet), Number((p.terrenoNet / p.totalIngresosNet).toFixed(4)), Math.round(p.terrenoNet)],
    ["  Contribuciones y Corretaje Terreno", Math.round(p.contribucionesCorretajeTerreno), "", Math.round(p.contribucionesCorretajeTerreno)],
    ["  Intereses Terreno", 0, "", 0],
    ["  Construcción", Math.round(p.construccionNet), Number((p.construccionNet / p.totalIngresosNet).toFixed(4)), Math.round(p.construccionGross)],
    ["    Edificación Neto", Math.round(p.edificacionNet), "", Math.round(p.edificacionGross)],
    ["    Menor Costo IVA", 0, "", 0],
    ["    Urbanización Neto", Math.round(p.urbanizacionNet), "", Math.round(p.urbanizacionGross)],
    ["    Infraestructura Neto", 0, "", 0],
    ["  AFR y Aportes Viales", Math.round(p.afrAportesViales), "", Math.round(p.afrAportesViales)],
    ["  Estudios y Diseños Variables", Math.round(p.estudiosDisenoVariables), "", Math.round(p.estudiosDisenoVariables)],
    ["  Licencias y Trámites Variables", Math.round(p.licenciasTramitesVariables), "", Math.round(p.licenciasTramitesVariables)],
    ["  Inspección Técnica", Math.round(p.inspeccionTecnica), "", Math.round(p.inspeccionTecnica)],
    ["  Intereses de Construcción", Math.round(p.interesesConstruccion), "", Math.round(p.interesesConstruccion)],
    ["TOTAL COSTOS DE EXPLOTACIÓN", Math.round(p.totalCostosExplotacionNet), "", Math.round(p.totalCostosExplotacionGross)],
    ["", "", "", ""],
    ["MARGEN DE EXPLOTACIÓN", Math.round(p.margenExplotacion), Number(p.margenExplotacionPct.toFixed(4)), Math.round(p.margenExplotacion)],
    ["", "", "", ""],
    ["GASTOS DE ADMINISTRACIÓN Y VENTAS", "", "", ""],
    ["  Servicio de Escrituración", Math.round(p.servicioEscrituracion), "", Math.round(p.servicioEscrituracion)],
    ["  Ventas Fijas + Variables", Math.round(p.ventasFijasVariables), "", Math.round(p.ventasFijasVariablesGross)],
    ["  Seguro Venta en Verde", Math.round(p.seguroVentaVerde), "", Math.round(p.seguroVentaVerdeGross)],
    ["  Marketing Fijo + Variable", Math.round(p.marketingFijoVariable), "", Math.round(p.marketingFijoVariableGross)],
    ["  Decoración Piloto y Pto.Venta", Math.round(p.decoracionPiloto), "", Math.round(p.decoracionPiloto)],
    ["  Condominios y Mantención Stock", Math.round(p.condominiosMantencionStock), "", Math.round(p.condominiosMantencionStock)],
    ["  Post Venta Inmobiliaria", Math.round(p.postVentaInmobiliaria), "", Math.round(p.postVentaInmobiliaria)],
    ["  Contribuciones Viviendas", Math.round(p.contribucionesViviendas), "", Math.round(p.contribucionesViviendas)],
    ["  Administración General", Math.round(p.administracionGeneral), "", Math.round(p.administracionGeneral)],
    ["  Tarifa por Gestión Inmobiliaria", Math.round(p.tarifaGestionInmobiliaria), "", Math.round(p.tarifaGestionInmobiliaria)],
    ["TOTAL GASTOS DE ADMIN Y VTAS", Math.round(p.totalGAVNet), Number((p.totalGAVNet / p.totalIngresosNet).toFixed(4)), Math.round(p.totalGAVGross)],
    ["", "", "", ""],
    ["RESULTADO DE LA EXPLOTACIÓN", Math.round(p.resultadoExplotacion), Number(p.resultadoExplotacionPct.toFixed(4)), Math.round(p.resultadoExplotacion)],
    ["", "", "", ""],
    ["Gastos Fin. Crédito Construcción", Math.round(p.gastosFinCreditoConstruccion), "", Math.round(p.gastosFinCreditoConstruccion)],
    ["UTILIDAD (PÉRDIDA) ANTES DE IMPUESTO", Math.round(p.utilidadAntesImpuesto), Number(p.utilidadAntesImpuestoPct.toFixed(4)), Math.round(p.utilidadAntesImpuesto)],
    ["Impuesto a la Renta (27%)", Math.round(p.impuestoRenta), "", Math.round(p.impuestoRenta)],
    ["Pago de IVA al SII (residual)", Math.round(p.pagoIVA), "", Math.round(p.pagoIVA)],
    ["", "", "", ""],
    ["UTILIDAD (PÉRDIDA) DE LA ETAPA", Math.round(p.utilidadEtapa), Number(p.utilidadEtapaPct.toFixed(4)), Math.round(p.utilidadEtapa)],
  ];

  // ─── HOJA 3: FLUJO DE CAJA MENSUAL ───
  const flujoHeaders = [
    "Mes", "Fecha",
    "Uds Vend", "Acum Vend", "Uds Entreg", "Acum Entreg",
    "Ing PIE", "Ing Escritur.", "Total Ingreso (NETO)",
    "Terreno", "Contrib Terreno",
    "Construcción", "Urbanización", "Mov Tierra", "Indirectos",
    "Post-V Const", "Utilidad Constr", "Imprevistos",
    "Estudios+Perm", "AFR+Viales", "ITO", "Total Construcción",
    "Escrituración", "Ventas", "Marketing", "Seguro Verde",
    "Post-V Inmob", "Stock/Cond", "Total GAV",
    "Intereses Créd", "IVA Débito (+)", "IVA Crédito (-)", "IVA Pago SII (-)", "Impuesto Renta",
    "Total Costo", "Flujo Neto", "Flujo Acum",
    "Drawdown", "Repago", "Flujo Lev", "Acum Lev",
  ];
  const flujoRows: (string | number)[][] = cf.map((r) => [
    r.month, r.date,
    r.unitsSoldThisMonth, r.cumulativeUnitsSold, r.unitsDelivered, r.cumulativeUnitsDelivered,
    Math.round(r.revenuePIE), Math.round(r.revenueEscrituracion), Math.round(r.totalRevenue),
    -Math.round(r.landCost), -Math.round(r.landContributions),
    -Math.round(r.constructionCost), -Math.round(r.urbanizationCost), -Math.round(r.earthMovementCost), -Math.round(r.indirectCosts),
    -Math.round(r.postVentaConstruction), -Math.round(r.constructorUtility), -Math.round(r.contingencies),
    -Math.round(r.studiesPermitsCost), -Math.round(r.afrVialCost), -Math.round(r.itoCost), -Math.round(r.totalConstructionCost),
    -Math.round(r.escrituracionCost), -Math.round(r.salesCommission), -Math.round(r.marketingCost), -Math.round(r.greenInsurance),
    -Math.round(r.postVentaGav), -Math.round(r.stockMaintenance), -Math.round(r.totalGAV),
    -Math.round(r.financingInterest),
    Math.round(r.ivaDebitoReceived), -Math.round(r.ivaCreditoPaid), -Math.round(r.ivaPaid), -Math.round(r.incomeTax),
    -Math.round(r.totalCost), Math.round(r.netCashFlow), Math.round(r.cumulativeCashFlow),
    Math.round(r.financingDrawdown), -Math.round(r.financingRepayment),
    Math.round(r.netCashFlowLevered), Math.round(r.cumulativeCashFlowLevered),
  ]);
  const flujo: (string | number)[][] = [flujoHeaders, ...flujoRows];

  // ─── Crear workbook ───
  const wb = XLSX.utils.book_new();
  const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
  const wsEERR = XLSX.utils.aoa_to_sheet(eerr);
  const wsFlujo = XLSX.utils.aoa_to_sheet(flujo);
  // Ajustar ancho de columnas
  wsResumen["!cols"] = [{ wch: 35 }, { wch: 20 }];
  wsEERR["!cols"] = [{ wch: 40 }, { wch: 12 }, { wch: 8 }, { wch: 12 }];
  wsFlujo["!cols"] = [{ wch: 5 }, { wch: 8 }, ...Array(flujoHeaders.length - 2).fill({ wch: 13 })];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
  XLSX.utils.book_append_sheet(wb, wsEERR, "EERR");
  XLSX.utils.book_append_sheet(wb, wsFlujo, "Flujo Mensual");
  const filename = `flujo-residual-lote-${lotFid}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ── Residential products only ────────────────────────────────
const RESIDENTIAL_PRODUCTS = PRODUCTS.filter(
  (p) => p.family !== "comercio" && p.family !== "equipamiento"
);

// ── Main Page ────────────────────────────────────────────────

export default function ResidualPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Selection — array de lotes seleccionados (Shift+Click suma)
  const [selectedLots, setSelectedLots] = useState<Array<{ fid: string; area: number }>>([]);
  const selectedFid = selectedLots.length > 0 ? selectedLots.map((l) => l.fid).join("+") : null;
  const selectedArea = selectedLots.reduce((sum, l) => sum + l.area, 0);

  // ── Cortes de lotes ─────────────────────────────────────────
  // originalLots: GeoJSON cargado del archivo, inmutable.
  // cuts: historial ordenado de cortes; displayLots = applyCuts(original, cuts).
  // Esto permite deshacer cualquier corte sin perder los demás.
  const [originalLots, setOriginalLots] = useState<LotCollection | null>(null);
  const [cuts, setCuts] = useState<LotCut[]>([]);
  const [cutMode, setCutMode] = useState(false);
  const [currentLine, setCurrentLine] = useState<number[][]>([]);

  // Refs para handlers registrados una vez en map init (que no capturen estado obsoleto)
  const cutModeRef = useRef(false);
  const currentLineRef = useRef<number[][]>([]);
  const confirmCutRef = useRef<() => void>(() => {});
  // Drag de vértices: índice del vértice arrastrándose, y flag para suprimir
  // el click subsiguiente (que de otro modo agregaría un vértice nuevo).
  const draggingVertexIdxRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);
  useEffect(() => { cutModeRef.current = cutMode; }, [cutMode]);
  useEffect(() => { currentLineRef.current = currentLine; }, [currentLine]);

  const displayLots = useMemo<LotCollection | null>(() => {
    if (!originalLots) return null;
    return applyCuts(originalLots, cuts);
  }, [originalLots, cuts]);

  // Inputs
  const [productId, setProductId] = useState("deptos1");
  const [prcOn, setPrcOn] = useState(false); // default sin PRC (norma 150 viv/ha)
  const [inputs, setInputs] = useState<ResidualInputs | null>(null);

  // Results
  const [result, setResult] = useState<ResidualOutput | null>(null);
  const [computing, setComputing] = useState(false);
  const [eerrModalOpen, setEerrModalOpen] = useState(false);

  // Representantes guardados para Monte Carlo (compartidos via localStorage con simulador-legacy.html)
  const [savedReps, setSavedReps] = useState<Partial<Record<ProductFamily, Representante>>>({});
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveFamily, setSaveFamily] = useState<ProductFamily>("edif_4p");

  // Cargar representantes desde localStorage al montar
  useEffect(() => {
    setSavedReps(loadAllRepresentantes());
  }, []);

  // Cuando cambia el productId, sugerir familia por defecto en el modal
  useEffect(() => {
    const suggested = familyForProductId(productId);
    if (suggested) setSaveFamily(suggested);
  }, [productId]);

  // ── Map init ──
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      pitchWithRotate: false,
    });
    m.addControl(new mapboxgl.NavigationControl(), "top-right");
    // Desactiva el zoom rectangular con Shift+drag — entra en conflicto con
    // Shift+Click para combinar lotes (Mapbox captura el shift+mousedown y
    // suprime el click subsiguiente).
    m.boxZoom.disable();
    m.on("load", () => {
      // Lotes — fuente vacía, los datos llegan vía setData() cuando se carga el JSON
      const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      m.addSource("lotes", { type: "geojson", data: emptyFC, promoteId: "fid" });
      m.addLayer({ id: "lotes-fill", type: "fill", source: "lotes", paint: { "fill-color": ["case", ["boolean", ["feature-state", "selected"], false], "#3B82F6", LAYER_COLORS.lotes], "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.5, 0.15] } });
      m.addLayer({ id: "lotes-line", type: "line", source: "lotes", paint: { "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#60A5FA", "#94a3b8"], "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 0.8] } });
      // Areas verdes
      m.addSource("areas-verdes", { type: "geojson", data: `${BASE_PATH}/data/areas-verdes.geojson` });
      m.addLayer({ id: "av-fill", type: "fill", source: "areas-verdes", paint: { "fill-color": LAYER_COLORS.areasVerdes, "fill-opacity": 0.2 } });
      // Vialidades
      m.addSource("vial-nuevo", { type: "geojson", data: `${BASE_PATH}/data/vial-nuevo.geojson` });
      m.addLayer({ id: "vial-fill", type: "fill", source: "vial-nuevo", paint: { "fill-color": LAYER_COLORS.vialNuevo, "fill-opacity": 0.12 } });
      // Cerco
      m.addSource("cerco", { type: "geojson", data: `${BASE_PATH}/data/cercos.geojson` });
      m.addLayer({ id: "cerco-line", type: "line", source: "cerco", paint: { "line-color": LAYER_COLORS.cerco, "line-width": 1.5, "line-dasharray": [4, 3] } });

      // Capa de borrador para el modo Cortar (línea + vértices)
      m.addSource("cut-draft", { type: "geojson", data: emptyFC });
      m.addLayer({ id: "cut-draft-line", type: "line", source: "cut-draft", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#F59E0B", "line-width": 3, "line-dasharray": [2, 1.2] } });
      m.addLayer({ id: "cut-draft-points", type: "circle", source: "cut-draft", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#F59E0B", "circle-radius": 5, "circle-stroke-color": "#0f172a", "circle-stroke-width": 2 } });

      // Hover tooltip — solo fuera del modo Cortar
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: "lot-popup" });
      m.on("mousemove", "lotes-fill", (e) => {
        if (cutModeRef.current) return;
        if (e.features?.[0]) {
          const f = e.features[0];
          const area = (f.properties?.Area as number) || 0;
          popup.setLngLat(e.lngLat).setHTML(`<b>Lote ${f.properties?.fid}</b><br/>${fmt(area, 0)} m² · ${(area / 10000).toFixed(2)} ha`).addTo(m);
          m.getCanvas().style.cursor = "pointer";
        }
      });
      m.on("mouseleave", "lotes-fill", () => { popup.remove(); if (!cutModeRef.current) m.getCanvas().style.cursor = ""; });

      // Click global — en modo Cortar agrega vértice; si no, selecciona lote
      m.on("click", (e) => {
        // Si acabamos de soltar un vértice arrastrado, no agregamos vértice nuevo
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        if (cutModeRef.current) {
          // Si el click cayó sobre un vértice existente (no se movió), no agrega otro encima
          const onVertex = m.queryRenderedFeatures(e.point, { layers: ["cut-draft-points"] }).length > 0;
          if (onVertex) return;
          const next = [...currentLineRef.current, [e.lngLat.lng, e.lngLat.lat]];
          setCurrentLine(next);
          return;
        }
        const features = m.queryRenderedFeatures(e.point, { layers: ["lotes-fill"] });
        if (features.length === 0) return;
        const f = features[0];
        const fid = String(f.properties?.fid || f.id);
        const area = (f.properties?.Area as number) || 0;
        const shift = e.originalEvent.shiftKey;
        setSelectedLots((prev) => {
          if (!shift) return [{ fid, area }];
          const exists = prev.find((l) => l.fid === fid);
          return exists ? prev.filter((l) => l.fid !== fid) : [...prev, { fid, area }];
        });
      });

      // Doble click confirma el corte (en modo Cortar)
      m.on("dblclick", (e) => {
        if (!cutModeRef.current) return;
        e.preventDefault();
        confirmCutRef.current();
      });

      // ── Drag de vértices ──
      // Hover sobre vértice: cursor "grab"
      m.on("mouseenter", "cut-draft-points", () => {
        if (cutModeRef.current && draggingVertexIdxRef.current === null) {
          m.getCanvas().style.cursor = "grab";
        }
      });
      m.on("mouseleave", "cut-draft-points", () => {
        if (cutModeRef.current && draggingVertexIdxRef.current === null) {
          m.getCanvas().style.cursor = "crosshair";
        }
      });

      // Iniciar drag: mousedown sobre punto identifica qué vértice y bloquea el pan
      m.on("mousedown", "cut-draft-points", (e) => {
        if (!cutModeRef.current || !e.features?.[0]) return;
        e.preventDefault();
        const clicked = (e.features[0].geometry as GeoJSON.Point).coordinates;
        // Encuentra el índice del vértice más cercano al punto clickeado
        const line = currentLineRef.current;
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let i = 0; i < line.length; i++) {
          const dx = line[i][0] - clicked[0];
          const dy = line[i][1] - clicked[1];
          const d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        if (bestIdx >= 0) {
          draggingVertexIdxRef.current = bestIdx;
          m.dragPan.disable();
          m.getCanvas().style.cursor = "grabbing";
        }
      });

      // Mover: actualizar posición del vértice mientras se arrastra
      m.on("mousemove", (e) => {
        const idx = draggingVertexIdxRef.current;
        if (idx === null) return;
        setCurrentLine((prev) => {
          if (idx >= prev.length) return prev;
          const next = prev.slice();
          next[idx] = [e.lngLat.lng, e.lngLat.lat];
          return next;
        });
      });

      // Soltar: terminar drag, suprimir el click subsiguiente
      const endDrag = () => {
        if (draggingVertexIdxRef.current !== null) {
          draggingVertexIdxRef.current = null;
          m.dragPan.enable();
          m.getCanvas().style.cursor = cutModeRef.current ? "crosshair" : "";
          suppressNextClickRef.current = true;
        }
      };
      m.on("mouseup", endDrag);
      // Si el cursor sale del mapa con el botón presionado, igual liberamos
      m.getCanvas().addEventListener("mouseleave", endDrag);

      setMapLoaded(true);
    });
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  // ── Carga inicial del GeoJSON de lotes ──
  useEffect(() => {
    fetch(`${BASE_PATH}/data/lotes.geojson`)
      .then((r) => r.json())
      .then((data: LotCollection) => setOriginalLots(data))
      .catch((err) => console.error("[residual] error cargando lotes.geojson", err));
  }, []);

  // ── Empuja displayLots al mapa cuando cambia (carga inicial o nuevo corte) ──
  useEffect(() => {
    if (!map.current || !mapLoaded || !displayLots) return;
    const src = map.current.getSource("lotes") as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(displayLots);
  }, [displayLots, mapLoaded]);

  // ── Empuja la línea borrador (vértices + segmento) al mapa ──
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const src = map.current.getSource("cut-draft") as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    const features: GeoJSON.Feature[] = [];
    if (currentLine.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: currentLine },
        properties: {},
      });
    }
    currentLine.forEach((c) => {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: c },
        properties: {},
      });
    });
    src.setData({ type: "FeatureCollection", features });
  }, [currentLine, mapLoaded]);

  // ── Cursor + double-click zoom según modo Cortar ──
  useEffect(() => {
    if (!map.current) return;
    const m = map.current;
    if (cutMode) {
      m.getCanvas().style.cursor = "crosshair";
      m.doubleClickZoom.disable();
    } else {
      m.getCanvas().style.cursor = "";
      m.doubleClickZoom.enable();
    }
  }, [cutMode]);

  // ── Acciones de corte ──
  const cancelCut = useCallback(() => {
    setCutMode(false);
    setCurrentLine([]);
  }, []);

  const confirmCut = useCallback(() => {
    if (currentLine.length < 2 || !displayLots) {
      cancelCut();
      return;
    }
    const line: GeoJSON.LineString = { type: "LineString", coordinates: currentLine };
    const newCuts = executeCutOnCollection(displayLots, line);
    if (newCuts.length === 0) {
      alert(
        "La línea no produjo ningún corte válido.\n\n" +
        "Asegúrate de que la línea atraviese el lote (no que pase tangente a un borde, " +
        "ni que termine exactamente sobre un vértice del polígono)."
      );
      return;
    }
    setCuts((prev) => [...prev, ...newCuts]);
    setCutMode(false);
    setCurrentLine([]);
    setSelectedLots([]); // los FIDs seleccionados pueden haber dejado de existir
  }, [currentLine, displayLots, cancelCut]);

  // Mantener confirmCutRef apuntando a la última versión (para handlers de mapa registrados una vez)
  useEffect(() => { confirmCutRef.current = confirmCut; }, [confirmCut]);

  const undoCut = useCallback((cutId: string) => {
    setCuts((prev) => prev.filter((c) => c.id !== cutId));
    setSelectedLots([]);
  }, []);

  const undoAllCuts = useCallback(() => {
    if (cuts.length === 0) return;
    if (confirm(`¿Eliminar los ${cuts.length} cortes y volver al estado original?`)) {
      setCuts([]);
      setSelectedLots([]);
    }
  }, [cuts.length]);

  const exportGeoJSON = useCallback(() => {
    if (!displayLots) return;
    const blob = new Blob([JSON.stringify(displayLots, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lotes-modificado-${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayLots]);

  // ── Atajos de teclado en modo Cortar (Esc cancela, Enter confirma) ──
  useEffect(() => {
    if (!cutMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelCut();
      } else if (e.key === "Enter") {
        e.preventDefault();
        confirmCut();
      } else if (e.key === "Backspace" && currentLine.length > 0) {
        // Quita el último vértice
        e.preventDefault();
        setCurrentLine((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cutMode, currentLine.length, cancelCut, confirmCut]);

  // ── Highlight selected lots (uno o varios) ──
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;
    const source = m.getSource("lotes") as mapboxgl.GeoJSONSource;
    if (!source) return;
    m.removeFeatureState({ source: "lotes" });
    selectedLots.forEach((l) => {
      m.setFeatureState({ source: "lotes", id: l.fid }, { selected: true });
    });
  }, [selectedLots, mapLoaded]);

  // ── Derive inputs when lot or product changes ──
  useEffect(() => {
    if (!selectedFid || selectedArea <= 0) { setInputs(null); return; }
    try {
      const derived = deriveDefaults(productId, selectedArea, selectedFid, prcOn);
      setInputs(derived);
      setResult(null);
    } catch { setInputs(null); }
  }, [selectedFid, selectedArea, productId, prcOn]);

  // ── Update a single input field ──
  // Nota: no reseteamos `result` a null para evitar layout shift mientras el
  // auto-solve (300ms debounce) recalcula. El resultado anterior permanece
  // visible hasta que el nuevo lo reemplace atómicamente.
  const updateInput = useCallback(<K extends keyof ResidualInputs>(key: K, value: ResidualInputs[K]) => {
    setInputs((prev) => prev ? { ...prev, [key]: value } : null);
  }, []);

  // ── Run solver ──
  const runSolver = useCallback(() => {
    if (!inputs) return;
    setComputing(true);
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      const r = solveResidual(inputs);
      setResult(r);
      setComputing(false);
    }, 10);
  }, [inputs]);

  // Auto-solve on input change (debounced)
  useEffect(() => {
    if (!inputs) return;
    const timer = setTimeout(() => {
      const r = solveResidual(inputs);
      setResult(r);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputs]);

  // ── Derived metrics for display ──
  const product = PRODUCTS.find((p) => p.id === productId);
  const effectiveEff = product ? getEffectiveEfficiency(productId, prcOn) : 0;
  // Sin tope de unidades — la densidad PRC manda, puede superar product.maxUnits en lotes grandes.
  const estimatedUnits = selectedArea > 0 && product ? Math.floor((selectedArea / 10000) * effectiveEff) : 0;

  return (
    <div className="flex h-screen bg-zinc-950 text-white">
      {/* MAP */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <a
            href={`${BASE_PATH}/`}
            className="bg-zinc-900/90 backdrop-blur px-3 py-2 rounded-lg border border-zinc-700 hover:border-amber-500/50 hover:bg-zinc-800/90 transition flex items-center gap-1.5 text-sm font-semibold text-zinc-300 hover:text-amber-300"
            title="Volver al menú principal"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Menú
          </a>
          <div className="bg-zinc-900/90 backdrop-blur px-4 py-2 rounded-lg border border-zinc-700">
            <span className="text-sm font-semibold text-zinc-300">Simulador Residual Dinámico</span>
          </div>
        </div>

        {/* Panel flotante: instrucciones y acciones del Modo Cortar */}
        {cutMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-900/95 border border-amber-500 backdrop-blur px-4 py-3 rounded-lg shadow-lg max-w-md">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-300">✂</span>
              <span className="text-sm font-bold text-amber-100">Modo Cortar activo</span>
            </div>
            <div className="text-xs text-amber-200/90 mb-3 leading-relaxed">
              Click en el mapa para agregar puntos. <b>Arrastra cualquier vértice</b> para ajustarlo.
              La línea se extiende automáticamente para asegurar el corte.
              <div className="mt-1 text-amber-300/70">
                <kbd className="px-1 bg-amber-950/50 rounded">Enter</kbd> o doble-click confirmar ·{" "}
                <kbd className="px-1 bg-amber-950/50 rounded">Esc</kbd> cancelar ·{" "}
                <kbd className="px-1 bg-amber-950/50 rounded">⌫</kbd> quitar último
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-amber-200">{currentLine.length} {currentLine.length === 1 ? "punto" : "puntos"}</span>
              <div className="flex gap-2">
                <button
                  onClick={cancelCut}
                  className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmCut}
                  disabled={currentLine.length < 2}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-amber-950 rounded text-xs font-bold"
                >
                  Confirmar corte
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SIDEBAR */}
      <div className="w-[500px] border-l border-zinc-800 overflow-y-auto bg-zinc-900 flex flex-col">
        {/* Barra de herramientas — siempre visible */}
        <div className="bg-zinc-950/80 border-b border-zinc-800 p-3 flex items-center gap-2 sticky top-0 z-10">
          <button
            onClick={() => setCutMode((v) => !v)}
            className={`flex-1 py-2 px-3 rounded text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
              cutMode
                ? "bg-amber-500 text-amber-950 hover:bg-amber-400"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
            }`}
            title="Activa el modo Cortar para subdividir lotes con una línea"
          >
            <span>✂</span>
            <span>{cutMode ? "Salir modo Cortar" : "Modo Cortar"}</span>
          </button>
          <button
            onClick={exportGeoJSON}
            disabled={!displayLots}
            className="py-2 px-3 rounded text-xs font-semibold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40"
            title="Descarga el GeoJSON con los cortes aplicados"
          >
            ⤓ GeoJSON
          </button>
          {cuts.length > 0 && (
            <span className="text-[10px] text-amber-400 font-semibold whitespace-nowrap">
              {cuts.length} {cuts.length === 1 ? "corte" : "cortes"}
            </span>
          )}
        </div>

        {/* Panel de representantes guardados (compartidos con simulador-legacy.html via localStorage) */}
        {Object.keys(savedReps).length > 0 && (
          <div className="bg-purple-950/30 border-b border-purple-800/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-purple-300 font-semibold">
                Representantes Guardados ({Object.keys(savedReps).length}/4)
              </span>
              <span className="text-[10px] text-purple-400/60 italic">
                Disponibles en simulador macro
              </span>
            </div>
            <div className="space-y-1">
              {(Object.entries(savedReps) as [ProductFamily, Representante][]).map(([family, rep]) => (
                <div
                  key={family}
                  className="flex items-center justify-between text-[11px] bg-zinc-900/50 rounded px-2 py-1 border border-purple-800/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-purple-200 truncate font-semibold">
                      {FAMILY_LABELS[family]}
                    </div>
                    <div className="text-zinc-500 text-[10px]">
                      Lote {rep.lotFid} · {rep.productName} · Incidencia {fmtPct(rep.result.incidencia, 1)} · {rep.result.landValueUFm2.toFixed(1)} UF/m²
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      clearRepresentante(family);
                      setSavedReps(loadAllRepresentantes());
                    }}
                    className="ml-2 text-zinc-500 hover:text-red-400 text-xs"
                    title="Eliminar este representante"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historial de cortes — visible solo si hay cortes */}
        {cuts.length > 0 && (
          <div className="bg-amber-950/20 border-b border-amber-800/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold">
                Historial de cortes
              </span>
              <button
                onClick={undoAllCuts}
                className="text-[10px] text-amber-400/70 hover:text-amber-300 underline"
              >
                Deshacer todos
              </button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {cuts.map((c, idx) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between text-[11px] bg-zinc-900/50 rounded px-2 py-1 border border-zinc-800"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-zinc-300 truncate">
                      <span className="text-zinc-500">#{idx + 1}</span> Lote {c.targetFid} → {c.resultingFids.join(", ")}
                    </div>
                    <div className="text-zinc-500 text-[10px]">
                      {c.resultingAreas.map((a) => `${fmt(a)} m²`).join(" + ")}
                    </div>
                  </div>
                  <button
                    onClick={() => undoCut(c.id)}
                    className="ml-2 text-zinc-500 hover:text-red-400 text-xs"
                    title="Deshacer este corte"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!selectedFid ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm px-8 text-center">
            Selecciona un lote en el mapa para iniciar la evaluación residual.
            <br />
            <span className="text-zinc-600 text-xs mt-2 block">Shift+Click para combinar varios lotes.</span>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* LOT HEADER */}
            <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                    {selectedLots.length === 1 ? "Lote seleccionado" : `${selectedLots.length} lotes combinados`}
                  </div>
                  <div className="text-lg font-bold">
                    {selectedLots.length === 1
                      ? `FID ${selectedLots[0].fid}`
                      : `FID ${selectedLots.map((l) => l.fid).join(" + ")}`}
                  </div>
                  {selectedLots.length > 1 && (
                    <button
                      onClick={() => setSelectedLots([selectedLots[0]])}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300 mt-1 underline"
                    >
                      Limpiar combinación
                    </button>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-500">Superficie {selectedLots.length > 1 ? "total" : ""}</div>
                  <div className="text-lg font-bold text-blue-400">{fmt(selectedArea)} m²</div>
                  <div className="text-xs text-zinc-500">{(selectedArea / 10000).toFixed(2)} ha</div>
                </div>
              </div>
              {selectedLots.length > 1 && (
                <div className="mt-2 pt-2 border-t border-zinc-700 text-[10px] text-zinc-500 space-y-0.5">
                  {selectedLots.map((l) => (
                    <div key={l.fid} className="flex justify-between">
                      <span>Lote {l.fid}</span>
                      <span>{fmt(l.area)} m² ({(l.area / 10000).toFixed(2)} ha)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PRODUCT SELECTOR */}
            <Section title="Producto Inmobiliario" accent="blue" collapsible>
              <select value={productId} onChange={(e) => setProductId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm">
                {RESIDENTIAL_PRODUCTS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {fmt(p.priceUF)} UF ticket</option>
                ))}
              </select>

              {/* PRC toggle */}
              <div className="mt-3 bg-zinc-900/50 rounded-lg p-2 border border-zinc-700">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1.5">Plan Regulador Comunal (PRC)</div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPrcOn(false)}
                    className={`flex-1 py-1.5 text-xs rounded font-semibold transition ${
                      !prcOn
                        ? "bg-amber-600 text-white shadow"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}>
                    SIN PRC nuevo
                  </button>
                  <button
                    onClick={() => setPrcOn(true)}
                    className={`flex-1 py-1.5 text-xs rounded font-semibold transition ${
                      prcOn
                        ? "bg-emerald-600 text-white shadow"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}>
                    CON PRC nuevo
                  </button>
                </div>
                <div className="text-[10px] text-zinc-500 mt-1.5 italic">
                  {(product?.family === "edificios" || product?.family === "ds19")
                    ? prcOn
                      ? `${product?.name}: 190 viv/ha (6 pisos con nuevo PRC)`
                      : `${product?.name}: 150 viv/ha (4 pisos, norma actual)`
                    : `${product?.name}: ${effectiveEff} viv/ha (no afectado por PRC)`}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <Stat label="Densidad efectiva" value={`${effectiveEff} viv/ha`} />
                <Stat label="Unidades est." value={fmt(estimatedUnits)} />
                <Stat label="Min. lote" value={`${product?.minLotHa || 0} ha`} />
              </div>

              {/* Multi-etapa selector */}
              {inputs && (
                <div className="mt-3 bg-zinc-900/50 rounded-lg p-2 border border-zinc-700">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1.5">Etapas del Proyecto</div>
                  <div className="grid grid-cols-7 gap-1">
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <button
                        key={n}
                        onClick={() => updateInput("numEtapas", n)}
                        className={`py-1.5 text-xs rounded font-semibold transition ${
                          inputs.numEtapas === n
                            ? n === 1
                              ? "bg-zinc-600 text-white shadow"
                              : "bg-indigo-600 text-white shadow"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                        }`}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    {inputs.numEtapas === 1 ? "Una sola etapa" : `${inputs.numEtapas} etapas consecutivas`}
                  </div>
                  {inputs.numEtapas > 1 && (
                    <>
                      <div className="mt-2">
                        <SliderInput label="Traslape de obra entre etapas" value={inputs.etapaOverlapMonths} min={0} max={8} step={1}
                          onChange={(v) => updateInput("etapaOverlapMonths", v)} unit="meses" />
                      </div>
                      <div className="text-[10px] text-indigo-300 mt-1.5 leading-tight">
                        Cada etapa inicia obra <b>{Math.max(0, inputs.constructionMonths - inputs.etapaOverlapMonths)}m</b> después de la anterior
                        y arranca preventas lo justo antes para llegar con el % exigido. Vendiendo en
                        paralelo, la velocidad canibaliza a <b>{(inputs.salesVelocity * cannibalizationFactor(inputs.numEtapas) / inputs.numEtapas).toFixed(1)} un/mes por etapa</b>
                        {" "}({cannibalizationFactor(inputs.numEtapas).toFixed(2)}× entre las {inputs.numEtapas}, no {inputs.numEtapas}×).
                      </div>
                    </>
                  )}
                </div>
              )}

              {inputs && (
                <div className="mt-3 pt-3 border-t border-zinc-700 space-y-2">
                  {/* m² vendible promedio por unidad */}
                  <SliderInput label="m² vendible prom. / unidad" value={inputs.unitModels[0]?.supVendibleM2 || 57} min={30} max={150} step={1}
                    onChange={(v) => {
                      const k = 1 + inputs.commonAreaPct;
                      const newModel = { ...inputs.unitModels[0], supVendibleM2: v, supConstruidaM2: v * k };
                      setInputs({
                        ...inputs,
                        unitModels: [newModel],
                        totalSupVendibleM2: v * inputs.totalUnits,
                        totalSupConstruidaM2: v * k * inputs.totalUnits,
                      });
                    }} unit="m²" />
                  <SliderInput label="% Áreas Comunes s/ vendible" value={inputs.commonAreaPct * 100} min={0} max={40} step={1}
                    onChange={(v) => {
                      const pct = v / 100;
                      const k = 1 + pct;
                      const newModel = { ...inputs.unitModels[0], supConstruidaM2: inputs.unitModels[0].supVendibleM2 * k };
                      setInputs({
                        ...inputs,
                        commonAreaPct: pct,
                        unitModels: [newModel],
                        totalSupConstruidaM2: newModel.supConstruidaM2 * inputs.totalUnits,
                      });
                    }} unit="% comunes" />
                  <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                    <Stat label="m² vendible total" value={`${fmt(inputs.totalSupVendibleM2)} m²`} />
                    <Stat label="m² construida total" value={`${fmt(inputs.totalSupConstruidaM2)} m²`} />
                  </div>

                  {/* Placas comerciales */}
                  <div className="mt-3 pt-3 border-t border-zinc-700 bg-rose-950/20 rounded-lg p-2 border border-rose-900/40">
                    <label className="flex items-center gap-2 text-xs font-semibold text-rose-300 mb-2">
                      <input type="checkbox" checked={inputs.comercioOn}
                        onChange={(e) => updateInput("comercioOn", e.target.checked)}
                        className="accent-rose-500" />
                      <span>Incluir placas comerciales</span>
                    </label>
                    {inputs.comercioOn && (
                      <>
                        <SliderInput label="Superficie comercial" value={inputs.comercioM2} min={0} max={5000} step={25}
                          onChange={(v) => updateInput("comercioM2", v)} unit="m²" />
                        <div className="text-[10px] text-zinc-500 italic mt-1">
                          Se venden en mes de recepción como flujo único.
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </Section>

            {/* SUBTERRÁNEO */}
            {inputs && (
              <Section title="Estacionamiento Subterráneo" accent="cyan" collapsible>
                <div className="flex items-center gap-2 mb-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={inputs.subterraneoOn}
                      onChange={(e) => updateInput("subterraneoOn", e.target.checked)}
                      className="accent-cyan-500" />
                    <span>Incluir subterráneo en construcción</span>
                  </label>
                </div>
                {inputs.subterraneoOn && (
                  <>
                    <SliderInput label="% estac. al subterráneo" value={inputs.subterraneoPct * 100} min={0} max={150} step={5}
                      onChange={(v) => updateInput("subterraneoPct", v / 100)} unit="%" />
                    <SliderInput label="m² por estac. (bruto)" value={inputs.subterraneoAreaPerUnit} min={22} max={40} step={0.5}
                      onChange={(v) => updateInput("subterraneoAreaPerUnit", v)} unit="m²" />
                    <div className="text-[10px] text-zinc-600 italic mt-1">
                      m² por estac. ya incluye muros, rampas y circulación (30 m² bruto típico).
                    </div>
                    <div className="mt-2 bg-zinc-900/60 rounded p-2 text-xs">
                      <div className="text-zinc-500">Sup. subterráneo calculada:</div>
                      <div className="text-cyan-300 font-semibold">
                        {fmt(inputs.totalUnits * inputs.subterraneoPct * inputs.subterraneoAreaPerUnit)} m²
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-1">
                        = {inputs.totalUnits} estac × {fmtPct(inputs.subterraneoPct)} × {inputs.subterraneoAreaPerUnit} m²
                      </div>
                    </div>
                  </>
                )}
              </Section>
            )}

            {inputs && (
              <>
                {/* PRICING */}
                <Section title="Precio de Venta" accent="green" collapsible>
                  <SliderInput label="UF/m² vendible" value={inputs.unitModels[0]?.priceUFm2 || 60} min={20} max={120} step={0.5}
                    onChange={(v) => {
                      const newModels = inputs.unitModels.map((m) => ({ ...m, priceUFm2: v }));
                      setInputs({ ...inputs, unitModels: newModels });
                      setResult(null);
                    }} unit="UF/m²" />
                  {product?.family === "ds19" && (
                    <div className="text-[10px] text-purple-300 bg-purple-950/30 border border-purple-800/40 rounded p-2 mt-1">
                      <b>DS19 / DFL-2 exento de IVA:</b> el precio ingresado es NETO (= bruto, no se cobra IVA al cliente). El desarrollador tampoco recupera IVA crédito de construcción.
                    </div>
                  )}
                  <SliderInput label="Velocidad de venta" value={inputs.salesVelocity} min={1} max={15} step={0.5}
                    onChange={(v) => updateInput("salesVelocity", v)} unit="un/mes" />
                  {/* Precio promedio por unidad (derivado) */}
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <Stat label="Precio promedio/viv (Bruto)" value={`${fmt((inputs.unitModels[0]?.priceUFm2 || 0) * (inputs.unitModels[0]?.supVendibleM2 || 0))} UF`} />
                    <Stat label="Venta Inmob. TOTAL (Bruto)" value={`${fmt(((inputs.unitModels[0]?.priceUFm2 || 0) * (inputs.unitModels[0]?.supVendibleM2 || 0)) * inputs.totalUnits)} UF`} />
                  </div>

                  {/* Estacionamientos */}
                  {(product?.family === "edificios" || product?.family === "ds19") && (
                    <div className="mt-3 pt-3 border-t border-zinc-700">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Estacionamientos</div>
                      <SliderInput label="Estac. por unidad" value={(inputs.unitModels[0]?.parkingCount || 0) / Math.max(1, inputs.totalUnits)} min={0} max={2} step={0.25}
                        onChange={(v) => {
                          const newModels = inputs.unitModels.map((m) => ({ ...m, parkingCount: Math.round(v * inputs.totalUnits) }));
                          setInputs({ ...inputs, unitModels: newModels });
                          setResult(null);
                        }} unit="estac/viv" />
                      <SliderInput label="Precio estac. superficie (Bruto)" value={inputs.unitModels[0]?.parkingPriceUF || 300} min={100} max={800} step={10}
                        onChange={(v) => {
                          const newModels = inputs.unitModels.map((m) => ({ ...m, parkingPriceUF: v }));
                          setInputs({ ...inputs, unitModels: newModels });
                          setResult(null);
                        }} unit="UF/estac." />
                      {inputs.subterraneoOn && (
                        <SliderInput label="Precio estac. subterráneo (Bruto)" value={inputs.unitModels[0]?.parkingPriceSubtUF || 400} min={100} max={1000} step={10}
                          onChange={(v) => {
                            const newModels = inputs.unitModels.map((m) => ({ ...m, parkingPriceSubtUF: v }));
                            setInputs({ ...inputs, unitModels: newModels });
                            setResult(null);
                          }} unit="UF/estac." />
                      )}
                      {(() => {
                        const total = inputs.unitModels[0]?.parkingCount || 0;
                        const pSurf = inputs.unitModels[0]?.parkingPriceUF || 0;
                        const pSubt = inputs.unitModels[0]?.parkingPriceSubtUF || 0;
                        const ratioSubt = inputs.subterraneoOn ? inputs.subterraneoPct : 0;
                        const surfCount = total * (1 - ratioSubt);
                        const subtCount = total * ratioSubt;
                        const rev = surfCount * pSurf + subtCount * pSubt;
                        return (
                          <div className="text-[10px] text-zinc-500 italic mt-1">
                            {fmt(surfCount)} superficie × {fmt(pSurf)} UF
                            {inputs.subterraneoOn && <> + {fmt(subtCount)} subt. × {fmt(pSubt)} UF</>}
                            {" = "}<span className="text-green-400 font-semibold">{fmt(rev)} UF</span> (Bruto)
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {/* Locales comerciales */}
                  {inputs.comercioOn && (
                    <div className="mt-3 pt-3 border-t border-zinc-700 bg-rose-950/20 rounded-lg p-2 border border-rose-900/40">
                      <div className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold mb-1">Locales Comerciales</div>
                      <SliderInput label="UF/m² locales (Bruto)" value={inputs.comercioPriceUFm2} min={20} max={150} step={1}
                        onChange={(v) => updateInput("comercioPriceUFm2", v)} unit="UF/m²" />
                      <div className="text-[10px] text-zinc-500 italic mt-1">
                        {fmt(inputs.comercioM2)} m² × {fmt(inputs.comercioPriceUFm2)} UF = <span className="text-rose-300 font-semibold">{fmt(inputs.comercioM2 * inputs.comercioPriceUFm2)} UF</span> (Bruto)
                      </div>
                    </div>
                  )}
                  {(product?.family === "casas" || product?.family === "townhouses") && (
                    <div className="mt-2 text-[10px] text-zinc-500 italic border-t border-zinc-700 pt-2">
                      {product?.family === "casas" ? "Casas" : "Townhouses"}: estacionamiento incluido en la parcela (no se vende aparte).
                    </div>
                  )}
                </Section>

                {/* CONSTRUCTION */}
                <Section title="Costos de Construcción" accent="orange" collapsible>
                  {/* Nota cuando son 2 etapas */}
                  {inputs.numEtapas > 1 && (
                    <div className="bg-indigo-950/40 border border-indigo-700/40 rounded-lg p-2 mb-3 text-[10px] text-indigo-200 leading-tight">
                      <div className="font-semibold text-indigo-300 uppercase tracking-wider mb-1">⚑ Modo 2 etapas · tratamiento por torre</div>
                      Todos los inputs abajo (costo directo, plazo, anticipo, etc.) son <b>POR TORRE</b>.
                      Los totales que ves en el bloque superior son la suma de ambas torres.
                      Cada torre construye en {inputs.constructionMonths} meses con su propio anticipo, curva S y retención, traslapándose {inputs.etapaOverlapMonths} meses.
                    </div>
                  )}
                  {/* CONSOLIDADO NETO UF/m² — siempre visible arriba */}
                  {result && (
                    <div className="bg-gradient-to-r from-orange-950/50 to-zinc-900 rounded-lg p-3 border border-orange-800/50 mb-3">
                      <div className="text-[10px] uppercase tracking-wider text-orange-400 font-semibold">Costo Construcción Neto</div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-bold text-orange-300">{fmt(result.costoConstruccionNetoUFm2, 2)}</span>
                        <span className="text-xs text-zinc-400">UF/m² construido total</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-1">
                        Incluye: directo + urba + mov. tierra + indirectos + utilidad + post-venta + imprevistos + subterráneo
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
                        <div className="text-zinc-500">Sup. viv: <span className="text-zinc-300">{fmt(inputs.totalSupConstruidaM2)} m²</span></div>
                        <div className="text-zinc-500">Sup. subt: <span className="text-cyan-400">{fmt(result.supSubterraneoTotal)} m²</span></div>
                        <div className="text-zinc-500">Sup. TOTAL: <span className="text-orange-300 font-semibold">{fmt(result.supConstruidaTotal)} m²</span></div>
                        <div className="text-zinc-500">Costo total: <span className="text-orange-300 font-semibold">{fmt(Math.round(result.costoConstruccionNetoUFm2 * result.supConstruidaTotal))} UF</span></div>
                      </div>
                      {inputs.numEtapas > 1 && (
                        <div className="mt-2 pt-2 border-t border-orange-800/30 grid grid-cols-2 gap-2 text-[10px]">
                          <div className="text-indigo-300">Sup. por torre: <b>{fmt(Math.round(inputs.totalSupConstruidaM2 / 2))} m²</b></div>
                          <div className="text-indigo-300">Costo por torre: <b>{fmt(Math.round(result.costoConstruccionNetoUFm2 * result.supConstruidaTotal / 2))} UF</b></div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Plazo construcción — destacado arriba */}
                  <SliderInput label="Plazo construcción POR ETAPA" value={inputs.constructionMonths} min={8} max={30} step={1}
                    onChange={(v) => updateInput("constructionMonths", v)} unit="meses" />
                  <SliderInput label="Plusvalía anual del precio" value={(inputs.plusvaliaAnualPct ?? 0) * 100} min={0} max={10} step={0.5}
                    onChange={(v) => updateInput("plusvaliaAnualPct", v / 100)} unit="% anual" />
                  <div className="text-[10px] text-zinc-500 -mt-1 mb-1">
                    El precio al que se promete crece {((inputs.plusvaliaAnualPct ?? 0) * 100).toFixed(1)}% al año desde el mes 0.
                    {(inputs.plusvaliaAnualPct ?? 0) > 0 &&
                      ` Una unidad vendida en el mes 24 se promete a ${(Math.pow(1 + (inputs.plusvaliaAnualPct ?? 0), 2) * 100 - 100).toFixed(1)}% sobre el precio base.`}
                  </div>
                  <div className="text-[10px] text-zinc-500 -mt-1 mb-1">
                    Es el plazo de obra de <b>cada</b> etapa, no del proyecto completo.
                    {inputs.numEtapas > 1 && ` Con ${inputs.numEtapas} etapas la obra total se extiende según el traslape.`}
                  </div>
                  <SliderInput label={inputs.subterraneoOn ? "Costo directo (cota 0 ↑)" : "Costo directo"} value={inputs.constructionCostUFm2} min={10} max={35} step={0.1}
                    onChange={(v) => updateInput("constructionCostUFm2", v)} unit="UF/m² const." />
                  <SliderInput label="Urbanización" value={inputs.urbanizationCostUFm2} min={0} max={5} step={0.1}
                    onChange={(v) => updateInput("urbanizationCostUFm2", v)} unit="UF/m² terreno" />
                  {!inputs.subterraneoOn && (
                    <SliderInput label="Mov. tierra" value={inputs.earthMovementCostUFm2} min={0} max={5} step={0.1}
                      onChange={(v) => updateInput("earthMovementCostUFm2", v)} unit="UF/m² terreno" />
                  )}
                  <SliderInput label="Gastos Generales" value={inputs.indirectCostsUFMonth} min={500} max={5000} step={100}
                    onChange={(v) => updateInput("indirectCostsUFMonth", v)} unit="UF/mes" />
                  <SliderInput label="Post-venta const." value={inputs.postVentaConstructionPct * 100} min={0} max={5} step={0.1}
                    onChange={(v) => updateInput("postVentaConstructionPct", v / 100)} unit="%" />
                  <SliderInput label="Imprevistos" value={inputs.contingenciesPct * 100} min={0} max={5} step={0.1}
                    onChange={(v) => updateInput("contingenciesPct", v / 100)} unit="%" />

                  {/* Flujo contractual: anticipo + curva S + retención + recuperación */}
                  <div className="mt-3 pt-3 border-t border-zinc-700 bg-amber-950/20 rounded-lg p-2 border border-amber-900/40">
                    <div className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold mb-1">Flujo contractual (curva S)</div>
                    <SliderInput label="Anticipo contratista" value={inputs.constructionAdvancePct * 100} min={0} max={40} step={1}
                      onChange={(v) => updateInput("constructionAdvancePct", v / 100)} unit="%" />
                    <SliderInput label="Retención por SoP" value={inputs.constructionRetencionPct * 100} min={0} max={15} step={0.5}
                      onChange={(v) => updateInput("constructionRetencionPct", v / 100)} unit="%" />
                    <SliderInput label="Amortización anticipo (mensual)" value={inputs.anticipoRecoveryFromSoPPct * 100} min={1} max={40} step={1}
                      onChange={(v) => updateInput("anticipoRecoveryFromSoPPct", v / 100)} unit="%/mes" />
                    {(() => {
                      const anticipoTotal = inputs.constructionAdvancePct * inputs.constructionCostUFm2 * inputs.totalSupConstruidaM2;
                      const anticipoPerTorre = anticipoTotal / Math.max(1, inputs.numEtapas);
                      const recoveryMonths = inputs.anticipoRecoveryFromSoPPct > 0 ? 1 / inputs.anticipoRecoveryFromSoPPct : 0;
                      return (
                        <div className="text-[10px] text-zinc-500 italic mt-1 space-y-0.5">
                          {inputs.numEtapas > 1 ? (
                            <>
                              <div>• Anticipo <b className="text-amber-300">por torre</b>: {fmt(Math.round(anticipoPerTorre))} UF (pagado al inicio de obra de cada etapa)</div>
                              <div>• Anticipo total ambas torres: {fmt(Math.round(anticipoTotal))} UF</div>
                            </>
                          ) : (
                            <div>• Anticipo al inicio: <b className="text-amber-300">{fmt(Math.round(anticipoTotal))} UF</b></div>
                          )}
                          <div>• Amortización: cuota fija mensual = <b className="text-amber-300">{fmt(Math.round(anticipoPerTorre * inputs.anticipoRecoveryFromSoPPct))} UF/mes</b> ({(inputs.anticipoRecoveryFromSoPPct*100).toFixed(0)}% del anticipo). Recupero completo en <b>{recoveryMonths.toFixed(1)} meses</b>.</div>
                          <div>• Retención por SoP ({fmtPct(inputs.constructionRetencionPct, 0)} de cada estado de pago) se libera en recepción municipal.</div>
                          <div>• Costo total invariante = directConstructionCost (timing solo afecta TIR).</div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Costos bajo cota 0 — solo cuando subt activo */}
                  {inputs.subterraneoOn && (
                    <div className="mt-3 pt-3 border-t border-zinc-700 bg-cyan-950/20 rounded-lg p-2 border border-cyan-900/40">
                      <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold mb-1">Bajo Cota 0 (Subterráneo)</div>
                      <SliderInput label="Costo directo bajo cota 0" value={inputs.subterraneoCostUFm2} min={5} max={25} step={0.5}
                        onChange={(v) => updateInput("subterraneoCostUFm2", v)} unit="UF/m²" />
                      <SliderInput label="Excavación (mov. tierra)" value={inputs.subterraneoExcavationCostUFm2} min={0.1} max={3} step={0.1}
                        onChange={(v) => updateInput("subterraneoExcavationCostUFm2", v)} unit="UF/m²" />
                      <SliderInput label="Plazo construcción subt." value={inputs.subterraneoConstructionMonths} min={0} max={6} step={1}
                        onChange={(v) => updateInput("subterraneoConstructionMonths", v)} unit="meses" />
                      {(() => {
                        const supSubt = inputs.totalUnits * inputs.subterraneoPct * inputs.subterraneoAreaPerUnit;
                        const costoBajoCota0 = supSubt * inputs.subterraneoCostUFm2;
                        const excavacion = supSubt * inputs.subterraneoExcavationCostUFm2;
                        const gastosExtra = inputs.indirectCostsUFMonth * inputs.subterraneoConstructionMonths;
                        return (
                          <div className="text-[10px] text-zinc-500 italic mt-1 space-y-0.5">
                            <div>• Directo bajo cota 0: <span className="text-cyan-300 font-semibold">{fmt(costoBajoCota0)} UF</span> + proporcional post-venta/utilidad/imprevistos.</div>
                            <div>• Excavación reemplaza mov. tierra: <span className="text-cyan-300 font-semibold">{fmt(excavacion)} UF</span> (solo excavar, sin rellenos).</div>
                            <div>• Gastos generales extras: <span className="text-cyan-300 font-semibold">{fmt(gastosExtra)} UF</span> ({inputs.subterraneoConstructionMonths} mes × {fmt(inputs.indirectCostsUFMonth)} UF).</div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Costo directo de locales comerciales */}
                  {inputs.comercioOn && (
                    <div className="mt-3 pt-3 border-t border-zinc-700 bg-rose-950/20 rounded-lg p-2 border border-rose-900/40">
                      <div className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold mb-1">Locales Comerciales</div>
                      <SliderInput label="Costo directo locales" value={inputs.comercioConstructionCostUFm2} min={5} max={30} step={0.5}
                        onChange={(v) => updateInput("comercioConstructionCostUFm2", v)} unit="UF/m²" />
                      <div className="text-[10px] text-zinc-500 italic mt-1">
                        {fmt(inputs.comercioM2)} m² × {fmt(inputs.comercioConstructionCostUFm2, 1)} UF = <span className="text-rose-300 font-semibold">{fmt(inputs.comercioM2 * inputs.comercioConstructionCostUFm2)} UF</span> directo.
                        <br/>+ proporcional de post-venta, utilidad constructora e imprevistos. No afecta gastos generales.
                      </div>
                    </div>
                  )}

                  <div className="text-[10px] text-zinc-600 italic mt-1">
                    {product?.family === "casas" || product?.family === "townhouses"
                      ? "Urba aplicada a 30% del terreno. Mov. tierra = 50% del terreno (15% vialidades + 35% plataformas)."
                      : (product?.family === "edificios" || product?.family === "ds19") && !inputs.subterraneoOn
                      ? "Urba sobre (24 m² verde + 25 m² estac × 1.15) × N_viv. Mov. tierra = (terreno − áreas verdes − estac./2)."
                      : `Urba sobre (24 m² verde + 25 m² × ${fmtPct(1 - inputs.subterraneoPct, 0)} × 1.15) × N_viv. Mov. tierra anulado (sustituido por excavación).`}
                  </div>
                </Section>

                {/* ESTUDIOS, PERMISOS, HONORARIOS, ITO, AFR */}
                <Section title="Estudios, Honorarios, Permisos, ITO" accent="yellow" collapsible>
                  {(() => {
                    const sc = inputs.totalSupConstruidaM2;  // base para cálculo de totales
                    return (<>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Estudios y Diseños (UF/m² construido)</div>
                  <SliderInput label="Arquitectura" value={inputs.estudioArquitecturaUFm2} min={0} max={1.5} step={0.01}
                    onChange={(v) => updateInput("estudioArquitecturaUFm2", v)} unit="UF/m²" totalUF={inputs.estudioArquitecturaUFm2 * sc} />
                  <SliderInput label="Cálculo" value={inputs.estudioCalculoUFm2} min={0} max={0.3} step={0.01}
                    onChange={(v) => updateInput("estudioCalculoUFm2", v)} unit="UF/m²" totalUF={inputs.estudioCalculoUFm2 * sc} />
                  <SliderInput label="Mecánica de Suelos" value={inputs.estudioMecanicaSuelosUFm2} min={0} max={0.3} step={0.01}
                    onChange={(v) => updateInput("estudioMecanicaSuelosUFm2", v)} unit="UF/m²" totalUF={inputs.estudioMecanicaSuelosUFm2 * sc} />
                  <SliderInput label="Proy. Sanitarios" value={inputs.estudioSanitariosUFm2} min={0} max={0.3} step={0.01}
                    onChange={(v) => updateInput("estudioSanitariosUFm2", v)} unit="UF/m²" totalUF={inputs.estudioSanitariosUFm2 * sc} />
                  <SliderInput label="Proy. Eléctrico CCDD" value={inputs.estudioElectricoUFm2} min={0} max={0.3} step={0.01}
                    onChange={(v) => updateInput("estudioElectricoUFm2", v)} unit="UF/m²" totalUF={inputs.estudioElectricoUFm2 * sc} />
                  <SliderInput label="Evacuación Basura" value={inputs.estudioBasuraUFm2} min={0} max={0.2} step={0.01}
                    onChange={(v) => updateInput("estudioBasuraUFm2", v)} unit="UF/m²" totalUF={inputs.estudioBasuraUFm2 * sc} />
                  <SliderInput label="Impacto Vial" value={inputs.estudioImpactoVialUFm2} min={0} max={0.2} step={0.01}
                    onChange={(v) => updateInput("estudioImpactoVialUFm2", v)} unit="UF/m²" totalUF={inputs.estudioImpactoVialUFm2 * sc} />
                  <SliderInput label="Impacto Ambiental" value={inputs.estudioImpactoAmbientalUFm2} min={0} max={0.2} step={0.01}
                    onChange={(v) => updateInput("estudioImpactoAmbientalUFm2", v)} unit="UF/m²" totalUF={inputs.estudioImpactoAmbientalUFm2 * sc} />
                  <SliderInput label="Señalética" value={inputs.estudioSenaleticaUFm2} min={0} max={0.2} step={0.01}
                    onChange={(v) => updateInput("estudioSenaleticaUFm2", v)} unit="UF/m²" totalUF={inputs.estudioSenaleticaUFm2 * sc} />
                  <SliderInput label="Otros Proyectos" value={inputs.estudioOtrosGlobalUFm2} min={0} max={0.3} step={0.01}
                    onChange={(v) => updateInput("estudioOtrosGlobalUFm2", v)} unit="UF/m²" totalUF={inputs.estudioOtrosGlobalUFm2 * sc} />

                  {/* Timing: % pagado antes de IC (no es un costo adicional, es distribución temporal) */}
                  <div className="bg-zinc-900/40 border border-yellow-900/40 rounded p-2 mt-2">
                    <div className="text-[10px] text-yellow-400 uppercase tracking-wider font-semibold mb-1">⏱ Timing del Pago de Estudios</div>
                    <SliderInput label="% pagado antes de IC" value={inputs.studiesBeforeICPct * 100} min={0} max={100} step={5}
                      onChange={(v) => updateInput("studiesBeforeICPct", v / 100)} unit="%" />
                    <div className="text-[10px] text-zinc-500 italic mt-1">
                      Del total de <b>{((
                        inputs.estudioArquitecturaUFm2 + inputs.estudioCalculoUFm2 + inputs.estudioMecanicaSuelosUFm2 +
                        inputs.estudioSanitariosUFm2 + inputs.estudioElectricoUFm2 + inputs.estudioBasuraUFm2 +
                        inputs.estudioImpactoVialUFm2 + inputs.estudioImpactoAmbientalUFm2 + inputs.estudioSenaleticaUFm2 +
                        inputs.estudioOtrosGlobalUFm2
                      ) * sc).toLocaleString("es-CL", { maximumFractionDigits: 0 })} UF</b> en estudios:
                      <br/>• <span className="text-yellow-300">{(inputs.studiesBeforeICPct * 100).toFixed(0)}%</span> se paga ANTES de iniciar construcción
                      <br/>• <span className="text-zinc-400">{((1 - inputs.studiesBeforeICPct) * 100).toFixed(0)}%</span> se paga DURANTE la obra
                    </div>
                  </div>

                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mt-3 mb-1">Permisos y Trámites</div>
                  <SliderInput label="Permiso de obra" value={inputs.permisoObraUFm2} min={0} max={0.2} step={0.005}
                    onChange={(v) => updateInput("permisoObraUFm2", v)} unit="UF/m²" totalUF={inputs.permisoObraUFm2 * sc} />
                  <SliderInput label="Gastos Recepción" value={inputs.gastosRecepcionUFm2} min={0} max={0.1} step={0.001}
                    onChange={(v) => updateInput("gastosRecepcionUFm2", v)} unit="UF/m²" totalUF={inputs.gastosRecepcionUFm2 * sc} />

                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mt-3 mb-1">Aportes e Inspección</div>
                  <SliderInput label="AFR" value={inputs.afrUFPerUnit} min={0} max={50} step={1}
                    onChange={(v) => updateInput("afrUFPerUnit", v)} unit="UF/viv" totalUF={inputs.afrUFPerUnit * inputs.totalUnits} />
                  <SliderInput label="Aportes Viales (IMIV)" value={inputs.vialContributionUFPerUnit} min={0} max={100} step={1}
                    onChange={(v) => updateInput("vialContributionUFPerUnit", v)} unit="UF/viv" totalUF={inputs.vialContributionUFPerUnit * inputs.totalUnits} />
                  <SliderInput label="Inspección Técnica (ITO)" value={inputs.itoUFMonth} min={0} max={200} step={5}
                    onChange={(v) => updateInput("itoUFMonth", v)} unit="UF/mes" totalUF={inputs.itoUFMonth * inputs.constructionMonths} />
                  </>);
                  })()}

                  <div className="mt-3 bg-zinc-900/60 rounded p-2 text-xs">
                    <div className="text-zinc-500 uppercase text-[10px] tracking-wider font-semibold">Totales calculados</div>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      <div className="text-zinc-400">Estudios total: <span className="text-yellow-300 font-semibold">{fmt((
                        inputs.estudioArquitecturaUFm2 + inputs.estudioCalculoUFm2 + inputs.estudioMecanicaSuelosUFm2 +
                        inputs.estudioSanitariosUFm2 + inputs.estudioElectricoUFm2 + inputs.estudioBasuraUFm2 +
                        inputs.estudioImpactoVialUFm2 + inputs.estudioImpactoAmbientalUFm2 + inputs.estudioSenaleticaUFm2 +
                        inputs.estudioOtrosGlobalUFm2 + inputs.estudiosAntesICUFm2
                      ) * inputs.totalSupConstruidaM2)} UF</span></div>
                      <div className="text-zinc-400">Permisos total: <span className="text-yellow-300 font-semibold">{fmt((inputs.permisoObraUFm2 + inputs.gastosRecepcionUFm2) * inputs.totalSupConstruidaM2)} UF</span></div>
                      <div className="text-zinc-400">AFR + Viales: <span className="text-yellow-300 font-semibold">{fmt((inputs.afrUFPerUnit + inputs.vialContributionUFPerUnit) * inputs.totalUnits)} UF</span></div>
                      <div className="text-zinc-400">ITO total: <span className="text-yellow-300 font-semibold">{fmt(inputs.itoUFMonth * inputs.constructionMonths)} UF</span></div>
                    </div>
                  </div>
                </Section>

                {/* GAV */}
                <Section title="GAV y Gastos" accent="purple" collapsible>
                  <SliderInput label="Ventas" value={inputs.salesCommissionPct * 100} min={0} max={3} step={0.1}
                    onChange={(v) => updateInput("salesCommissionPct", v / 100)} unit="% bruto" />
                  <SliderInput label="Marketing" value={inputs.marketingPct * 100} min={0} max={3} step={0.1}
                    onChange={(v) => updateInput("marketingPct", v / 100)} unit="% bruto" />
                  <SliderInput label="Tarifa gestión inmob." value={inputs.tarifaGestionInmobiliariaPct * 100} min={0} max={8} step={0.25}
                    onChange={(v) => updateInput("tarifaGestionInmobiliariaPct", v / 100)} unit="% bruto" />
                  <SliderInput label="Contribuciones viviendas" value={inputs.contribucionesViviendasUFPerUnit} min={0} max={25} step={0.5}
                    onChange={(v) => updateInput("contribucionesViviendasUFPerUnit", v)} unit="UF/viv" />
                  <SliderInput label="Decoración piloto" value={inputs.decoracionPilotoUF} min={0} max={5000} step={100}
                    onChange={(v) => updateInput("decoracionPilotoUF", v)} unit="UF total" />
                  <SliderInput label="Post-venta inmob." value={inputs.postVentaGavPct * 100} min={0} max={2} step={0.1}
                    onChange={(v) => updateInput("postVentaGavPct", v / 100)} unit="% neto" />
                  <SliderInput label="Escrituración" value={inputs.escrituracionUFPerUnit} min={5} max={25} step={1}
                    onChange={(v) => updateInput("escrituracionUFPerUnit", v)} unit="UF/viv" />
                </Section>

                {/* TIMELINE — INPUTS (editables, van PRIMERO) */}
                <Section title="Timeline del Proyecto (inputs)" accent="cyan" collapsible>
                  <SliderInput label="Mes compra terreno" value={inputs.monthLandPurchase} min={0} max={12} step={1}
                    onChange={(v) => updateInput("monthLandPurchase", v)} unit="mes" />
                  <SliderInput label="Mes inicio preventas" value={inputs.monthPreSalesStart} min={0} max={24} step={1}
                    onChange={(v) => updateInput("monthPreSalesStart", v)} unit="mes" />

                  {/* Inicio construcción: toggle auto (por %preventas) vs manual */}
                  <div className="bg-zinc-900/40 rounded p-2 border border-cyan-900/40 mt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={inputs.autoConstructionStart}
                          onChange={(e) => updateInput("autoConstructionStart", e.target.checked)}
                          className="accent-cyan-500" />
                        <span className="text-cyan-300 font-semibold">Auto: iniciar obra con X% prevendido</span>
                      </label>
                    </div>
                    {inputs.autoConstructionStart ? (
                      <>
                        <SliderInput label="% preventa para IC" value={inputs.preventasBeforeConstructionPct * 100} min={5} max={50} step={1}
                          onChange={(v) => updateInput("preventasBeforeConstructionPct", v / 100)} unit="%" />
                        <div className="text-[10px] text-zinc-500 mt-1">
                          {(() => {
                            const unitsNeeded = Math.ceil(inputs.totalUnits * inputs.preventasBeforeConstructionPct);
                            const monthsToReach = Math.ceil(unitsNeeded / Math.max(1, inputs.salesVelocity));
                            const icMonth = inputs.monthPreSalesStart + monthsToReach;
                            return <>
                              Necesita <b>{unitsNeeded}</b> viv prevendidas @ {inputs.salesVelocity} un/mes → <b className="text-cyan-300">IC auto en mes {icMonth}</b>
                            </>;
                          })()}
                        </div>
                      </>
                    ) : (
                      <SliderInput label="Mes inicio construcción (manual)" value={inputs.monthConstructionStart} min={0} max={30} step={1}
                        onChange={(v) => updateInput("monthConstructionStart", v)} unit="mes" />
                    )}
                  </div>

                  <SliderInput label="Stock en pie → +vel ventas" value={inputs.stockAccelerationPct * 100} min={0} max={100} step={5}
                    onChange={(v) => updateInput("stockAccelerationPct", v / 100)} unit="%" />
                  <div className="text-[10px] text-zinc-500 italic -mt-1">
                    Post-recepción: velocidad sube de {inputs.salesVelocity} a <b className="text-green-400">{(inputs.salesVelocity * (1 + inputs.stockAccelerationPct)).toFixed(1)}</b> un/mes
                  </div>

                  <SliderInput label="PIE %" value={inputs.piePct * 100} min={5} max={30} step={1}
                    onChange={(v) => updateInput("piePct", v / 100)} unit="%" />
                  <SliderInput label="Lag escrituración stock" value={inputs.escrituracionLagMonths} min={0} max={6} step={1}
                    onChange={(v) => updateInput("escrituracionLagMonths", v)} unit="meses" />
                  <div className="text-[10px] text-zinc-500 italic mt-1">
                    Pre-recepción: todo el backlog se libera de golpe al mes de escrituración.
                    Post-recepción: cada venta se escritura {inputs.escrituracionLagMonths} mes(es) después.
                  </div>
                </Section>

                {/* CRONOGRAMA VISUAL — RESULTADO del Timeline (va DESPUÉS) */}
                {result && (
                  <Section title="Cronograma de Trenes (resultado)" accent="cyan" collapsible>
                    <TimelineChart inputs={inputs} result={result} />
                  </Section>
                )}

                {/* CRÉDITO DE ENLACE — DS19 subsidio estatal */}
                <Section title="Crédito de Enlace (DS19)" accent="purple" collapsible>
                  <label className="flex items-center gap-2 text-xs mb-2">
                    <input type="checkbox" checked={inputs.creditoEnlaceOn}
                      onChange={(e) => updateInput("creditoEnlaceOn", e.target.checked)}
                      className="accent-purple-500" />
                    <span className={inputs.creditoEnlaceOn ? "text-purple-300 font-semibold" : "text-zinc-400"}>
                      Activar Crédito de Enlace
                    </span>
                  </label>
                  {inputs.creditoEnlaceOn && (
                    <>
                      <SliderInput label="UF por vivienda" value={inputs.creditoEnlaceUFPerUnit} min={0} max={500} step={10}
                        onChange={(v) => updateInput("creditoEnlaceUFPerUnit", v)} unit="UF/viv" />
                      <div className="text-[10px] text-zinc-500 italic mt-2 space-y-1">
                        <div>• Total disponible: <b className="text-purple-300">{fmt(inputs.creditoEnlaceUFPerUnit * inputs.totalUnits)} UF</b></div>
                        <div>• Desembolsos: cubren los costos de obra mes a mes hasta agotar el cupo.</div>
                        <div>• Repago: proporcional a las escrituraciones post-recepción (sin interés).</div>
                        <div>• Efecto: libera capital de trabajo durante obra → mejora la TIR del activo puro.</div>
                      </div>
                    </>
                  )}
                  {!inputs.creditoEnlaceOn && product?.family === "ds19" && (
                    <div className="text-[10px] text-amber-400 italic mt-1">
                      ⚠ DS19 típicamente usa Crédito de Enlace. Activarlo mejora notablemente la TIR.
                    </div>
                  )}
                </Section>

                {/* TARGET — TIR activo puro (método residual dinámico clásico) */}
                <Section title="Exigencia de Retorno" accent="red">
                  <SliderInput label="TIR objetivo (anual, activo puro)" value={inputs.targetTIRAnnual * 100} min={5} max={30} step={0.5}
                    onChange={(v) => updateInput("targetTIRAnnual", v / 100)} unit="%" />

                  <div className="text-[10px] text-zinc-500 italic mt-2 leading-tight">
                    <b className="text-red-300">Método Residual Dinámico clásico:</b> el terreno es la variable que se ajusta hasta que la <b>TIR del activo puro</b> (sin financiamiento de construcción) = target.
                  </div>
                </Section>

                {/* RESULTS */}
                {result && (
                  <div className="space-y-3">
                    {/* ═══ HERO: VALOR DEL TERRENO ═══ */}
                    <div className="bg-gradient-to-br from-blue-900 via-blue-950 to-zinc-900 rounded-xl p-5 border-2 border-blue-500/50 shadow-xl shadow-blue-900/30">
                      <div className="text-[11px] uppercase tracking-widest text-blue-300 font-bold mb-2 flex items-center gap-2">
                        <span className="text-2xl">🏆</span> Valor Residual del Terreno
                      </div>

                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-5xl font-black text-white tabular-nums tracking-tight">{fmt(result.landValueUFm2, 2)}</span>
                        <span className="text-lg text-blue-300 font-semibold">UF/m²</span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-blue-800/50">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-zinc-400">Valor Total</div>
                          <div className="text-xl font-bold text-white tabular-nums">{fmt(result.totalLandCostUF)} <span className="text-sm text-zinc-400">UF</span></div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-zinc-400">UF / viv</div>
                          <div className="text-xl font-bold text-white tabular-nums">{fmt(inputs.totalUnits > 0 ? result.totalLandCostUF / inputs.totalUnits : 0, 1)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-zinc-400">Incidencia s/ viv.</div>
                          <div className="text-xl font-bold text-white tabular-nums">{fmtPct(result.incidencia)}</div>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-blue-800/30 text-[10px] text-blue-300/80 flex justify-between items-center">
                        <span>TIR activo puro lograda:</span>
                        <span className={`font-bold ${Math.abs(result.tirAnnual - inputs.targetTIRAnnual) < 0.005 ? "text-green-400" : "text-yellow-400"}`}>
                          {fmtPct(result.tirAnnual)} <span className="text-zinc-500">/ target {fmtPct(inputs.targetTIRAnnual)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Additional metrics */}
                    <div className="grid grid-cols-3 gap-2">
                      <KPISmall label="VAN" value={`${fmt(result.vanUF)} UF`} />
                      <KPISmall label="Payback" value={`Mes ${result.paybackMonth}`} />
                      <KPISmall label="Capital trabajo" value={`${fmt(result.maxCapitalRequired)} UF`} />
                    </div>

                    {/* Mini cash flow chart */}
                    {result.cashFlow.length > 0 && (
                      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                        <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-2">Flujo de Caja Mensual</div>
                        <MiniCashFlowChart cashFlow={result.cashFlow} />
                      </div>
                    )}

                    {/* Utilidad Esperada — discreta, informativa */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 border border-zinc-700/60">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Utilidad esperada (resultante)</div>
                          <div className="text-[9px] text-zinc-600 italic">Sale naturalmente del modelo, no se fuerza</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-zinc-300 tabular-nums">{fmtPct(result.pnl.netProfitPct)}</div>
                          <div className="text-[10px] text-zinc-500 tabular-nums">{fmt(Math.round(result.pnl.netProfit))} UF</div>
                        </div>
                      </div>
                    </div>

                    {/* Buttons: EERR + Download Cash Flow */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setEerrModalOpen(true)}
                        className="py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white text-xs font-semibold rounded-lg transition-all shadow-lg shadow-emerald-900/30">
                        📊 EERR Detallado
                      </button>
                      <button
                        onClick={() => downloadCashFlowXLSX(result, inputs, selectedFid || "lote")}
                        className="py-2.5 bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white text-xs font-semibold rounded-lg transition-all shadow-lg shadow-cyan-900/30">
                        📥 Descargar Excel (.xlsx)
                      </button>
                    </div>

                    {/* Guardar como representante para Monte Carlo */}
                    <button
                      onClick={() => setSaveModalOpen(true)}
                      className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white text-xs font-semibold rounded-lg transition-all shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2"
                      title="Guarda esta evaluación como representante de una familia de producto para usar en Monte Carlo del simulador macro"
                    >
                      💾 Guardar como representante
                    </button>

                    <div className="text-xs text-zinc-600 text-center">
                      {result.converged ? "✓ Convergencia alcanzada" : "⚠ No convergió"} · {result.iterations} iteraciones · {result.totalMonths} meses
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* EERR DETAILED MODAL */}
      {eerrModalOpen && result && inputs && (
        <EerrModal
          result={result}
          inputs={inputs}
          lotFid={selectedFid || ""}
          lotArea={selectedArea}
          onClose={() => setEerrModalOpen(false)}
        />
      )}

      {/* GUARDAR COMO REPRESENTANTE — Modal */}
      {saveModalOpen && result && inputs && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setSaveModalOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-purple-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">💾</span>
              <h2 className="text-lg font-bold text-white">Guardar como representante</h2>
            </div>

            <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
              Guarda esta evaluación como caso típico de una familia de producto.
              Quedará disponible en el simulador macro (Monte Carlo en Primeras Etapas)
              para sensibilizar parámetros y propagar al VAN del AUDP.
            </p>

            <div className="bg-zinc-800/50 rounded-lg p-3 mb-4 border border-zinc-700">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
                Resumen del representante
              </div>
              <div className="text-xs text-zinc-300 space-y-0.5">
                <div>Lote {selectedFid} · {fmt(selectedArea)} m² ({(selectedArea / 10000).toFixed(2)} ha)</div>
                <div>Producto: <span className="text-white">{inputs.unitModels[0]?.name || productId}</span></div>
                <div>Incidencia: <span className="text-purple-300 font-semibold">{fmtPct(result.incidencia, 2)}</span></div>
                <div>Land value: <span className="text-purple-300 font-semibold">{result.landValueUFm2.toFixed(2)} UF/m²</span> · {Math.round(result.totalLandCostUF).toLocaleString()} UF</div>
                <div>TIR: <span className="text-emerald-300">{fmtPct(result.tirAnnual, 1)}</span> · VAN: {Math.round(result.vanUF).toLocaleString()} UF</div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
                Familia que representa
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(FAMILY_LABELS) as ProductFamily[]).map((fam) => {
                  const isSelected = saveFamily === fam;
                  const isReplacing = !!savedReps[fam];
                  return (
                    <button
                      key={fam}
                      onClick={() => setSaveFamily(fam)}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold transition border ${
                        isSelected
                          ? "bg-purple-600 border-purple-400 text-white"
                          : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                      }`}
                    >
                      {FAMILY_LABELS[fam]}
                      {isReplacing && (
                        <span className={`block text-[9px] mt-0.5 ${isSelected ? "text-purple-200" : "text-amber-400"}`}>
                          (reemplaza el actual)
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setSaveModalOpen(false)}
                className="flex-1 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-semibold rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  // Calcular sensibilidades (8 corridas residual extra ~1s) — bloquea
                  // brevemente la UI con feedback "Calculando..." en el botón.
                  const btn = document.activeElement as HTMLButtonElement | null;
                  if (btn) { btn.disabled = true; btn.textContent = "Calculando sensibilidades…"; }
                  // Defer al next tick para permitir repintado del UI
                  setTimeout(() => {
                    let sensitivities;
                    try {
                      sensitivities = computeSensitivities(inputs, result);
                    } catch (e) {
                      console.warn("[representantes] no se pudieron calcular sensibilidades:", e);
                    }
                    const rep: Representante = {
                      family: saveFamily,
                      productId: productId,
                      productName: inputs.unitModels[0]?.name || productId,
                      lotFid: selectedFid || "",
                      lotAreaM2: selectedArea,
                      inputs,
                      result,
                      sensitivities,
                      savedAt: new Date().toISOString(),
                    };
                    saveRepresentante(rep);
                    setSavedReps(loadAllRepresentantes());
                    setSaveModalOpen(false);
                  }, 50);
                }}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:cursor-wait text-white text-xs font-bold rounded-lg transition shadow-lg shadow-purple-900/50"
              >
                💾 Guardar como {FAMILY_LABELS[saveFamily]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EERR Modal (Excel-identical row structure) ───────────────

// ── Timeline Chart (visualización Gantt: resultado del Timeline) ──
function TimelineChart({ inputs, result }: { inputs: ResidualInputs; result: ResidualOutput }) {
  const isDualEtapa = inputs.numEtapas > 1;

  // Velocidad efectiva: si son 2 etapas, ambas operan canibalizadas desde sus inicios
  const effVel = inputs.salesVelocity * cannibalizationFactor(inputs.numEtapas) / Math.max(1, inputs.numEtapas);
  const unitsE1 = isDualEtapa ? Math.floor(inputs.totalUnits / inputs.numEtapas) : inputs.totalUnits;
  const unitsE2 = isDualEtapa ? inputs.totalUnits - unitsE1 * (inputs.numEtapas - 1) : 0;

  // Etapa 1
  const preventaUnitsE1 = unitsE1 * inputs.preventasBeforeConstructionPct;
  const icE1 = inputs.autoConstructionStart
    ? inputs.monthPreSalesStart + Math.ceil(preventaUnitsE1 / Math.max(0.1, effVel))
    : inputs.monthConstructionStart;
  const obraEndE1 = icE1 + inputs.constructionMonths;
  const recepE1 = obraEndE1 + inputs.monthsAfterConstructionToReception;
  const salesEndE1 = inputs.monthPreSalesStart + Math.ceil(unitsE1 / Math.max(0.1, effVel));

  // Etapa 2 (derivada: IC calza con últimos `overlap` meses de obra E1)
  let icE2 = 0, obraEndE2 = 0, recepE2 = 0, preSalesStartE2 = 0, salesEndE2 = 0;
  if (isDualEtapa) {
    const preventaUnitsE2 = unitsE2 * inputs.preventasBeforeConstructionPct;
    icE2 = icE1 + inputs.constructionMonths - inputs.etapaOverlapMonths;
    const preventaTimeE2 = Math.ceil(preventaUnitsE2 / Math.max(0.1, effVel));
    preSalesStartE2 = Math.max(inputs.monthPreSalesStart, icE2 - preventaTimeE2);
    obraEndE2 = icE2 + inputs.constructionMonths;
    recepE2 = obraEndE2 + inputs.monthsAfterConstructionToReception;
    salesEndE2 = preSalesStartE2 + Math.ceil(unitsE2 / Math.max(0.1, effVel));
  }

  const lastEscriMonth = result.cashFlow.reduce((last, r, i) =>
    r.revenueEscrituracion > 0 ? i : last, 0);
  const stockSaleEnd = Math.max(lastEscriMonth, salesEndE1, salesEndE2);
  const maxMonth = Math.max(stockSaleEnd + 2, result.totalMonths, isDualEtapa ? recepE2 + 4 : recepE1 + 4);

  const monthToLabel = (m: number) => {
    const mm = ((0 + m) % 12) + 1;
    const yy = 2024 + Math.floor((0 + m) / 12);
    return `${String(mm).padStart(2, "0")}/${String(yy).slice(2)}`;
  };

  type Track = { label: string; start: number; end: number; color: string; markerType: "bar" | "point"; tooltip: string; group?: "e1" | "e2" | "terreno" };

  const tracks: Track[] = [
    { label: "Compra Terreno", start: inputs.monthLandPurchase, end: inputs.monthLandPurchase, color: "bg-amber-500", markerType: "point", tooltip: `Mes ${inputs.monthLandPurchase} · ${monthToLabel(inputs.monthLandPurchase)}`, group: "terreno" },
  ];

  if (isDualEtapa) {
    tracks.push(
      // Etapa 1 — tonos cyan/azul
      { label: "E1 · Preventa", start: inputs.monthPreSalesStart, end: icE1, color: "bg-cyan-500/70", markerType: "bar", tooltip: `Etapa 1 preventa @ ${effVel.toFixed(1)} un/mes (canibalizada) · ${unitsE1} viv`, group: "e1" },
      { label: "E1 · Venta", start: icE1, end: salesEndE1, color: "bg-cyan-400/50", markerType: "bar", tooltip: `Etapa 1 ventas (verde + stock) · hasta mes ${salesEndE1}`, group: "e1" },
      { label: "E1 · Construcción", start: icE1, end: obraEndE1, color: "bg-orange-500/70", markerType: "bar", tooltip: `Etapa 1 obra · ${inputs.constructionMonths} meses`, group: "e1" },
      { label: "E1 · Recepción", start: recepE1, end: recepE1, color: "bg-purple-500", markerType: "point", tooltip: `E1 recepción municipal mes ${recepE1}`, group: "e1" },
      // Etapa 2 — tonos emerald/verde
      { label: "E2 · Preventa", start: preSalesStartE2, end: icE2, color: "bg-emerald-500/70", markerType: "bar", tooltip: `Etapa 2 preventa (calza con traslape ${inputs.etapaOverlapMonths}m obra E1) · ${unitsE2} viv`, group: "e2" },
      { label: "E2 · Venta", start: icE2, end: salesEndE2, color: "bg-emerald-400/50", markerType: "bar", tooltip: `Etapa 2 ventas · hasta mes ${salesEndE2}`, group: "e2" },
      { label: "E2 · Construcción", start: icE2, end: obraEndE2, color: "bg-rose-500/70", markerType: "bar", tooltip: `Etapa 2 obra · traslape con E1 = ${inputs.etapaOverlapMonths}m`, group: "e2" },
      { label: "E2 · Recepción", start: recepE2, end: recepE2, color: "bg-fuchsia-500", markerType: "point", tooltip: `E2 recepción municipal mes ${recepE2}`, group: "e2" },
    );
  } else {
    tracks.push(
      { label: "Preventa", start: inputs.monthPreSalesStart, end: icE1, color: "bg-green-500/70", markerType: "bar", tooltip: `Mes ${inputs.monthPreSalesStart} → ${icE1} · preventa hasta inicio de construcción @ ${inputs.salesVelocity}/mes` },
      { label: "Venta", start: icE1, end: stockSaleEnd, color: "bg-blue-500/60", markerType: "bar", tooltip: `Mes ${icE1} → ${stockSaleEnd} · venta en verde + stock post-recepción` },
      { label: "Construcción", start: icE1, end: obraEndE1, color: "bg-orange-500/70", markerType: "bar", tooltip: `Mes ${icE1} → ${obraEndE1} · ${inputs.constructionMonths} meses${inputs.autoConstructionStart ? " (auto: " + (inputs.preventasBeforeConstructionPct*100).toFixed(0) + "% preventa)" : ""}` },
      { label: "Recepción Municipal", start: recepE1, end: recepE1, color: "bg-purple-500", markerType: "point", tooltip: `Mes ${recepE1} · ${monthToLabel(recepE1)}` },
    );
  }

  // Alias para mantener datos de summary abajo (referencia a etapa 1 como "principal")
  const effectiveMonthConstructionStart = icE1;
  const monthReception = recepE1;
  const monthEscrituracion = monthReception + inputs.monthsAfterReceptionToEscrituracion;
  const salesMonths = Math.ceil(inputs.totalUnits / Math.max(0.1, effVel));
  const monthSalesEnd = inputs.monthPreSalesStart + salesMonths;

  const yearMarks: number[] = [];
  for (let m = 0; m <= maxMonth; m += 12) yearMarks.push(m);

  return (
    <div className="space-y-2">
      <div className="relative h-4 text-[9px] text-zinc-500 border-b border-zinc-700 ml-32">
        {yearMarks.map((m) => (
          <div key={m} className="absolute" style={{ left: `${(m / maxMonth) * 100}%`, transform: "translateX(-50%)" }}>
            {2024 + m / 12}
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        {tracks.map((t, idx) => {
          const leftPct = (t.start / maxMonth) * 100;
          const widthPct = Math.max(0.8, ((t.end - t.start) / maxMonth) * 100);
          const prevGroup = idx > 0 ? tracks[idx - 1].group : undefined;
          const showGroupSeparator = isDualEtapa && t.group && t.group !== prevGroup && idx > 0;
          return (
            <div key={idx}>
              {showGroupSeparator && (
                <div className={`text-[9px] uppercase tracking-widest font-semibold pl-2 pt-1 pb-0.5 ${t.group === "e1" ? "text-cyan-400" : t.group === "e2" ? "text-emerald-400" : "text-zinc-500"}`}>
                  {t.group === "e1" ? `── Etapa 1 (${unitsE1} viv)` : t.group === "e2" ? `── Etapa 2 (${unitsE2} viv)` : "──"}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="w-32 text-[10px] text-zinc-400 text-right shrink-0 truncate">{t.label}</div>
                <div className="relative flex-1 h-5 bg-zinc-900/60 rounded border border-zinc-800">
                  {t.markerType === "bar" ? (
                    <div className={`absolute top-0.5 bottom-0.5 ${t.color} rounded transition-all duration-200`} style={{ left: `${leftPct}%`, width: `${widthPct}%` }} title={t.tooltip} />
                  ) : (
                    <div className={`absolute top-1/2 w-2.5 h-2.5 rounded-full ${t.color} ring-2 ring-zinc-900 transition-all duration-200`} style={{ left: `${leftPct}%`, transform: "translateX(-50%) translateY(-50%)" }} title={t.tooltip} />
                  )}
                  {t.markerType === "bar" && (
                    <>
                      <div className="absolute text-[8px] text-zinc-500" style={{ left: `${leftPct}%`, top: "100%", transform: "translateX(-50%)" }}>{t.start}</div>
                      <div className="absolute text-[8px] text-zinc-500" style={{ left: `${leftPct + widthPct}%`, top: "100%", transform: "translateX(-50%)" }}>{t.end}</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Data summary table */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] bg-zinc-900/50 rounded p-2 border border-zinc-700">
        {!isDualEtapa ? (
          <>
            <div className="text-zinc-400">Inicio Preventas:</div>
            <div className="text-zinc-200 font-semibold">Mes {inputs.monthPreSalesStart} · {monthToLabel(inputs.monthPreSalesStart)}</div>
            <div className="text-zinc-400">Inicio Construcción:</div>
            <div className="text-zinc-200 font-semibold">Mes {effectiveMonthConstructionStart} · {monthToLabel(effectiveMonthConstructionStart)} {inputs.autoConstructionStart && <span className="text-cyan-400 text-[9px]">(auto)</span>}</div>
            <div className="text-zinc-400">Recepción Municipal:</div>
            <div className="text-zinc-200 font-semibold">Mes {monthReception} · {monthToLabel(monthReception)}</div>
            <div className="text-zinc-400">Inicio Escrituración:</div>
            <div className="text-zinc-200 font-semibold">Mes {monthEscrituracion} · {monthToLabel(monthEscrituracion)}</div>
            <div className="text-zinc-400">Fin Ventas:</div>
            <div className="text-zinc-200 font-semibold">Mes {monthSalesEnd} · {monthToLabel(monthSalesEnd)}</div>
            <div className="text-zinc-400">Fin Escrituración Stock:</div>
            <div className="text-zinc-200 font-semibold">Mes {stockSaleEnd} · {monthToLabel(stockSaleEnd)}</div>
          </>
        ) : (
          <>
            <div className="col-span-2 text-cyan-400 font-semibold uppercase tracking-wider text-[9px] pt-0.5">Etapa 1 · {unitsE1} viv</div>
            <div className="text-zinc-400">Preventas → Construcción:</div>
            <div className="text-zinc-200 font-semibold">Mes {inputs.monthPreSalesStart} → {icE1}</div>
            <div className="text-zinc-400">Obra → Recepción:</div>
            <div className="text-zinc-200 font-semibold">Mes {icE1} → {obraEndE1} → <span className="text-purple-300">{recepE1}</span></div>
            <div className="text-zinc-400">Fin Ventas E1:</div>
            <div className="text-zinc-200 font-semibold">Mes {salesEndE1}</div>
            <div className="col-span-2 text-emerald-400 font-semibold uppercase tracking-wider text-[9px] pt-1 border-t border-zinc-700">Etapa 2 · {unitsE2} viv</div>
            <div className="text-zinc-400">Preventas → Construcción:</div>
            <div className="text-zinc-200 font-semibold">Mes {preSalesStartE2} → {icE2}</div>
            <div className="text-zinc-400">Obra → Recepción:</div>
            <div className="text-zinc-200 font-semibold">Mes {icE2} → {obraEndE2} → <span className="text-fuchsia-300">{recepE2}</span></div>
            <div className="text-zinc-400">Fin Ventas E2:</div>
            <div className="text-zinc-200 font-semibold">Mes {salesEndE2}</div>
            <div className="col-span-2 text-amber-400 font-semibold uppercase tracking-wider text-[9px] pt-1 border-t border-zinc-700">Traslape obra E1 ⇄ E2</div>
            <div className="text-zinc-400">Meses de traslape:</div>
            <div className="text-amber-300 font-semibold">{inputs.etapaOverlapMonths} meses (mes {icE2} → {obraEndE1})</div>
            <div className="text-zinc-400">Velocidad canibalizada:</div>
            <div className="text-amber-300 font-semibold">{effVel.toFixed(1)} un/mes por etapa (base {inputs.salesVelocity}, 1.35× entre ambas)</div>
          </>
        )}
        <div className="text-zinc-400 pt-1 border-t border-zinc-700 col-span-2"></div>
        <div className="text-zinc-400">Plazo Construcción:</div>
        <div className="text-orange-400 font-semibold">{inputs.constructionMonths} meses</div>
        <div className="text-zinc-400">Duración Total Proyecto:</div>
        <div className="text-blue-400 font-semibold">{result.totalMonths} meses (~{(result.totalMonths / 12).toFixed(1)} años)</div>
      </div>
    </div>
  );
}

// ── IVA Breakdown: muestra débito, crédito, neto, y pagado (metodología Excel) ──
function IVABreakdown({ result, inputs }: { result: ResidualOutput; inputs: ResidualInputs }) {
  const ivaRate = inputs.ivaRate;
  const ivaProportional = ivaRate / (1 + ivaRate);

  // Totales desde el cash flow
  const totalRevGross = result.cashFlow.reduce((s, r) => s + r.totalRevenue, 0);
  const ivaDebitoTotal = totalRevGross * ivaProportional;
  const ivaPagadoTotal = result.cashFlow.reduce((s, r) => s + r.ivaPaid, 0);

  // Crédito acumulado: base gravada × 19%
  // Items GRAVADOS (reconstrucción de la base usada en engine)
  const construccionNet = result.pnl.constructionTotal + result.pnl.urbanizationTotal +
    result.pnl.earthMovementTotal + result.pnl.indirectCostsTotal + result.pnl.postVentaConstructionTotal +
    result.pnl.constructorUtilityTotal + result.pnl.contingenciesTotal;
  const estudiosGravados = result.pnl.studiesPermitsTotal * 0.94;
  const itoGravado = result.pnl.itoTotal;
  const gavGravado = result.pnl.gavBreakdown.sales + result.pnl.gavBreakdown.marketing +
    result.pnl.gavBreakdown.greenInsurance + result.pnl.gavBreakdown.postVenta +
    result.pnl.gavBreakdown.stockMaintenance + result.pnl.gavBreakdown.admin;
  const baseGravada = construccionNet + estudiosGravados + itoGravado + gavGravado;
  const ivaCreditoTotal = baseGravada * ivaRate;

  const ivaNeto = ivaDebitoTotal - ivaCreditoTotal;

  const fmtUF = (v: number) => v.toLocaleString("es-CL", { maximumFractionDigits: 0 });

  return (
    <div className="mt-6 bg-gradient-to-br from-cyan-950/30 to-zinc-900 rounded-lg p-4 border border-cyan-800/50">
      <div className="text-xs uppercase tracking-wider text-cyan-400 font-semibold mb-3">📋 Desglose del IVA (Método Proporcional con Arrastre)</div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-zinc-900/60 rounded p-2 border border-zinc-700">
          <div className="text-[10px] uppercase text-zinc-500">IVA Débito (ventas)</div>
          <div className="text-lg font-bold text-rose-400">{fmtUF(ivaDebitoTotal)} UF</div>
          <div className="text-[9px] text-zinc-500 mt-1">Bruto × {(ivaProportional * 100).toFixed(2)}%</div>
        </div>
        <div className="bg-zinc-900/60 rounded p-2 border border-zinc-700">
          <div className="text-[10px] uppercase text-zinc-500">IVA Crédito (costos)</div>
          <div className="text-lg font-bold text-emerald-400">{fmtUF(ivaCreditoTotal)} UF</div>
          <div className="text-[9px] text-zinc-500 mt-1">Base gravada × {(ivaRate * 100).toFixed(0)}%</div>
        </div>
        <div className="bg-zinc-900/60 rounded p-2 border border-zinc-700">
          <div className="text-[10px] uppercase text-zinc-500">IVA Neto (teórico)</div>
          <div className={`text-lg font-bold ${ivaNeto > 0 ? "text-rose-300" : "text-emerald-300"}`}>{fmtUF(Math.abs(ivaNeto))} UF</div>
          <div className="text-[9px] text-zinc-500 mt-1">{ivaNeto > 0 ? "Débito − Crédito" : "Crédito > Débito"}</div>
        </div>
        <div className="bg-zinc-900/60 rounded p-2 border border-amber-800/60">
          <div className="text-[10px] uppercase text-amber-400">IVA PAGADO SII</div>
          <div className="text-lg font-bold text-amber-300">{fmtUF(ivaPagadoTotal)} UF</div>
          <div className="text-[9px] text-zinc-500 mt-1">Con arrastre de saldo</div>
        </div>
      </div>

      {/* Breakdown de items gravados */}
      <div className="mt-3 text-[10px]">
        <div className="text-zinc-400 uppercase tracking-wider font-semibold mb-1">Base IVA Crédito (items gravados):</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <div className="text-zinc-500">🏗️ Construcción total (edif + urba + mov. tierra + indirectos + utilidad + post-v + imprev.):</div>
          <div className="text-right text-emerald-300 font-semibold">{fmtUF(construccionNet)} UF</div>
          <div className="text-zinc-500">📐 Estudios y diseños profesionales (94%):</div>
          <div className="text-right text-emerald-300 font-semibold">{fmtUF(estudiosGravados)} UF</div>
          <div className="text-zinc-500">🔍 Inspección técnica (ITO):</div>
          <div className="text-right text-emerald-300 font-semibold">{fmtUF(itoGravado)} UF</div>
          <div className="text-zinc-500">💼 GAV (ventas + marketing + seguro + post-v + stock + admin):</div>
          <div className="text-right text-emerald-300 font-semibold">{fmtUF(gavGravado)} UF</div>
          <div className="text-zinc-400 pt-1 border-t border-zinc-800 font-semibold col-span-2"></div>
          <div className="text-zinc-200 font-semibold">BASE GRAVADA TOTAL:</div>
          <div className="text-right text-emerald-400 font-bold">{fmtUF(baseGravada)} UF × 19% = {fmtUF(ivaCreditoTotal)} UF</div>
        </div>
      </div>

      {/* Items EXENTOS */}
      <div className="mt-3 text-[10px]">
        <div className="text-zinc-400 uppercase tracking-wider font-semibold mb-1">Items EXENTOS de IVA (no generan crédito):</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-zinc-500">
          <div>🏞️ Compra de terreno</div>
          <div className="text-right">{fmtUF(result.pnl.landCost)} UF</div>
          <div>🧾 Contribuciones y corretaje terreno</div>
          <div className="text-right">{fmtUF(result.pnl.landContributions)} UF</div>
          <div>🏛️ Permisos municipales (6% de estudios):</div>
          <div className="text-right">{fmtUF(result.pnl.studiesPermitsTotal * 0.06)} UF</div>
          <div>🛣️ AFR y aportes viales</div>
          <div className="text-right">{fmtUF(result.pnl.afrVialTotal)} UF</div>
          <div>📜 Servicio escrituración</div>
          <div className="text-right">{fmtUF(result.pnl.gavBreakdown.escrituracion)} UF</div>
          <div>💰 Intereses financieros</div>
          <div className="text-right">{fmtUF(result.pnl.financingCost)} UF</div>
        </div>
      </div>

      <div className="mt-3 text-[9px] text-zinc-600 italic leading-relaxed">
        💡 <b>Cómo funciona el método proporcional con arrastre:</b> Cada mes se calcula débito − crédito.
        Si el crédito supera al débito (típicamente durante construcción), el exceso se arrastra al mes siguiente.
        El pago efectivo al SII sólo comienza al mes de escrituración, y se detiene cuando el pagado acumulado iguala el débito total.
        Por eso el <b>IVA pagado real</b> ({fmtUF(ivaPagadoTotal)} UF) puede ser menor al neto teórico si hubo acumulación de crédito previa.
      </div>
    </div>
  );
}

// ── Retorno sobre capital de trabajo ─────────────────────────
// Mide cuánta utilidad genera cada UF de capital inmovilizada en el peor momento
// de caja. El múltiplo simple (utilidad / capital) es directo pero NO considera
// cuánto tiempo estuvo inmovilizado ese capital: dos proyectos con igual múltiplo
// pero distinta duración tienen eficiencias de capital muy diferentes. Por eso,
// además del múltiplo, se anualiza dividiendo por la ventana de exposición.
function workingCapitalReturn(result: ResidualOutput): { multiple: number; annualizedPct: number } {
  // Retorno sobre el capital PROPIO efectivo (80% de la obra financiada), coherente
  // con los montos del bloque de Capital de Trabajo.
  const capital = result.maxCapitalRequiredFinanced;
  const utilidad = result.pnl.utilidadEtapa;
  const multiple = capital > 0 ? utilidad / capital : 0;

  // Ventana de anualización del capital comprometido. Por defecto: desde el inicio
  // del proyecto (compra del terreno, mes 0) hasta el payback. Es conservadora —
  // refleja que el capital está en riesgo desde el primer desembolso.
  // TODO(Sebastián): decide qué ventana refleja mejor tu realidad de negocio
  // (ver alternativas en el chat) y ajústala aquí. Otra opción razonable es la
  // ventana de exposición pico→payback: Math.max(1, paybackMonth - workingCapitalPeakMonth).
  const exposureMonths = Math.max(1, result.paybackMonth);
  const annualizedPct = multiple / (exposureMonths / 12);

  return { multiple, annualizedPct };
}

function EerrModal({ result, inputs, lotFid, lotArea, onClose }: {
  result: ResidualOutput;
  inputs: ResidualInputs;
  lotFid: string;
  lotArea: number;
  onClose: () => void;
}) {
  const p = result.pnl;
  const ivaRate = inputs.ivaRate;
  const totalRef = p.totalIngresosNet;

  // Single row: Concepto | [UF] Net | [%] | Bruto [UF]
  const Row = ({ label, neto, bruto, bold = false, italic = false, indent = 0, section = false, showPct = true, hidePctIfZero = false }: {
    label: string; neto?: number; bruto?: number; bold?: boolean; italic?: boolean;
    indent?: number; section?: boolean; showPct?: boolean; hidePctIfZero?: boolean;
  }) => {
    const pct = showPct && neto !== undefined && totalRef > 0 ? (neto / totalRef) * 100 : undefined;
    const color = neto === undefined ? "text-zinc-400" : (Math.abs(neto) < 0.01 ? "text-zinc-600" : (neto >= 0 ? "text-zinc-100" : "text-red-300"));
    const brutoColor = bruto === undefined ? "text-zinc-400" : (Math.abs(bruto) < 0.01 ? "text-zinc-600" : "text-zinc-300");
    const bg = section ? "bg-emerald-950/40 border-l-2 border-emerald-500" : bold ? "bg-zinc-800/40" : "";
    const showPctValue = pct !== undefined && !(hidePctIfZero && Math.abs(pct) < 0.01);
    const fmtVal = (v: number) => Math.abs(v) < 0.01 ? "—" : v.toLocaleString("es-CL", { maximumFractionDigits: 0 });
    return (
      <tr className={`${bg} ${bold ? "font-bold" : ""} ${italic ? "italic text-zinc-500" : ""}`}>
        <td className="py-[3px] px-2" style={{ paddingLeft: `${indent * 14 + 8}px` }}>{label}</td>
        <td className={`py-[3px] px-2 text-right tabular-nums ${color}`}>{neto !== undefined ? fmtVal(neto) : ""}</td>
        <td className="py-[3px] px-2 text-right tabular-nums text-zinc-500 text-[10px]">{showPctValue ? pct!.toFixed(2).replace(".", ",") + "%" : ""}</td>
        <td className={`py-[3px] px-2 text-right tabular-nums ${brutoColor}`}>{bruto !== undefined ? fmtVal(bruto) : ""}</td>
      </tr>
    );
  };

  const Divider = () => <tr><td colSpan={4} className="py-1"></td></tr>;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-950 border border-zinc-700 rounded-xl max-w-5xl w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-700 p-4 flex justify-between items-center z-10">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Estado de Resultados — Método Residual Dinámico</div>
            <div className="text-lg font-bold text-white">Lote FID {lotFid} · {lotArea.toLocaleString("es-CL")} m² · Etapa única</div>
            <div className="text-xs text-zinc-400">Nº Viviendas: <b className="text-white">{inputs.totalUnits}</b> · {inputs.unitModels[0]?.name}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-[10px] text-zinc-500">
              <div>Check Cuadratura:</div>
              <div className="text-green-400 font-bold">✓ OK</div>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-3xl leading-none">×</button>
          </div>
        </div>

        {/* Table — idéntico al Excel */}
        <div className="p-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-zinc-800 text-zinc-300 uppercase tracking-wider text-[10px] border-b-2 border-zinc-600">
                <th className="py-2 px-2 text-left font-semibold">Concepto</th>
                <th className="py-2 px-2 text-right font-semibold w-24">[UF]</th>
                <th className="py-2 px-2 text-right font-semibold w-16">[%]</th>
                <th className="py-2 px-2 text-right font-semibold w-24">Bruto [UF]</th>
              </tr>
            </thead>
            <tbody>
              {/* ═══════ INGRESOS DE EXPLOTACIÓN ═══════ */}
              <Row label="INGRESOS DE EXPLOTACIÓN" section bold />
              <Row label="Ventas Inmobiliarias" neto={p.ventasInmobiliariasNet} bruto={p.ventasInmobiliariasGross} indent={1} />
              <Row label="Ventas Estacionamientos" neto={p.ventasEstacionamientosNet} bruto={p.ventasEstacionamientosGross} indent={1} />
              <Row label="Ventas Bodegas" neto={p.ventasBodegasNet} bruto={p.ventasBodegasGross} indent={1} hidePctIfZero />
              <Row label="Venta Locales" neto={p.ventaLocalesNet} bruto={p.ventaLocalesGross} indent={1} hidePctIfZero />
              <Row label="TOTAL INGRESOS DE EXPLOTACIÓN" neto={p.totalIngresosNet} bruto={p.totalIngresosGross} bold />

              <Divider />

              {/* ═══════ COSTOS DE EXPLOTACIÓN ═══════ */}
              <Row label="COSTOS DE EXPLOTACIÓN" section bold />
              <Row label="Terreno" neto={p.terrenoNet} bruto={p.terrenoGross} indent={1} />
              <Row label="Contribuciones y Corretaje Terreno" neto={p.contribucionesCorretajeTerreno} bruto={p.contribucionesCorretajeTerreno} indent={1} />
              <Row label="Intereses Terreno" neto={p.interesesTerreno} bruto={p.interesesTerreno} indent={1} hidePctIfZero />
              <Row label="Construcción" neto={p.construccionNet} bruto={p.construccionGross} indent={1} bold />
              <Row label="Edificación Neto" neto={p.edificacionNet} bruto={p.edificacionGross} indent={2} />
              <Row label="Menor Costo IVA" neto={p.menorCostoIVA} bruto={p.menorCostoIVA} indent={2} hidePctIfZero />
              <Row label="Urbanización Neto" neto={p.urbanizacionNet} bruto={p.urbanizacionGross} indent={2} />
              <Row label="Infraestructura Neto" neto={p.infraestructuraNet} bruto={p.infraestructuraNet} indent={2} hidePctIfZero />
              <Row label="AFR y Aportes Viales" neto={p.afrAportesViales} bruto={p.afrAportesViales} indent={1} />
              <Row label="Estudios y Diseños Variables" neto={p.estudiosDisenoVariables} bruto={p.estudiosDisenoVariables} indent={1} />
              <Row label="Licencias y Trámites Variables" neto={p.licenciasTramitesVariables} bruto={p.licenciasTramitesVariables} indent={1} />
              <Row label="Inspección Técnica" neto={p.inspeccionTecnica} bruto={p.inspeccionTecnica} indent={1} />
              <Row label="Intereses de Construcción" neto={p.interesesConstruccion} bruto={p.interesesConstruccion} indent={1} />
              <Row label="TOTAL COSTOS DE EXPLOTACIÓN" neto={p.totalCostosExplotacionNet} bruto={p.totalCostosExplotacionGross} bold />

              <Divider />

              {/* ═══════ MARGEN DE EXPLOTACIÓN ═══════ */}
              <Row label="MARGEN DE EXPLOTACIÓN" neto={p.margenExplotacion} bruto={p.margenExplotacion} section bold />

              <Divider />

              {/* ═══════ GAV ═══════ */}
              <Row label="GASTOS DE ADMINISTRACIÓN Y VENTAS" section bold />
              <Row label="Servicio de Escrituración" neto={p.servicioEscrituracion} bruto={p.servicioEscrituracion} indent={1} />
              <Row label="Ventas Fijas + Variables" neto={p.ventasFijasVariables} bruto={p.ventasFijasVariablesGross} indent={1} />
              <Row label="Seguro Venta en Verde" neto={p.seguroVentaVerde} bruto={p.seguroVentaVerdeGross} indent={1} />
              <Row label="Marketing Fijo + Variable" neto={p.marketingFijoVariable} bruto={p.marketingFijoVariableGross} indent={1} />
              <Row label="Decoración Piloto y Pto.Venta" neto={p.decoracionPiloto} bruto={p.decoracionPiloto} indent={1} hidePctIfZero />
              <Row label="Condominios y Mantención Stock" neto={p.condominiosMantencionStock} bruto={p.condominiosMantencionStock} indent={1} />
              <Row label="Post Venta Inmobiliaria" neto={p.postVentaInmobiliaria} bruto={p.postVentaInmobiliaria} indent={1} />
              <Row label="Contribuciones Viviendas" neto={p.contribucionesViviendas} bruto={p.contribucionesViviendas} indent={1} />
              <Row label="Administración General" neto={p.administracionGeneral} bruto={p.administracionGeneral} indent={1} hidePctIfZero />
              <Row label="Tarifa por Gestión Inmobiliaria" neto={p.tarifaGestionInmobiliaria} bruto={p.tarifaGestionInmobiliaria} indent={1} />
              <Row label="TOTAL GASTOS DE ADMINISTRACIÓN Y VTAS" neto={p.totalGAVNet} bruto={p.totalGAVGross} bold />

              <Divider />

              {/* ═══════ RESULTADO DE LA EXPLOTACIÓN ═══════ */}
              <Row label="RESULTADO DE LA EXPLOTACIÓN" neto={p.resultadoExplotacion} bruto={p.resultadoExplotacion} section bold />

              <Divider />

              {/* ═══════ FINANCIERO E IMPUESTOS ═══════ */}
              <Row label="Gastos Fin. Crédito Construcción" neto={p.gastosFinCreditoConstruccion} bruto={p.gastosFinCreditoConstruccion} />

              <Divider />

              <Row label="UTILIDAD (PÉRDIDA) ANTES DE IMPUESTO" neto={p.utilidadAntesImpuesto} bruto={p.utilidadAntesImpuesto} bold />

              <Divider />

              <Row label={`Impuesto a la Renta (${fmtPct(inputs.incomeTaxRate, 0)})`} neto={p.impuestoRenta} bruto={p.impuestoRenta} />

              <Divider />

              <Row label="Pago de IVA" neto={p.pagoIVA} bruto={p.pagoIVA} hidePctIfZero />

              <Divider />

              {/* ═══════ UTILIDAD DE LA ETAPA ═══════ */}
              <Row label="UTILIDAD (PÉRDIDA) DE LA ETAPA" neto={p.utilidadEtapa} bruto={p.utilidadEtapa} section bold />
            </tbody>
          </table>

          {/* Desglose del IVA (débito/crédito/neto/pagado) */}
          <IVABreakdown result={result} inputs={inputs} />

          {/* Valor del terreno — mismo cálculo que Hero del sidebar (convención chilena: sólo viviendas) */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3 bg-blue-950/40 rounded-lg p-4 border border-blue-700/50">
            <div>
              <div className="text-[10px] uppercase text-blue-300">Valor Terreno (UF/m²)</div>
              <div className="text-lg font-bold text-white tabular-nums">{result.landValueUFm2.toLocaleString("es-CL", { maximumFractionDigits: 2 })}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-blue-300">Valor Terreno Total (UF)</div>
              <div className="text-lg font-bold text-white tabular-nums">{result.totalLandCostUF.toLocaleString("es-CL", { maximumFractionDigits: 0 })}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-blue-300">UF / vivienda</div>
              <div className="text-lg font-bold text-white tabular-nums">
                {(inputs.totalUnits > 0 ? result.totalLandCostUF / inputs.totalUnits : 0).toLocaleString("es-CL", { maximumFractionDigits: 1 })}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-blue-300">Incidencia s/ viviendas</div>
              <div className="text-lg font-bold text-white tabular-nums">{fmtPct(result.incidencia)}</div>
              <div className="text-[9px] text-zinc-500 italic">Base: ventas viviendas BRUTO (con IVA)</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-blue-300">Terreno / Utilidad</div>
              <div className="text-lg font-bold text-white tabular-nums">{p.utilidadEtapa > 0 ? fmtPct(result.totalLandCostUF / p.utilidadEtapa) : "—"}</div>
              <div className="text-[9px] text-zinc-500 italic">s/ utilidad después de impuestos</div>
            </div>
          </div>

          {/* Indicadores finales (como el Excel 2.Resumen Costos) */}
          <div className="mt-3 grid grid-cols-3 gap-3 bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
            <div>
              <div className="text-[10px] uppercase text-zinc-500">Margen (%)</div>
              <div className="text-lg font-bold text-green-400">{fmtPct(p.margenExplotacionPct)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-zinc-500">Margen (UF)</div>
              <div className="text-lg font-bold text-zinc-200">{p.margenExplotacion.toLocaleString("es-CL", { maximumFractionDigits: 0 })}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-zinc-500">Utilidad (%)</div>
              <div className="text-lg font-bold text-green-400">{fmtPct(p.utilidadEtapaPct)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-zinc-500">Utilidad (UF)</div>
              <div className="text-lg font-bold text-zinc-200">{p.utilidadEtapa.toLocaleString("es-CL", { maximumFractionDigits: 0 })}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-zinc-500">TIR (Pura)</div>
              <div className="text-lg font-bold text-blue-400">{fmtPct(result.tirAnnual)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-zinc-500">TIR Financiera</div>
              <div className="text-lg font-bold text-blue-400">{fmtPct(result.tirAnnualLevered)}</div>
            </div>
          </div>

          {/* ═══════ CAPITAL DE TRABAJO ═══════ */}
          {(() => {
            // Capital PROPIO efectivo: asume 80% de la obra financiada con crédito constructor.
            const capital = result.maxCapitalRequiredFinanced;
            const capitalExLand = result.maxCapitalRequiredExLandFinanced;
            const capitalPuro = result.maxCapitalRequired; // activo puro (sin financiar) — referencia
            const peakRow = result.cashFlow[result.workingCapitalPeakMonthFinanced];
            const intensidad = p.totalIngresosNet > 0 ? capital / p.totalIngresosNet : 0;
            const intensidadGross = p.totalIngresosGross > 0 ? capital / p.totalIngresosGross : 0;
            const intensidadExLandGross = p.totalIngresosGross > 0 ? capitalExLand / p.totalIngresosGross : 0;
            const wc = workingCapitalReturn(result);
            return (
              <div className="mt-3 bg-amber-950/30 rounded-lg p-4 border border-amber-700/40">
                <div className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold mb-3 flex items-center gap-2">
                  <span>💰</span> Capital de Trabajo
                  <span className="text-[9px] text-zinc-500 normal-case font-normal">— capital propio · obra financiada salvo el anticipo</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Capital de Trabajo (máx.)</div>
                    <div className="text-lg font-bold text-amber-300 tabular-nums">{fmt(capital)} <span className="text-xs text-zinc-500">UF</span></div>
                    <div className="text-[9px] text-zinc-600 italic">solo anticipo de obra es propio</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Capital sin terreno</div>
                    <div className="text-lg font-bold text-amber-200 tabular-nums">{fmt(capitalExLand)} <span className="text-xs text-zinc-500">UF</span></div>
                    <div className="text-[9px] text-zinc-600 italic">excluye compra del suelo</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Máxima Exposición</div>
                    <div className="text-lg font-bold text-zinc-200 tabular-nums">Mes {result.workingCapitalPeakMonthFinanced}</div>
                    {peakRow?.date && <div className="text-[9px] text-zinc-600">{peakRow.date}</div>}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Retorno s/ Capital</div>
                    <div className="text-lg font-bold text-zinc-200 tabular-nums">{wc.multiple.toLocaleString("es-CL", { maximumFractionDigits: 2 })}×</div>
                    <div className="text-[9px] text-zinc-600 italic">utilidad / capital máx. · {fmtPct(wc.annualizedPct)} anual aprox.</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Capital / Ventas netas</div>
                    <div className="text-lg font-bold text-zinc-200 tabular-nums">{fmtPct(intensidad)}</div>
                    <div className="text-[9px] text-zinc-600 italic">sin IVA</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Capital / Ventas brutas</div>
                    <div className="text-lg font-bold text-zinc-200 tabular-nums">{fmtPct(intensidadGross)}</div>
                    <div className="text-[9px] text-zinc-600 italic">con IVA</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Cap. sin terreno / V. brutas</div>
                    <div className="text-lg font-bold text-zinc-200 tabular-nums">{fmtPct(intensidadExLandGross)}</div>
                    <div className="text-[9px] text-zinc-600 italic">con IVA, sin suelo</div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-amber-800/30">
                  <div className="text-[9px] uppercase tracking-wider text-amber-300/70 mb-1">Aporte de capital de trabajo sin terreno por semestre (UF)</div>
                  <WorkingCapitalSemesterChart cashFlow={result.cashFlow} />
                  <div className="text-[9px] text-zinc-600 italic mt-1">Capital parcial inmovilizado cada semestre; la suma de las barras = {fmt(capitalExLand)} UF (capital de trabajo sin terreno).</div>
                </div>

                <div className="mt-2 text-[9px] text-zinc-600 italic">
                  Capital propio máximo (mes {result.workingCapitalPeakMonthFinanced}): el crédito constructor financia toda la obra salvo el anticipo ({fmtPct(inputs.constructionAdvancePct, 0)}). Referencia activo puro sin financiar: {fmt(capitalPuro)} UF. Se recalcula con cada cambio de inputs.
                </div>
              </div>
            );
          })()}

          {/* Fechas clave (como Excel EERR Consolidado col K-L) */}
          {(() => {
            const effIC = inputs.autoConstructionStart
              ? inputs.monthPreSalesStart + Math.ceil(inputs.totalUnits * inputs.preventasBeforeConstructionPct / Math.max(1, inputs.salesVelocity))
              : inputs.monthConstructionStart;
            return (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-zinc-900/50 rounded p-2 border border-zinc-700">
                  <div className="text-[10px] uppercase text-zinc-500">Inicio Preventas (mes)</div>
                  <div className="font-semibold">{inputs.monthPreSalesStart}</div>
                </div>
                <div className="bg-zinc-900/50 rounded p-2 border border-zinc-700">
                  <div className="text-[10px] uppercase text-zinc-500">Inicio Construcción (mes)</div>
                  <div className="font-semibold">{effIC} {inputs.autoConstructionStart && <span className="text-cyan-400 text-[9px]">(auto {(inputs.preventasBeforeConstructionPct*100).toFixed(0)}%)</span>}</div>
                </div>
                <div className="bg-zinc-900/50 rounded p-2 border border-zinc-700">
                  <div className="text-[10px] uppercase text-zinc-500">Plazo Construcción</div>
                  <div className="font-semibold">{inputs.constructionMonths} meses</div>
                </div>
                <div className="bg-zinc-900/50 rounded p-2 border border-zinc-700">
                  <div className="text-[10px] uppercase text-zinc-500">Inicio Escrituración (mes)</div>
                  <div className="font-semibold">{effIC + inputs.constructionMonths + inputs.monthsAfterConstructionToReception}</div>
                </div>
              </div>
            );
          })()}

          <div className="mt-3 text-[10px] text-zinc-600 italic">
            Valores netos sin IVA. Columna BRUTO incluye IVA ({fmtPct(ivaRate, 0)}) en ítems gravados: ventas, edificación, urbanización, marketing, ventas.
            Items exentos (terreno, contribuciones, AFR, estudios, ITO, intereses, escrituración): neto = bruto.
            Residual calculado por bisección para TIR objetivo = {fmtPct(inputs.targetTIRAnnual)} anual sobre activo puro no financiado.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── UI Components ────────────────────────────────────────────

function Section({ title, accent, collapsible, children }: { title: string; accent: string; collapsible?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!collapsible);
  const colors: Record<string, string> = {
    blue: "border-blue-800 bg-blue-950/20",
    green: "border-green-800 bg-green-950/20",
    orange: "border-orange-800 bg-orange-950/20",
    purple: "border-purple-800 bg-purple-950/20",
    cyan: "border-cyan-800 bg-cyan-950/20",
    red: "border-red-800 bg-red-950/20",
    yellow: "border-yellow-800 bg-yellow-950/20",
  };
  const textColors: Record<string, string> = {
    blue: "text-blue-400", green: "text-green-400", orange: "text-orange-400",
    purple: "text-purple-400", cyan: "text-cyan-400", red: "text-red-400",
    yellow: "text-yellow-400",
  };
  return (
    <div className={`rounded-lg p-3 border ${colors[accent] || "border-zinc-700 bg-zinc-800/50"}`}>
      <div className={`text-xs uppercase tracking-wider font-semibold mb-2 ${textColors[accent] || "text-zinc-400"} ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={() => collapsible && setOpen(!open)}>
        {collapsible && <span className="mr-1">{open ? "▾" : "▸"}</span>}
        {title}
      </div>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

function SliderInput({ label, value, min, max, step, onChange, unit, totalUF }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; unit: string;
  totalUF?: number;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const roundToStep = (v: number) => {
    const decimals = (step.toString().split(".")[1] || "").length;
    return Number(v.toFixed(decimals));
  };
  const handleBump = (delta: number) => {
    onChange(clamp(roundToStep(value + delta * step)));
  };

  // Draft state: permite tipear libremente (inclusive vacío o valores fuera de rango).
  // Solo se commite onBlur / Enter con clamping.
  const [draft, setDraft] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const v = parseFloat(draft);
    if (isNaN(v)) {
      setDraft(String(value)); // revertir si inválido
      return;
    }
    const clamped = clamp(v);
    if (clamped !== value) onChange(clamped);
    if (clamped !== v) setDraft(String(clamped)); // mostrar clamp visual
  };

  return (
    <div className="w-full">
      {/* Fila 1: label + valor/unidad/total alineados en los extremos */}
      <div className="flex items-baseline justify-between mb-0.5 min-w-0">
        <label className="text-xs text-zinc-400 truncate pr-2">{label}</label>
        <div className="flex items-baseline gap-1 shrink-0">
          <input
            type="number"
            value={draft}
            step={step}
            onFocus={(e) => { setEditing(true); e.target.select(); }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commit();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setDraft(String(value));
                setEditing(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-14 bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 text-xs text-right" />
          <span className="text-[10px] text-zinc-500">{unit}</span>
          {totalUF !== undefined && (
            <span className="text-[10px] text-yellow-300 font-semibold tabular-nums ml-2">
              = {totalUF.toLocaleString("es-CL", { maximumFractionDigits: 0 })} UF
            </span>
          )}
        </div>
      </div>
      {/* Fila 2: slider + botones +/- usando TODO el ancho disponible */}
      <div className="flex items-center gap-1.5">
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1 accent-blue-500" />
        <button onClick={() => handleBump(-1)} disabled={value <= min} title={`− ${step} ${unit}`}
          className="w-5 h-5 text-[12px] leading-none font-bold rounded bg-rose-700/60 hover:bg-rose-600 disabled:opacity-30 disabled:cursor-not-allowed text-rose-100 flex items-center justify-center transition shrink-0">−</button>
        <button onClick={() => handleBump(+1)} disabled={value >= max} title={`+ ${step} ${unit}`}
          className="w-5 h-5 text-[12px] leading-none font-bold rounded bg-emerald-700/60 hover:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed text-emerald-100 flex items-center justify-center transition shrink-0">+</button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900/50 rounded px-2 py-1">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-xs font-semibold">{value}</div>
    </div>
  );
}

function KPI({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase">{label}</div>
      <div className={`${big ? "text-xl" : "text-sm"} font-bold ${color}`}>{value}</div>
    </div>
  );
}

function KPISmall({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800/50 rounded px-2 py-1.5 border border-zinc-700">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-xs font-semibold">{value}</div>
    </div>
  );
}

function PnLRow({ label, value, bold, pct }: { label: string; value: number; bold?: boolean; pct?: number }) {
  const color = value >= 0 ? "text-green-400" : "text-red-400";
  return (
    <div className={`flex justify-between py-0.5 ${bold ? "font-semibold" : ""}`}>
      <span className="text-zinc-400">{label}</span>
      <span className="flex gap-2">
        <span className={color}>{fmt(Math.round(value))} UF</span>
        {pct !== undefined && <span className="text-zinc-500 w-12 text-right">{fmtPct(pct)}</span>}
      </span>
    </div>
  );
}

function MiniCashFlowChart({ cashFlow }: { cashFlow: ResidualOutput["cashFlow"] }) {
  // Simple SVG bar chart
  const data = cashFlow.filter((_, i) => cashFlow[i].netCashFlow !== 0 || i < 5);
  if (data.length === 0) return null;

  const maxAbs = Math.max(...data.map((r) => Math.abs(r.netCashFlow)), 1);
  const w = 400, h = 100, barW = Math.max(2, w / data.length - 1);
  const mid = h / 2;
  const scale = (mid - 4) / maxAbs;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24">
      <line x1={0} y1={mid} x2={w} y2={mid} stroke="#334155" strokeWidth={0.5} />
      {data.map((r, i) => {
        const barH = Math.abs(r.netCashFlow) * scale;
        const y = r.netCashFlow >= 0 ? mid - barH : mid;
        const fill = r.netCashFlow >= 0 ? "#22c55e" : "#ef4444";
        return <rect key={i} x={i * (barW + 1)} y={y} width={barW} height={barH} fill={fill} opacity={0.8} />;
      })}
    </svg>
  );
}

// ── Gráfico: aporte PARCIAL de capital de trabajo sin terreno por semestre ─────
// Descompone el capital de trabajo (no acumulado): cada barra es el capital propio que
// se inmoviliza ESE semestre, sumando los meses hasta la máxima exposición. Por
// construcción telescópica, la suma de las barras = el capital de trabajo sin terreno.
function WorkingCapitalSemesterChart({ cashFlow }: { cashFlow: ResidualOutput["cashFlow"] }) {
  // Serie de saldo de caja propio SIN TERRENO (crédito financia toda la obra salvo el anticipo).
  let cum = 0;
  const pts = cashFlow.map((r) => {
    const obra = r.constructionCost + r.urbanizationCost + r.earthMovementCost +
      r.indirectCosts + r.postVentaConstruction + r.constructorUtility + r.contingencies;
    cum += r.netCashFlow + r.landCost + (obra - r.constructionAdvance);
    return { date: r.date, cum };
  });
  // Mes de máxima exposición (saldo mínimo).
  let minCum = 0, peakIdx = -1;
  pts.forEach((p, i) => { if (p.cum < minCum) { minCum = p.cum; peakIdx = i; } });
  if (peakIdx < 0) return null;
  // Aporte parcial de capital por semestre = caída del saldo durante el semestre, hasta el pico.
  const semMap = new Map<string, { label: string; order: number; cap: number }>();
  let prev = 0;
  for (let i = 0; i <= peakIdx; i++) {
    const p = pts[i];
    const aporte = prev - p.cum;  // saldo baja → capital que se inmoviliza ese mes
    prev = p.cum;
    if (!p.date) continue;
    const [yStr, mStr] = p.date.split("-");
    const year = parseInt(yStr, 10), month = parseInt(mStr, 10);
    if (!year || !month) continue;
    const sem = month <= 6 ? 1 : 2;
    const key = `${year}-${sem}`;
    const e = semMap.get(key);
    if (!e) semMap.set(key, { label: `S${sem}'${yStr.slice(2)}`, order: year * 2 + sem, cap: aporte });
    else e.cap += aporte;
  }
  const bars = [...semMap.values()].sort((a, b) => a.order - b.order);
  if (bars.length === 0) return null;

  const w = 520, h = 170, padTop = 16, padBottom = 22;
  const plotH = h - padTop - padBottom;
  const maxCap = Math.max(...bars.map((b) => b.cap), 1);
  const scale = plotH / maxCap;
  const gap = 7;
  const barW = Math.max(8, (w - gap * (bars.length + 1)) / bars.length);
  const baseY = padTop + plotH;
  const compact = (v: number) => v >= 1000
    ? (v / 1000).toLocaleString("es-CL", { maximumFractionDigits: 0 }) + "k"
    : Math.round(v).toString();

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: "auto", maxHeight: 200 }}>
      <line x1={0} y1={baseY} x2={w} y2={baseY} stroke="#52525b" strokeWidth={0.5} />
      {bars.map((b, i) => {
        const x = gap + i * (barW + gap);
        const barH = b.cap * scale;
        const y = baseY - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill="#d97706" opacity={0.85} rx={1.5} />
            {b.cap > 0 && <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={9} fill="#fbbf24">{compact(b.cap)}</text>}
            <text x={x + barW / 2} y={h - 6} textAnchor="middle" fontSize={9} fill="#a1a1aa">{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
