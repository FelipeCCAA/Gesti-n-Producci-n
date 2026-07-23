/* ============================================================
   Lógica — Gestión Productiva Planta CCAA (leche en polvo y crema)
   ============================================================ */

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

function esc(t) {
  if (t === null || t === undefined) return "";
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function num(n) { return (Number(n) || 0).toLocaleString("es-CL"); }
function numDec(n, d = 2) { return n === null || n === undefined || n === "" ? "—" : Number(n).toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: d }); }

function claseEstado(e) {
  const m = {
    "Conforme": "ok", "Liberada": "ok", "Liberado": "ok", "Negativo": "ok",
    "En proceso": "info", "En revisión": "info", "Pendiente": "warn",
    "Retenida": "bad", "No conforme": "bad", "Positivo": "bad",
    "Sin control": "muted", "Sin especificación": "muted"
  };
  return m[e] || "muted";
}
function badge(t) { return `<span class="badge ${claseEstado(t)}">${esc(t)}</span>`; }

/* ---------- Evaluación de calidad (mismo criterio que la semilla) ---------- */
function evaluarCalidad(r) {
  const esp = obtenerDatos().catalogos.especificaciones[r.producto];
  if (!esp) return "Sin especificación";
  let hay = false, ok = true;
  const mapa = { humedad: "humedad", mg: "mg", sng: "sng", st: "st", acidez: "acidez", ph: "ph", temperatura: "temperatura" };
  for (const k of Object.keys(esp)) {
    const campo = mapa[k] || k;
    const v = r[campo];
    if (v === null || v === undefined || v === "") continue;
    hay = true;
    const [lo, hi] = esp[k];
    if (!(v >= lo && v <= hi)) ok = false;
  }
  if (!hay) return "Sin control";
  return ok ? "Conforme" : "No conforme";
}

/* ---------- Navegación ---------- */
function irAModulo(id) {
  $$(".vista").forEach(v => v.classList.toggle("activa", v.id === "vista-" + id));
  $$(".nav-item").forEach(n => n.classList.toggle("activo", n.dataset.modulo === id));
  const t = {
    dashboard: "Panel general", produccion: "Producción — polvo y crema",
    recepcion: "Recepción y trazabilidad de silos", liberacion: "Liberación de producto (Calidad)",
    maestros: "Maestros — camiones y transportistas"
  };
  $("#titulo-vista").textContent = t[id] || "";
  $("#btn-nueva-orden").style.display = (id === "produccion" || id === "dashboard") ? "" : "none";
  window.scrollTo(0, 0);
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const d = obtenerDatos();
  const p = d.produccion;

  const kgTotal = p.reduce((s, r) => s + (Number(r.kg) || 0), 0);
  const conCtrl = p.filter(r => ["Conforme", "No conforme"].includes(r.resultadoCalidad || evaluarCalidad(r)));
  const noConf = p.filter(r => (r.resultadoCalidad || evaluarCalidad(r)) === "No conforme").length;
  const pctConf = conCtrl.length ? Math.round((conCtrl.length - noConf) / conCtrl.length * 100) : 0;

  const litrosSilos = d.recepcion.reduce((s, r) => s + (Number(r.litros) || 0), 0);
  const recRetenidas = d.recepcion.filter(r => r.estado === "Retenida").length;
  const libPend = d.liberaciones.filter(l => l.estado !== "Liberado").length;

  const kpis = [
    { etq: "Kg producidos (muestra)", val: num(Math.round(kgTotal)) + " kg", det: `${p.length} lotes registrados`, tono: "ok" },
    { etq: "Cumplimiento de parámetros", val: pctConf + "%", det: `${noConf} lotes no conformes`, tono: noConf ? "warn" : "ok" },
    { etq: "Litros recepcionados", val: num(Math.round(litrosSilos)) + " L", det: `${d.recepcion.length} recepciones en silos`, tono: "info" },
    { etq: "Recepciones retenidas", val: recRetenidas, det: `por control de calidad`, tono: recRetenidas ? "bad" : "ok" },
    { etq: "Liberaciones pendientes", val: libPend, det: `de ${d.liberaciones.length} lotes`, tono: libPend ? "warn" : "ok" }
  ];
  $("#kpis").innerHTML = kpis.map(k => `
    <div class="kpi kpi-${k.tono}">
      <div class="kpi-valor">${k.val}</div>
      <div class="kpi-etiqueta">${esc(k.etq)}</div>
      <div class="kpi-detalle">${esc(k.det)}</div>
    </div>`).join("");

  // Kg por producto
  const porProd = {};
  p.forEach(r => { porProd[r.producto] = (porProd[r.producto] || 0) + (Number(r.kg) || 0); });
  barras("#grafico-productos", porProd, " kg");

  // Kg por mandante
  const porMand = {};
  p.forEach(r => { porMand[r.mandante] = (porMand[r.mandante] || 0) + (Number(r.kg) || 0); });
  barras("#grafico-mandantes", porMand, " kg");
}

