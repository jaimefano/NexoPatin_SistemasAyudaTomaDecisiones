import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { postCandidatas } from './api.js'
import { useEvaluacion } from './hooks.js'
import { useSesion } from './store.jsx'
import { LETRAS, RUTA_VACIA, ZONAS, claveTarea, nombrePlan, nTareasRuta, num } from './utils.js'
import { IconDeshacer, IconFlecha, IconChevron, Boton, Cabecera, Insignia, Selector, Tarjeta, Logo } from './components/ui.jsx'
import MapView, { MiniMapa } from './components/MapView.jsx'
import Kpis from './components/Kpis.jsx'
import Tabla, { ordenInicial } from './components/Tabla.jsx'
import Dispersion from './components/Scatter.jsx'
import ZonePanel from './components/ZonePanel.jsx'
import { PlanCamiones, FilaCamiones, MiniCamiones } from './components/Camiones.jsx'
import { Anadir } from './pages.jsx'

const FILTROS = { q: '', tipo: 'Todos', zona: 'Todas', camion: 'Todos', incumplen: true }
const MAPA_MAX = 800, MAPA_MIN = 380, FRANJA_ALTO = 88, RESTO_BLOQUE = 182   // el mapa se pliega 1 px por cada px de scroll
// El mapa desplegado se adapta a la altura de la ventana (cabecera + tarjeta superior + KPI ocupan ~470 px)
// (la aplicación se dibuja con zoom --escala: la altura de la ventana se pasa a px de la página)
const escala = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--escala')) || 1
const altoMapa = () => Math.max(MAPA_MIN, Math.min(MAPA_MAX, window.innerHeight / escala() - 470))
const completa = (ruta) => ({ ...RUTA_VACIA, ...ruta })

function reductor(s, a) {
  switch (a.t) {
    case 'set': return { ...s, ...a.v }
    case 'filtros': return { ...s, filtros: { ...s.filtros, ...a.v } }
    case 'sel': return { ...s, sel: s.sel ? { ...s.sel, ...a.v } : s.sel }
    default: return s
  }
}

