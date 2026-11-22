import React, { useEffect, useMemo, useRef, useState } from 'react'
import { postPlanes, postKpisRutas } from './api.js'
import { useSesion } from './store.jsx'
import { Cabecera, Tarjeta, Camion, Boton, Recalculando, useLento, IconFlecha } from './components/ui.jsx'
import Bandeja from './components/Bandeja.jsx'
import Filtros, { valorPlan } from './components/Filtros.jsx'
import TablaPlanes, { valorOrden } from './components/TablaPlanes.jsx'
import ScatterPlanes from './components/ScatterPlanes.jsx'
import { MinimapaPlan } from './components/MapView.jsx'
import { num, textoTarea, cargadosFinales } from './utils.js'
import { Segmentado } from './CompararVistas.jsx'
import { VistaDemanda, MiniCalor } from './DemandaVista.jsx'

const PASO_FILAS = 100
let cache = { clave: null, datos: null }          // los planes del servidor (se regeneran al recargar la página)

// Paso 1: Opciones. Planes completos de la noche (tras el primer filtro simple); el jefe filtra y marca hasta 3 en la bandeja.
export default function Opciones({ estado, mapa, etiqueta, pasos, ir }) {
  const { s, set, alternar, quitar } = useSesion()
  const claveCache = JSON.stringify([s.firma ?? null, s.limites])    // la firma de la flota (si existe) invalida los planes cacheados
  const [datos, setDatos] = useState(() => (cache.clave === claveCache ? cache.datos : null))
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [intento, setIntento] = useState(0)
  const lento = useLento(cargando)
  const [hover, setHover] = useState(null)
  const [marcado, setMarcado] = useState(null)
  const [visibles, setVisibles] = useState(PASO_FILAS)
  const [aviso, setAviso] = useState(null)
  const [ampliado, setAmpliado] = useState(false)
  const [demandaAbierta, setDemandaAbierta] = useState(false)   // ventana con la demanda de mañana
  const [formatoDemanda, setFormatoDemanda] = useState('calor')
  const temporizador = useRef(0)
  useEffect(() => {
    if (!demandaAbierta) return
    const cerrar = (e) => e.key === 'Escape' && setDemandaAbierta(false)
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [demandaAbierta])
  useEffect(() => {
    if (!ampliado) return
    const cerrar = (e) => e.key === 'Escape' && setAmpliado(false)
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [ampliado])

  useEffect(() => {
    const clave = claveCache
    if (cache.clave === clave && cache.datos) { setDatos(cache.datos); setCargando(false); setError(null); return }
    let vivo = true
    setError(null); setCargando(true)          // se conservan los datos anteriores (atenuados) mientras se recalcula
    postPlanes(s.limites).then((r) => { if (vivo) { cache = { clave, datos: r }; setDatos(r); setCargando(false) } })
      .catch((e) => { if (vivo) { setError(e.message || 'Error de red'); setCargando(false) } })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveCache, intento])

  const f = s.filtros
  const filtrados = useMemo(() => {
    if (!datos) return []
    const q = f.q.trim().toLowerCase()
    return datos.planes.filter((p) => {
      if (q && !(`plan ${p.id} ${p.tareas.join(' ')}`).toLowerCase().includes(q)) return false
      if (f.tareas.length && !f.tareas.includes(p.n_tareas)) return false
      const mz = Object.entries(f.minZona || {})
      if (mz.length && estado?.cargados) { const c = cargadosFinales(estado.cargados, p.ruta); if (mz.some(([z, [lo, hi]]) => (lo != null && c[z] < lo) || (hi != null && c[z] > hi))) return false }
      for (const [m, [lo, hi]] of Object.entries(f.rangos)) {
        const v = valorPlan(m, p)
        if ((lo != null && v < lo - 1e-9) || (hi != null && v > hi + 1e-9)) return false
      }
      return true
    })
  }, [datos, f, estado])

  const ordenados = useMemo(() => {
    const l = [...filtrados]
    if (!s.orden) return l                                     // orden neutro: por identificador (ya viene así)
    const { id, desc } = s.orden
    l.sort((a, b) => {
      const va = valorOrden(id, a), vb = valorOrden(id, b)
      const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb
      return (desc ? -c : c) || a.id.localeCompare(b.id)
    })
    return l
  }, [filtrados, s.orden])
  useEffect(() => { setVisibles(PASO_FILAS) }, [f, s.orden])

  const avisar = (msg) => { setAviso(msg); clearTimeout(temporizador.current); temporizador.current = setTimeout(() => setAviso(null), 3500) }
  const alternarPlan = (p) => { const r = alternar(p); if (!r.ok) avisar(r.msg) }

  // Planes propios de la bandeja: sus KPI se piden al servidor (una vez por ruta) para pintarlos en la dispersión
  const [kpisPropios, setKpisPropios] = useState({})
  const claveRuta = (r) => JSON.stringify(r)
  const rutasPropias = s.bandeja.map((p) => (p && p.origen === 'propio' ? claveRuta(p.ruta) : null))
  const rutasPropiasClave = rutasPropias.join('|')
  useEffect(() => {
    const faltan = [...new Set(rutasPropias.filter((c) => c && !kpisPropios[c]))]
    if (!faltan.length) return
    let vivo = true
    postKpisRutas(faltan.map((c) => JSON.parse(c))).then((r) => {
      if (vivo) setKpisPropios((o) => { const n = { ...o }; faltan.forEach((c, i) => { n[c] = r.rutas[i] }); return n })
    }).catch(() => {})
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutasPropiasClave])
  const propios = useMemo(() => s.bandeja.map((p, slot) => {
    if (!p || p.origen !== 'propio') return null
    const k = kpisPropios[claveRuta(p.ruta)]
    const ts = Object.values(p.ruta || {}).flat()
    return { id: `propio:${slot}`, slot, propio: true, ruta: p.ruta, n_tareas: ts.length, kpis: k?.kpis, delta: k?.delta }
  }).filter((p) => p && p.kpis), [s.bandeja, kpisPropios])

  const previoId = hover ?? marcado
  const previo = datos?.planes.find((p) => p.id === previoId) || propios.find((p) => p.id === previoId) || null
  const nBandeja = s.bandeja.filter(Boolean).length
  // Al llevar el ratón de la tabla al botón "Ampliar" el plan bajo el cursor desaparece: se recuerda el último visto
  const [ultimoId, setUltimoId] = useState(null)
  useEffect(() => { if (previoId) setUltimoId(previoId) }, [previoId])
  const ampliable = previo || datos?.planes.find((p) => p.id === ultimoId) || propios.find((p) => p.id === ultimoId) || null

  // Teclado en la tabla: ↑/↓ mueven la fila marcada y la barra espaciadora la marca en la bandeja
  const teclas = (e) => {
    if (!ordenados.length || !['ArrowDown', 'ArrowUp', ' '].includes(e.key)) return
    e.preventDefault()
    const i = ordenados.findIndex((p) => p.id === marcado)
    if (e.key === ' ') { if (i >= 0) alternarPlan(ordenados[i]); return }
    const j = Math.max(0, Math.min(ordenados.length - 1, i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)))
    if (j >= visibles) setVisibles(j + PASO_FILAS)
    setMarcado(ordenados[j].id)
  }

  if (error) return <div className="p-10" role="alert"><h1 className="text-2xl font-bold">No se pueden cargar los planes</h1><p className="mt-2 mb-4 text-muted">{error}</p><Boton variante="primario" onClick={() => setIntento((n) => n + 1)}>Reintentar</Boton></div>

  return (
    <div className="flex flex-col min-h-[800px]" style={{ height: 'calc(100vh / var(--escala, 1) - 48px)' }}>
      <Cabecera titulo="Seleccionar para esta noche" contador={datos ? num(filtrados.length) : '…'} etiqueta={etiqueta} pasos={pasos} extra={<Recalculando activo={lento} />}
        miga={[{ texto: 'Planificación', onClick: () => ir('/opciones') }, { texto: `Noche del ${etiqueta.split(' · ')[0]}` }, { texto: 'Seleccionar' }]} />
      <Bandeja bandeja={s.bandeja} quitar={quitar} aviso={aviso} onCrear={() => ir('/plan-propio')} onComparar={() => ir('/comparar')} />

      {!datos ? (
        <Tarjeta className="p-8 flex-1 max-h-[260px]" role="status">
          <div className="font-semibold text-[17px] mb-1">Generando los planes de esta noche…</div>
          <p className="text-muted mb-4">El sistema monta muchos planes completos y descarta los que no se pueden hacer. Tarda unos segundos la primera vez.</p>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full w-1/3 rounded-full bg-accent animate-pulse" /></div>
        </Tarjeta>
      ) : (
        <>
          <Filtros planes={datos.planes} estado={estado} filtros={f} accion={<button type="button" onClick={() => ir('/limites')} className="inline-flex items-center gap-1.5 rounded-full h-10 px-4 text-[13px] font-semibold border border-border bg-white hover:border-accent transition-colors">Establecer límites a los planes <IconFlecha size={14} /></button>} setFiltros={(v) => set((o) => ({ filtros: { ...o.filtros, ...v } }))}
            resumen={<span title={`${num(datos.n_generados)} planes generados · ${num(datos.n_factibles)} tras el primer filtro`}>{num(filtrados.length)} de {num(datos.planes.length)} planes</span>} />
          <div className="grid gap-4 flex-1 min-h-0 transition-[grid-template-columns] duration-300 ease-out"
            style={{ gridTemplateColumns: `minmax(0,1fr) ${ampliado ? 'min(calc(100% - 548px), 980px)' : '360px'}` }}>
            <section className="min-h-0 flex flex-col border-y border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-cta" tabIndex={0} onKeyDown={teclas} aria-label="Tabla de planes (flechas arriba y abajo para moverte, barra espaciadora para marcar en la bandeja)">
              <TablaPlanes cargando={cargando} compacta={ampliado} planes={ordenados} nada={datos.nada} bandeja={s.bandeja} previoId={previoId} marcadoId={marcado}
                onHover={setHover} onMarcar={setMarcado} onAlternar={alternarPlan} orden={s.orden} setOrden={(o) => set({ orden: o })}
                visibles={visibles} masVisibles={() => setVisibles((v) => v + PASO_FILAS)} />
            </section>
            <div className="flex flex-col gap-4 min-h-0">
              <button type="button" onClick={() => setDemandaAbierta(true)} aria-haspopup="dialog" aria-label="Ver la demanda de mañana por zona y hora"
                className="group shrink-0 flex items-center gap-3 h-12 rounded-2xl border-[3px] border-cta bg-white hover:border-cta-hover px-3 text-[14px] font-semibold transition-colors">
                <MiniCalor className="w-[88px] h-[28px] rounded-md overflow-hidden shrink-0" />
                <span className="flex-1 text-left">Demanda de mañana</span>
                <IconFlecha size={16} className="text-muted group-hover:text-ink" />
              </button>
              {/* Ampliada: la columna se ensancha empujando la tabla, y la tarjeta ocupa todo el alto con el mapa y los camiones */}
              {(() => {
                const vp = ampliado ? ampliable : previo          // ampliada: se conserva el último plan visto al mover el ratón
                return (
                  <Tarjeta className={`px-5 py-4 flex flex-col min-h-0 ${ampliado ? 'flex-1' : ''}`}>
                    <div className="flex items-center justify-between mb-2.5">
                      <h3 className="text-[17px] font-semibold">Vista previa{vp ? (vp.propio ? ' · Plan propio' : ` · Plan ${vp.id}`) : ''}</h3>
                      <button type="button" onClick={() => setAmpliado(!ampliado)} disabled={!ampliado && !ampliable} aria-expanded={ampliado}
                        aria-label={ampliado ? 'Reducir la vista previa' : 'Ampliar el mapa de la vista previa'}
                        className="rounded-full px-3 py-1 text-[12.5px] font-medium bg-surface-2 hover:bg-border disabled:opacity-40 disabled:cursor-default">{ampliado ? 'Reducir' : 'Ampliar'}</button>
                    </div>
                    <div className={ampliado ? 'flex gap-5 flex-1 min-h-0' : ''}>
                      <div className={ampliado ? 'flex-1 min-w-0 flex flex-col' : ''}>
                        <MinimapaPlan mapa={mapa} ruta={vp?.ruta} detalle={ampliado} color={ampliado ? undefined : '#000000'} className={ampliado ? 'w-full flex-1 min-h-0' : 'w-full h-[135px]'} />
                        <div className="text-[12.5px] text-muted mt-2 h-[36px] overflow-hidden leading-[18px]">{vp ? `${vp.n_tareas} ${vp.n_tareas === 1 ? 'tarea' : 'tareas'}${vp.minutos != null ? ` · ${num(vp.minutos)} min de camión` : ''}` : 'Pasa el ratón por un plan o un punto para ver sus tareas en el mapa.'}</div>
                      </div>
                      {ampliado && (
                        <div className="w-[270px] shrink-0 overflow-auto space-y-4 pr-1">
                          {[1, 2, 3, 4].map((c) => {
                            const ts = vp?.ruta?.[c] || []
                            return (
                              <div key={c}>
                                <div className="flex items-center gap-2 mb-1"><Camion n={c} /><span className="font-semibold text-[13.5px]">Camión {c}</span></div>
                                {ts.length ? ts.map((t, i) => <div key={i} className="text-[12.5px] text-muted">{i + 1}. {textoTarea(t)}{t[0] === 'CAMBIO' ? ` (${t[2]} / ${t[3]})` : ''}</div>) : <div className="text-[12.5px] text-muted">sin tareas</div>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </Tarjeta>
                )
              })()}
              {!ampliado && <ScatterPlanes planes={ordenados} todos={datos.planes} propios={propios} nada={datos.nada} ejes={s.ejes} setEjes={(e) => set({ ejes: e })} bandeja={s.bandeja}
                previoId={previoId} onHover={setHover} onAlternar={alternarPlan} />}
            </div>
          </div>
        </>
      )}
      {demandaAbierta && (
        <div className="fixed inset-0 z-[60] bg-black/45 flex items-start justify-center p-6 overflow-auto" onMouseDown={(e) => e.target === e.currentTarget && setDemandaAbierta(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-demanda" className="bg-white rounded-2xl w-full max-w-[1320px] p-6 shadow-[0_20px_60px_rgba(0,0,0,.35)]">
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <div>
                <h2 id="titulo-demanda" className="text-[24px] font-bold leading-tight">Demanda de mañana</h2>
                <p className="text-[13.5px] text-muted">Cuándo y dónde habrá más viajes, para elegir los planes que dejan patinetes cargados donde hacen falta.</p>
              </div>
              <Segmentado className="ml-auto" valor={formatoDemanda} onChange={setFormatoDemanda} opciones={[{ valor: 'calor', texto: 'Mapa de calor por hora' }, { valor: 'franjas', texto: 'Por franjas del día' }]} />
              <Boton onClick={() => setDemandaAbierta(false)} autoFocus>Cerrar</Boton>
            </div>
            <VistaDemanda formato={formatoDemanda} Seg={Segmentado} />
          </div>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{nBandeja} planes en la bandeja</span>
    </div>
  )
}