function barras(sel, obj, sufijo) {
  const entradas = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(1, ...entradas.map(e => e[1]));
  $(sel).innerHTML = entradas.map(([k, v]) => `
    <div class="barra-fila">
      <div class="barra-etq" title="${esc(k)}">${esc(k)}</div>
      <div class="barra-pista"><div class="barra" style="width:${(v / max * 100).toFixed(1)}%"></div></div>
      <div class="barra-val">${num(Math.round(v))}${sufijo}</div>
    </div>`).join("") || '<p class="vacio">Sin datos.</p>';
}

/* ---------- Producción ---------- */
function renderProduccion() {
  const d = obtenerDatos();
  const fProd = $("#filtro-producto")?.value || "todos";
  const fCal = $("#filtro-calidad")?.value || "todos";
  let filas = d.produccion.slice().reverse();
  if (fProd !== "todos") filas = filas.filter(r => r.producto === fProd);
  if (fCal !== "todos") filas = filas.filter(r => (r.resultadoCalidad || evaluarCalidad(r)) === fCal);

  const cols = ["Fecha", "Producto", "Mandante", "Lote", "GD", "Kg", "Destino", "Humedad", "M. Grasa", "ST", "Acidez", "pH", "T°", "Línea", "Calidad"];
  const html = filas.map(r => {
    const res = r.resultadoCalidad || evaluarCalidad(r);
    return `<tr class="${res === "No conforme" ? "fila-alerta" : ""}">
      <td>${esc(r.fecha)}</td>
      <td>${esc(r.producto)}</td>
      <td>${esc(r.mandante)}</td>
      <td class="mono">${esc(r.lote || "—")}</td>
      <td class="mono">${esc(r.gd || "—")}</td>
      <td>${numDec(r.kg, 0)}</td>
      <td>${esc(r.destino || "—")}</td>
      <td>${numDec(r.humedad)}</td>
      <td>${numDec(r.mg)}</td>
      <td>${numDec(r.st)}</td>
      <td>${numDec(r.acidez)}</td>
      <td>${numDec(r.ph)}</td>
      <td>${numDec(r.temperatura)}</td>
      <td>${esc(r.linea || "—")}</td>
      <td>${badge(res)}</td>
    </tr>`;
  }).join("");
  $("#tabla-produccion").innerHTML = tabla(cols, filas, html);
}

/* ---------- Recepción / silos ---------- */
function renderRecepcion() {
  const d = obtenerDatos();
  const cols = ["Recepción", "Fecha", "Silo/TK", "Procedencia", "Tipo", "Litros", "Camión", "Operador", "Turno", "T°", "Acidez", "pH", "Delvo", "Inhib.", "Destino", "Estado"];
  const html = d.recepcion.map(r => `<tr class="${r.estado === "Retenida" ? "fila-alerta" : ""}">
      <td class="mono">${esc(r.id)}</td>
      <td>${esc(r.fecha)}</td>
      <td>${esc(r.silo)}</td>
      <td>${esc(r.procedencia)}</td>
      <td>${esc(r.tipoLeche)}</td>
      <td>${numDec(r.litros, 0)}</td>
      <td class="mono">${esc(r.camion)}</td>
      <td>${esc(r.operador)}</td>
      <td>${esc(r.turno)}</td>
      <td>${numDec(r.temperatura)}</td>
      <td>${numDec(r.acidez)}</td>
      <td>${numDec(r.ph)}</td>
      <td>${badge(r.delvoTest)}</td>
      <td>${badge(r.inhibidores)}</td>
      <td>${esc(r.destino)}</td>
      <td>${badge(r.estado)}</td>
    </tr>`).join("");
  $("#tabla-recepcion").innerHTML = tabla(cols, d.recepcion, html);

  // Resumen ocupación de silos (litros por silo/TK)
  const porSilo = {};
  d.recepcion.forEach(r => { porSilo[r.silo] = (porSilo[r.silo] || 0) + (Number(r.litros) || 0); });
  barras("#grafico-silos", porSilo, " L");
}