// Paso 2 (opcional): Plan propio. Es el constructor guiado de la v1 (mapa, panel de zona Cambiar/Reubicar, tareas candidatas)
// con una tarjeta superior: hueco de la bandeja, "Partir de", Deshacer, Descartar y Guardar.
export default function PlanPropio({ estado, mapa, etiqueta, pasos, ir }) {
  const { s: ses, set: setSes, guardarPropio } = useSesion()
  const [s, d] = useReducer(reductor, { vista: 'constructor', sel: null, hover: null, marcada: null, filtros: FILTROS, plegado: false, capa: 'Estado de la flota', ejes: { x: 'beneficio', y: 'perdidos' } })
  const [datos, setDatos] = useState(null)   // { base, candidatas }
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const set = useCallback((v) => d({ t: 'set', v }), [])
  const ruta = completa(ses.propio.ruta)
  const historial = ses.propio.historial
  const limites = ses.limites
  const nTareas = nTareasRuta(ruta)

  // Hueco donde se guardará: el primero libre (o el C si están los tres ocupados); el jefe puede cambiarlo
  const primeroLibre = ses.bandeja.findIndex((p) => !p)
  const hueco = ses.propio.hueco ?? (primeroLibre >= 0 ? primeroLibre : 2)
  const setPropio = (v) => setSes((o) => ({ propio: { ...o.propio, ...v } }))
  const cambiarRuta = (nueva, extra = {}) => setSes((o) => ({ propio: { ...o.propio, ruta: nueva, historial: [...o.propio.historial, o.propio.ruta], partirAntes: [...(o.propio.partirAntes || []), o.propio.partir], ...extra } }))
  const anadirTarea = (camion, tarea) => {
    cambiarRuta({ ...ruta, [camion]: [...ruta[camion], tarea] })
    d({ t: 'set', v: { sel: null, hover: null, marcada: null, filtros: { ...s.filtros, zona: 'Todas' } } })
  }
  const deshacer = () => {
    if (!historial.length) return
    const pa = ses.propio.partirAntes || []      // "Partir de" que había antes de ese cambio (para que el selector no quede desfasado)
    setPropio({ ruta: historial[historial.length - 1], historial: historial.slice(0, -1), partirAntes: pa.slice(0, -1), partir: pa.length ? pa[pa.length - 1] : ses.propio.partir })
    d({ t: 'set', v: { sel: null, hover: null, marcada: null } })
  }
  const partirDe = (v) => {
    if (v === ses.propio.partir) return   // sin diálogo: la ruta anterior se recupera con Deshacer
    if (v === 'cero') cambiarRuta(RUTA_VACIA, { partir: 'cero' })
    else cambiarRuta(completa(ses.bandeja[Number(v)].ruta), { partir: v })
    d({ t: 'set', v: { sel: null, hover: null, marcada: null } })
  }
  const [confDescartar, setConfDescartar] = useState(false)   // confirmación en línea (sin diálogo del navegador)
  useEffect(() => {
    if (!confDescartar) return
    const h = setTimeout(() => setConfDescartar(false), 5000)
    return () => clearTimeout(h)
  }, [confDescartar])
  const descartar = () => {
    if (nTareas > 0 && !confDescartar) { setConfDescartar(true); return }
    setConfDescartar(false)
    setPropio({ ruta: RUTA_VACIA, historial: [], hueco: null, partir: 'cero' }); ir('/opciones')
  }
  const guardar = () => {
    if (nTareas === 0) return
    guardarPropio(hueco, ruta)
    ir('/opciones')
  }

  // Candidatas de la ruta actual (la lógica vive en el servidor: Sistema/sugerencias.py)
  const n = useRef(0)
  useEffect(() => {
    if (!estado) return
    const mio = ++n.current
    const h = setTimeout(() => setCargando(true), 300)
    postCandidatas(ruta, limites)
      .then((r) => { if (mio === n.current) setDatos({ base: r.base, candidatas: ordenInicial(r.candidatas) }) })
      .catch((e) => setError(e.message))
      .finally(() => { clearTimeout(h); if (mio === n.current) setCargando(false) })
    return () => clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, JSON.stringify(ruta), limites])

  // ---- Plegado del mapa dirigido por el scroll (scroll-driven): sin estados ni saltos ----
  // progreso p (0 = mapa desplegado, 1 = franja de 88 px) = recorrido del scroll una vez el bloque queda fijo.
  // Se escriben los estilos directamente en el DOM (sin re-render) en cada frame.
  const bloqueRef = useRef(null), tablaRef = useRef(null), hRef = useRef(null), filaRef = useRef(null), seccionRef = useRef(null), capaMapaRef = useRef(null), capaFranjaRef = useRef(null)
  const listo = !!datos
  useEffect(() => {
    if (s.vista !== 'constructor' || !listo) return
    let raf = 0, compactoAntes = null   // null: fuerza a sincronizar s.plegado al montar
    const clamp = (v) => Math.max(0, Math.min(1, v))
    const aplicar = () => {
      raf = 0
      if (!hRef.current || !seccionRef.current) return
      const y = window.scrollY / escala()   // el scroll va en px de pantalla; la maqueta, en px de página (zoom)
      const inicio = hRef.current.offsetTop + hRef.current.offsetHeight
      const MAPA_ALTO = altoMapa(), RECORRIDO = MAPA_ALTO - FRANJA_ALTO
      const p = clamp((y - inicio) / RECORRIDO)
      const q = clamp((y - inicio) / 60)
      seccionRef.current.style.height = MAPA_ALTO - (MAPA_ALTO - FRANJA_ALTO) * p + 'px'
      capaMapaRef.current.style.opacity = clamp(1 - p / 0.5)
      capaMapaRef.current.style.pointerEvents = p < 0.3 ? 'auto' : 'none'
      capaFranjaRef.current.style.opacity = clamp((p - 0.5) / 0.4)
      capaFranjaRef.current.style.pointerEvents = p > 0.8 ? 'auto' : 'none'
      filaRef.current.style.height = 52 * q + 'px'
      filaRef.current.style.opacity = q
      // altura mínima para que siempre haya recorrido de scroll suficiente para plegar el mapa del todo (también con zoom)
      if (bloqueRef.current?.parentElement) bloqueRef.current.parentElement.style.minHeight = Math.ceil(inicio + RECORRIDO + window.innerHeight / escala()) + 'px'
      if (tablaRef.current && bloqueRef.current) tablaRef.current.style.marginTop = 32 + Math.max(0, MAPA_ALTO + RESTO_BLOQUE - bloqueRef.current.offsetHeight) + 'px'
      const compacto = y > inicio
      if (compacto !== compactoAntes) { compactoAntes = compacto; set({ plegado: compacto }) }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(aplicar) }
    aplicar()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [s.vista, listo, set])
  const desplegar = useCallback(() => window.scrollTo({ top: 0, behavior: 'smooth' }), [])

  // ---- Panel de zona ----
  const base = datos?.base
  const abrirZona = (zona, extra = {}) => {
    if (!zona) { d({ t: 'set', v: { sel: null, filtros: { ...s.filtros, zona: 'Todas' } } }); return }
    const f = base.flota.zonas[zona]
    const rec = Math.min(20, f.bajos)
    d({ t: 'set', v: {
      sel: { zona, modo: 'CAMBIO', camion: 1, rep: Math.min(20, base.reserva), rec, mov: Math.min(20, f.cargados), destino: ZONAS.find((z) => z !== zona), ...extra },
      filtros: { ...s.filtros, zona }, hover: null,
    } })
    if (window.scrollY > 40) desplegar()
  }
  const abrirDesdeCandidata = (c) => {
    const t = c.tarea
    d({ t: 'set', v: { marcada: claveTarea(c.camion, t) } })
    abrirZona(t[1], t[0] === 'CAMBIO' ? { modo: 'CAMBIO', camion: c.camion, rep: t[2], rec: t[3] } : { modo: 'REUBICAR', camion: c.camion, mov: t[3], destino: t[2] })
  }

  const tareaSel = s.sel ? (s.sel.modo === 'CAMBIO' ? ['CAMBIO', s.sel.zona, s.sel.rep, s.sel.rec] : ['REUBICAR', s.sel.zona, s.sel.destino, s.sel.mov]) : null
  const { ev, cargando: cargandoEv } = useEvaluacion({ ruta, limites, camion: s.sel?.camion, tarea: tareaSel, comparar: s.sel?.modo === 'REUBICAR', activo: !!s.sel && !!base && s.vista === 'constructor' })

  // Vista previa: fila bajo el ratón > efecto en vivo del panel > fila marcada
  const marcadaCand = datos?.candidatas.find((c) => claveTarea(c.camion, c.tarea) === s.marcada)
  const preview = s.hover || (s.sel && ev && { ...ev, tarea: tareaSel }) || marcadaCand || null
  const activa = s.hover ? claveTarea(s.hover.camion, s.hover.tarea) : s.sel && tareaSel ? claveTarea(s.sel.camion, tareaSel) : s.marcada

  if (error) return <div className="p-10"><h1 className="text-2xl font-bold">No se puede conectar con el servidor</h1><p className="mt-2 text-muted">{error}</p></div>
  if (!base) return <div className="p-10 text-muted">Cargando…</div>
  const fecha = etiqueta.split(' · ')[0]

  if (s.vista === 'anadir') {
    return <Anadir estado={estado} mapa={mapa} base={base} ruta={ruta} limites={limites} capa={s.capa} setCapa={(c) => set({ capa: c })} fecha={fecha} etiqueta={etiqueta} pasos={pasos}
      onCancelar={() => set({ vista: 'constructor' })} onAnadir={(c, t) => { anadirTarea(c, t); set({ vista: 'constructor' }) }} />
  }

  const letra = LETRAS[hueco]
  const opcionesPartir = [{ valor: 'cero', texto: 'Desde cero' }, ...ses.bandeja.map((p, i) => p && { valor: String(i), texto: `${nombrePlan(p, i)} (${LETRAS[i]})` }).filter(Boolean)]
  const opcionesHueco = LETRAS.map((l, i) => ({ valor: String(i), texto: ses.bandeja[i] ? `${l} · reemplaza ${nombrePlan(ses.bandeja[i], i)}` : `${l} · libre` }))
  const botones = (
    <div className="flex items-center gap-3">
      <Boton onClick={deshacer} disabled={!historial.length} aria-label="Deshacer el último cambio de la ruta" className="disabled:opacity-50"><IconDeshacer size={18} /> Deshacer</Boton>
      {confDescartar ? (
        <span className="flex items-center gap-2 text-[13px]" role="group" aria-label="Confirmar descartar">
          <span className="text-muted">¿Descartar?</span>
          <Boton variante="borde" className="!h-9 !px-4 text-[13px]" onClick={descartar}>Sí</Boton>
          <Boton variante="borde" className="!h-9 !px-4 text-[13px]" onClick={() => setConfDescartar(false)}>No</Boton>
        </span>
      ) : <Boton onClick={descartar} aria-label="Descartar el plan propio y volver a Seleccionar">Descartar</Boton>}
      <Boton variante="primario" onClick={guardar} disabled={nTareas === 0} title={nTareas === 0 ? 'Añade al menos una tarea' : undefined} aria-label={`Guardar el plan propio en el hueco ${letra}`}>Guardar en el hueco {letra} <IconFlecha size={18} /></Boton>
    </div>
  )

  return (
    <div>
      <div ref={hRef}>
        <Cabecera titulo="Plan propio" etiqueta={etiqueta} pasos={pasos}
          miga={[{ texto: 'Planificación', onClick: () => ir('/opciones') }, { texto: `Noche del ${fecha}` }, { texto: 'Plan propio' }]} />
        <Tarjeta className="px-5 py-3 flex items-center gap-4 mb-4">
          <Insignia letra={letra} size={28} />
          <div className="leading-tight">
            <div className="font-semibold">Plan propio</div>
            <div className="text-[12.5px] text-muted">se guarda en el hueco {letra}</div>
          </div>
          <Selector plano etiqueta="Hueco" valor={String(hueco)} opciones={opcionesHueco} onChange={(v) => setPropio({ hueco: Number(v) })} />
          <Selector plano etiqueta="Partir de" valor={ses.propio.partir} opciones={opcionesPartir.length ? opcionesPartir : [{ valor: 'cero', texto: 'Desde cero' }]} onChange={partirDe} />
          <div className="ml-auto">{botones}</div>
        </Tarjeta>
        <div className="flex items-baseline justify-between mb-3 mt-1">
          <div className="text-[13px]"><b>Indicadores de la ruta actual</b> <span className="text-muted">· valor esperado de la demanda</span>
            {base.avisos.length > 0 && <span className="ml-3 text-warning-ink font-medium">⚠ {base.avisos.join(' · ')} (los límites avisan, no bloquean)</span>}</div>
          <div className="text-[13px] text-muted">Los valores a 3 días suponen que las noches 2 y 3 no sale ningún camión</div>
        </div>
      </div>

      {/* Bloque fijo: se encoge con el scroll; la tabla compensa el hueco con su margen superior (ver efecto de scroll) */}
      <div ref={bloqueRef} className="sticky top-0 z-30 bg-white pb-3 pt-1">
        <div ref={filaRef} className="overflow-hidden flex items-center justify-between gap-4" style={{ height: 0, opacity: 0 }}>
          <div className="flex items-center gap-4">
            <Logo className="text-[19px] shrink-0" /><span className="text-border-strong">|</span>
            <h1 className="text-[26px] font-bold leading-none">Plan propio</h1>
          </div>
          {botones}
        </div>
        <Kpis base={base} preview={preview} limites={limites} compact={s.plegado} cargando={cargando} />
        <div ref={seccionRef} className="relative mt-4 overflow-hidden rounded-2xl" style={{ height: altoMapa() }}>
          <div ref={capaMapaRef} className="absolute inset-0 grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 390px' }}>
            <MapView mapa={mapa} flota={base.flota} preview={preview} ruta={ruta} capa={s.capa} setCapa={(c) => set({ capa: c })}
              demandaZona={estado.demanda_zona} perdidosZona={base.perdidos_zona} zonaSel={s.sel?.zona} onZona={abrirZona} altura="100%" />
            <div className="space-y-4 overflow-hidden">
              {s.sel ? (
                <ZonePanel zona={s.sel.zona} estadoZona={base.flota.zonas[s.sel.zona]} sel={s.sel} ev={ev} base={base} ruta={ruta}
                  maxRep={Math.min(20, base.reserva)} maxRec={Math.min(20, base.flota.zonas[s.sel.zona].bajos)} maxMov={Math.min(20, base.flota.zonas[s.sel.zona].cargados)}
                  cargando={cargandoEv} onCambio={(v) => d({ t: 'sel', v })} onCerrar={() => abrirZona(null)} onAnadir={() => ev && !cargandoEv && anadirTarea(s.sel.camion, tareaSel)} />
              ) : (
                <>
                  <div className="border border-dashed border-border-strong rounded-2xl p-6 text-center">
                    <div className="font-semibold text-[16px]">Haz clic en una zona</div>
                    <div className="text-muted text-[13px] mt-1">Aquí aparecerá el menú: Cambiar o Reubicar</div>
                  </div>
                  <PlanCamiones base={base} ruta={ruta} preview={preview} />
                </>
              )}
            </div>
          </div>
          <div ref={capaFranjaRef} className="absolute inset-0" style={{ opacity: 0, pointerEvents: 'none' }}>
            <FranjaPlegada mapa={mapa} base={base} preview={preview} onDesplegar={desplegar} onZona={(z) => (z ? abrirZona(z) : desplegar())} />
          </div>
        </div>
      </div>
      {s.sel && <div className="mt-4"><FilaCamiones base={base} ruta={ruta} preview={preview} /></div>}

      <div ref={tablaRef} className="grid gap-4 items-start pb-16" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px', marginTop: 32 }}>
        <Tabla base={base} candidatas={datos.candidatas} filtros={s.filtros} setFiltros={(v) => d({ t: 'filtros', v })} activa={activa} cargando={cargando}
          onHover={(c) => set({ hover: c })} onSelect={abrirDesdeCandidata} onAnadir={(c) => anadirTarea(c.camion, c.tarea.slice())}
          mostrarAnadirPropia onAnadirPropia={() => set({ vista: 'anadir' })} />
        <div className="mt-12">
          <Dispersion candidatas={datos.candidatas} ejes={s.ejes} setEjes={(e) => set({ ejes: e })} activa={activa}
            onSelect={abrirDesdeCandidata} onHover={(c) => set({ hover: c })} alto={330} />
        </div>
      </div>
    </div>
  )
}

function FranjaPlegada({ mapa, base, preview, onDesplegar, onZona }) {
  const efecto = {}
  if (preview) {
    const t = preview.tarea
    if (t[0] === 'CAMBIO') efecto[t[1]] = [t[2], -t[3]]
    else { efecto[t[1]] = [-t[3], 0]; efecto[t[2]] = [t[3], 0] }
  }
  const chip = (z) => {
    const f = base.flota.zonas[z], e = efecto[z]
    return (
      <button key={z} onClick={(ev) => { ev.stopPropagation(); onZona(z) }} className="bg-white rounded-xl shadow-float px-3.5 py-2 text-left min-w-[96px]">
        <div className="font-semibold text-[13px]">{z}</div>
        <div className="text-[12.5px] font-semibold"><span className="text-positive">●</span> {num(f.cargados + (e ? e[0] : 0))} <span className="text-warning ml-1">●</span> {num(f.bajos + (e ? e[1] : 0))}</div>
      </button>
    )
  }
  return (
    <div role="button" tabIndex={0} aria-label="Desplegar mapa" onClick={onDesplegar} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onDesplegar()}
      className="bg-accent-bg border border-border rounded-2xl px-4 h-full flex items-center gap-3 cursor-pointer hover:border-border-strong">
      <MiniMapa mapa={mapa} />
      {ZONAS.map(chip)}
      <div className="bg-white rounded-xl shadow-float px-3.5 py-2 min-w-[96px]"><div className="font-semibold text-[13px]">Taller</div><div className="text-[12.5px] font-semibold"><span className="text-positive">●</span> {num(base.flota.taller)}</div></div>
      <div className="ml-auto flex items-center gap-6">
        <div><div className="text-[12px] text-muted mb-1.5">Camiones (360 min)</div><MiniCamiones base={base} preview={preview} /></div>
        <span className="inline-flex items-center gap-2 bg-surface-2 rounded-full h-11 px-5 font-medium">Desplegar mapa <IconChevron size={16} /></span>
      </div>
    </div>
  )
}
