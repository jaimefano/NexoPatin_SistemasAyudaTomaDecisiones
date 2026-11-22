import React, { useEffect, useState } from 'react'
import { postComparar } from './api.js'
import { useSesion } from './store.jsx'
import { Boton, Cabecera, Insignia, Tarjeta, IconAtras, IconFlecha, IconAviso, Recalculando, useLento } from './components/ui.jsx'
import { MinimapaPlan } from './components/MapView.jsx'
import { LETRAS, COLOR_PLAN, RUTA_VACIA, nombrePlan, num, textoTareaCorto, tareasDe } from './utils.js'
import { Hub, VistaInterior, VISTAS } from './CompararVistas.jsx'

export { Segmentado } from './CompararVistas.jsx'

// Paso 3: Comparar. Los planes de la bandeja (2 o 3) con "no hacer nada" como referencia.
// Vista principal: las tarjetas de los planes y 4 botones (mapas, datos, gráficos, camiones y tareas).
// Cada botón abre una vista con varios formatos de comparación.
export default function Comparar({ estado, mapa, etiqueta, pasos, ir }) {
  const { s, set, quitar } = useSesion()
  const [res, setRes] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [intento, setIntento] = useState(0)
  const [vista, setVista] = useState(null)          // null = vista principal; 'mapas' | 'datos' | 'graficos' | 'camiones'
  const huecos = s.bandeja.map((p, i) => (p ? { i, p, letra: LETRAS[i], color: COLOR_PLAN[LETRAS[i]] } : null)).filter(Boolean)
  const clave = JSON.stringify([huecos.map((h) => h.p.ruta), s.limites])

  // Ampliar un plan: se abre el constructor de Plan propio con la ruta de ese plan como punto de partida.
  // Se guarda en el primer hueco libre (así el original se conserva) o, si están los tres ocupados, sobre el mismo.
  const ampliar = (i) => {
    const libre = s.bandeja.findIndex((q) => !q)
    set((o) => ({ propio: { ...o.propio, ruta: { ...RUTA_VACIA, ...o.bandeja[i].ruta }, historial: [], partirAntes: [], partir: String(i), hueco: libre >= 0 ? libre : i } }))
    ir('/plan-propio')
  }

  const lento = useLento(cargando)
  useEffect(() => {
    if (huecos.length < 2) return
    let vivo = true
    setError(null); setCargando(true)          // los valores anteriores quedan atenuados mientras se recalcula
    postComparar(huecos.map((h) => h.p.ruta), s.limites).then((r) => { if (vivo) { setRes(r); setCargando(false) } }).catch((e) => { if (vivo) { setError(e.message || 'Error de red'); setCargando(false) } })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, intento])

  const abrir = (v) => { setVista(v); window.scrollTo(0, 0) }
  const volver = () => { setVista(null); window.scrollTo(0, 0) }

  const miga = [
    { texto: 'Planificación', onClick: () => ir('/opciones') },
    { texto: `Noche del ${etiqueta.split(' · ')[0]}` },
    vista ? { texto: 'Comparar', onClick: volver } : { texto: 'Comparar' },
    ...(vista ? [{ texto: VISTAS[vista].miga }] : []),
  ]
  if (huecos.length < 2) {
    return (
      <div>
        <Cabecera titulo="Comparar planes" contador={huecos.length} etiqueta={etiqueta} pasos={pasos} miga={miga} />
        <Tarjeta className="p-10 text-center max-w-[640px] mt-8 mx-auto">
          <div className="text-[18px] font-semibold mb-1">Elige al menos 2 planes</div>
          <p className="text-muted mb-5">Marca planes en la tabla de Seleccionar o crea uno propio para poder compararlos.</p>
          <Boton variante="primario" onClick={() => ir('/opciones')}>Ir a Seleccionar <IconFlecha size={18} /></Boton>
        </Tarjeta>
      </div>
    )
  }
  if (error) return <div className="p-10" role="alert"><h1 className="text-2xl font-bold">No se puede comparar</h1><p className="mt-2 mb-4 text-muted">{error}</p><Boton variante="primario" onClick={() => setIntento((n) => n + 1)}>Reintentar</Boton></div>

  const R = res && res.rutas.length === huecos.length ? res : null
  const elegido = s.elegido != null && s.bandeja[s.elegido] ? s.elegido : null
  const nombreElegido = elegido != null ? nombrePlan(s.bandeja[elegido], elegido) : null

  return (
    <div className="pb-6">
      <Cabecera titulo={vista ? VISTAS[vista].titulo : 'Comparar planes'} contador={vista ? undefined : huecos.length} etiqueta={etiqueta} pasos={pasos} miga={miga} extra={<Recalculando activo={lento} />} />

      {/* Barra de decisión: debajo de la cabecera y encima de los planes */}
      <div className="bg-white border border-border rounded-2xl px-6 py-3 mb-4 flex items-center gap-4">
        <div className="mr-auto">
          <div className="font-semibold text-[15px]">{nombreElegido ? `Has elegido el ${nombreElegido}` : 'Todavía no has elegido plan'}</div>
          <div className="text-[13px] text-muted">{vista ? VISTAS[vista].ayuda : nombreElegido ? 'Pulsa Decidir para ver su hoja de ruta y confirmarlo.' : 'El sistema no recomienda ninguno: decide tú con los indicadores y los gráficos.'}</div>
        </div>
        {vista && (
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Elegir plan">
            <span className="text-[13px] text-muted mr-1">Elegir</span>
            {huecos.map((h) => (
              <button key={h.i} role="radio" aria-checked={elegido === h.i} aria-label={`Elegir ${nombrePlan(h.p, h.i)}`} title={`Elegir ${nombrePlan(h.p, h.i)}`} onClick={() => set({ elegido: h.i })}
                className={`inline-flex items-center justify-center shrink-0 rounded-full p-0.5 border-[4px] ${elegido === h.i ? 'border-cta' : 'border-transparent hover:border-cta'}`}><Insignia letra={h.letra} size={28} /></button>
            ))}
          </div>
        )}
        {vista
          ? <Boton onClick={volver}><IconAtras size={18} /> Todas las comparaciones</Boton>
          : <Boton onClick={() => ir('/opciones')}><IconAtras size={18} /> Cambiar planes</Boton>}
        <Boton variante="primario" disabled={elegido == null} onClick={() => ir('/decidir')}>Decidir <IconFlecha size={18} /></Boton>
      </div>

      {!vista && (
        <div className={`grid gap-4 mb-5 ${huecos.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {huecos.map((h, k) => {
            const avisos = R?.rutas[k].avisos || []
            const ts = tareasDe(h.p.ruta)
            return (
              <Tarjeta key={h.i} className="p-3.5 flex gap-4">
                <MinimapaPlan mapa={mapa} ruta={h.p.ruta} color={h.color} className="w-[118px] h-[170px] shrink-0" />
                <div className="min-w-0 flex-1 flex flex-col">
                  <div className="flex items-center gap-2.5"><Insignia letra={h.letra} size={28} /><h2 className="text-[19px] font-bold truncate">{nombrePlan(h.p, h.i)}</h2></div>
                  <div className="text-[13px] text-muted mt-0.5 mb-1">{ts.length} {ts.length === 1 ? 'tarea' : 'tareas'}{R ? ` · ${num(R.rutas[k].minutos)} min de camión` : ''}</div>
                  <ul className="text-[13px] list-disc pl-4 space-y-0.5">{ts.map((t, i) => <li key={i}>{textoTareaCorto(t)}</li>)}</ul>
                  {avisos.length > 0 && <div className="mt-1.5 inline-flex items-start gap-1 bg-[#FFF3D6] text-warning-ink text-[12px] font-medium rounded px-1.5 py-0.5 self-start"><IconAviso size={13} className="mt-0.5 shrink-0" /> {avisos.join(' · ')}</div>}
                  <div className="mt-auto pt-2 flex items-center gap-2">
                    {/* Tamaño fijo; al pasar el cursor por encima de "Elegir este plan" se ve ya el estado "Plan elegido" (con transición) */}
                    <button role="radio" aria-checked={elegido === h.i} aria-label={`${elegido === h.i ? 'Plan elegido' : 'Elegir este plan'}: ${nombrePlan(h.p, h.i)}`} onClick={() => set({ elegido: h.i })}
                      className={`group inline-flex items-center justify-center gap-2 rounded-full h-10 w-[172px] shrink-0 text-[13px] font-semibold border transition-colors duration-200 ${elegido === h.i ? 'bg-cta text-white border-cta' : 'bg-white border-border-strong hover:bg-cta hover:text-white hover:border-cta'}`}>
                      <span className={`w-3.5 h-3.5 rounded-full border-2 transition-colors duration-200 ${elegido === h.i ? 'border-white bg-white' : 'border-ink bg-transparent group-hover:border-white group-hover:bg-white'}`} />
                      <span className="grid text-left" aria-hidden="true">
                        <span className={`col-start-1 row-start-1 whitespace-nowrap transition-opacity duration-200 ${elegido === h.i ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'}`}>Elegir este plan</span>
                        <span className={`col-start-1 row-start-1 whitespace-nowrap transition-opacity duration-200 ${elegido === h.i ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>Plan elegido</span>
                      </span>
                    </button>
                    <Boton className="!h-10 !px-4 text-[13px]" onClick={() => quitar(h.i)}>Quitar</Boton>
                  </div>
                </div>
              </Tarjeta>
            )
          })}
        </div>
      )}

      {!R ? <div className="text-muted p-6" role="status">Calculando la comparación…</div> : (
        <div className={cargando ? 'dim' : ''} aria-busy={cargando}>
          {vista
            ? <VistaInterior key={vista} vista={vista} estado={estado} onAmpliar={ampliar} R={R} huecos={huecos} mapa={mapa} limites={s.limites} />
            : <Hub R={R} huecos={huecos} mapa={mapa} abrir={abrir} />}
        </div>
      )}
    </div>
  )
}