/* ---------- Liberación / calidad ---------- */
function renderLiberacion() {
  const d = obtenerDatos();
  const cont = $("#lista-liberaciones");
  cont.innerHTML = d.liberaciones.map((l, idx) => {
    const total = l.checklist.length;
    const hechos = l.checklist.filter(c => c.completado).length;
    const pct = total ? Math.round(hechos / total * 100) : 0;
    const items = l.checklist.map((c, j) => `
      <li class="chk ${c.completado ? "hecho" : ""}">
        <label><input type="checkbox" data-lib="${idx}" data-doc="${j}" ${c.completado ? "checked" : ""}/> ${esc(c.documento)}</label>
      </li>`).join("");
    return `<div class="card lib-card">
      <div class="lib-head">
        <div>
          <h3>${esc(l.lote)} · ${esc(l.producto)}</h3>
          <p class="card-sub">${esc(l.fecha)} · Especialista: ${esc(l.especialista)}</p>
        </div>
        <div class="lib-estado">${badge(l.estado)}<div class="lib-pct">${hechos}/${total} docs · ${pct}%</div></div>
      </div>
      <div class="mini-pista grande"><div class="mini-barra" style="width:${pct}%"></div></div>
      <details><summary>Ver checklist de liberación</summary><ul class="chklist">${items}</ul>
        <div class="lib-acciones">
          <button class="btn btn-pri btn-sm" data-liberar="${idx}" ${pct < 100 ? "disabled" : ""}>Autorizar despacho</button>
          ${pct < 100 ? '<span class="nota-inline">Complete todos los documentos para liberar.</span>' : ''}
        </div>
      </details>
    </div>`;
  }).join("");

  $$('#lista-liberaciones input[type=checkbox]').forEach(cb => cb.addEventListener("change", ev => {
    const li = +ev.target.dataset.lib, doc = +ev.target.dataset.doc;
    d.liberaciones[li].checklist[doc].completado = ev.target.checked;
    const l = d.liberaciones[li];
    const pct = l.checklist.filter(c => c.completado).length / l.checklist.length;
    if (pct < 1 && l.estado === "Liberado") l.estado = "En revisión";
    guardarDatos(); renderLiberacion();
  }));
  $$('#lista-liberaciones [data-liberar]').forEach(b => b.addEventListener("click", ev => {
    const i = +ev.target.dataset.liberar;
    d.liberaciones[i].estado = "Liberado";
    guardarDatos(); renderLiberacion(); renderDashboard();
  }));
}

/* ---------- Maestros ---------- */
function renderMaestros() {
  const d = obtenerDatos();
  const cols = ["Vehículo", "Placa", "Tipo", "Transportista", "Capacidad (L)", "Chofer A.M.", "Chofer P.M."];
  const html = d.maestros.map(m => `<tr>
      <td class="mono">${esc(m.vehiculo || "—")}</td>
      <td class="mono">${esc(m.placa || "—")}</td>
      <td>${esc(m.tipo || "—")}</td>
      <td>${esc(m.transportista || "—")}</td>
      <td>${numDec(m.capacidad, 0)}</td>
      <td>${esc(m.choferAM || "—")}</td>
      <td>${esc(m.choferPM || "—")}</td>
    </tr>`).join("");
  $("#tabla-maestros").innerHTML = tabla(cols, d.maestros, html);
}

/* ---------- Tabla genérica ---------- */
function tabla(cols, filas, html) {
  const th = "<tr>" + cols.map(c => `<th>${esc(c)}</th>`).join("") + "</tr>";
  const body = filas.length ? html : `<tr><td class="vacio" colspan="${cols.length}">Sin registros.</td></tr>`;
  return `<table class="tabla"><thead>${th}</thead><tbody>${body}</tbody></table>`;
}

/* ---------- Re-render ---------- */
function renderTodo() {
  renderDashboard(); renderProduccion(); renderRecepcion(); renderLiberacion(); renderMaestros();
}

/* ---------- Modal nuevo lote de producción ---------- */
function abrirModal() {
  const d = obtenerDatos();
  const sel = $("#form-producto select[name=producto]");
  sel.innerHTML = d.catalogos.productos.map(p => `<option>${esc(p)}</option>`).join("");
  const selL = $("#form-producto select[name=linea]");
  selL.innerHTML = d.catalogos.lineas.map(l => `<option>${esc(l)}</option>`).join("");
  const selD = $("#form-producto select[name=destino]");
  selD.innerHTML = d.catalogos.destinos.map(x => `<option>${esc(x)}</option>`).join("");
  $("#modal-orden").classList.add("abierto");
}
function cerrarModal() { $("#modal-orden").classList.remove("abierto"); $("#form-producto").reset(); }

function guardarLote(ev) {
  ev.preventDefault();
  const d = obtenerDatos();
  const f = ev.target;
  const g = n => { const v = f[n].value; return v === "" ? null : (isNaN(v) ? v : Number(v)); };
  const mandFrom = p => { p = (p || "").toUpperCase(); if (p.includes("NESTL")) return "Nestlé"; if (p.includes("COLUN")) return "Colun"; if (p.includes("CCAA")) return "CCAA"; return "CCAA"; };
  const r = {
    semana: g("semana"), anio: Number(f.fecha.value.slice(0, 4)) || null,
    fecha: f.fecha.value, producto: f.producto.value, mandante: mandFrom(f.producto.value),
    oc: g("oc"), gd: g("gd"), kg: g("kg"), bolsas: g("bolsas"),
    destino: f.destino.value, op: g("op"), lote: f.lote.value.trim(),
    humedad: g("humedad"), mg: g("mg"), sng: g("sng"), st: g("st"),
    acidez: g("acidez"), ph: g("ph"), temperatura: g("temperatura"),
    pesoEsp: null, proteina: null, vencimiento: null,
    linea: f.linea.value, horaInicio: "", horaTermino: "", observacion: f.observacion.value.trim()
  };
  if (!r.fecha || !r.producto) { alert("Fecha y producto son obligatorios."); return; }
  r.resultadoCalidad = evaluarCalidad(r);
  d.produccion.push(r);
  guardarDatos(); cerrarModal(); irAModulo("produccion"); renderTodo();
}

/* ---------- Importar ---------- */
function manejarImportar(ev) {
  const a = ev.target.files[0]; if (!a) return;
  importarJSON(a).then(r => { renderTodo(); alert("Datos importados: " + r.colecciones.join(", ")); })
    .catch(e => alert("Error al importar: " + e.message)).finally(() => { ev.target.value = ""; });
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  cargarDatos();
  const d = obtenerDatos();

  // Filtros de producción
  const selP = $("#filtro-producto");
  selP.innerHTML = '<option value="todos">Todos los productos</option>' + d.catalogos.productos.map(p => `<option>${esc(p)}</option>`).join("");

  $$(".nav-item").forEach(b => b.addEventListener("click", () => irAModulo(b.dataset.modulo)));
  $("#filtro-producto")?.addEventListener("change", renderProduccion);
  $("#filtro-calidad")?.addEventListener("change", renderProduccion);
  $("#btn-nueva-orden")?.addEventListener("click", abrirModal);
  $("#btn-cerrar-modal")?.addEventListener("click", cerrarModal);
  $("#btn-cancelar-modal")?.addEventListener("click", cerrarModal);
  $("#form-producto")?.addEventListener("submit", guardarLote);
  $("#btn-exportar")?.addEventListener("click", () => exportarJSON("gestion-productiva-ccaa.json"));
  $("#input-importar")?.addEventListener("change", manejarImportar);
  $("#btn-restablecer")?.addEventListener("click", () => {
    if (confirm("¿Restablecer todos los datos a los valores de ejemplo? Se perderán los cambios locales.")) { restablecerDatos(); renderTodo(); }
  });

  renderTodo();
  irAModulo("dashboard");
});
