import React from 'react'
import { Camion, Tarjeta } from './ui.jsx'
import { COLOR_CAMION, textoTarea, num } from '../utils.js'

const JORNADA = 360

function Barra({ c, usados, extra }) {
  const p = Math.min(100, (usados / JORNADA) * 100)
  const e = Math.min(100 - p, ((extra || 0) / JORNADA) * 100)
  return (
    <div className="h-2 rounded-full bg-surface-2 overflow-hidden flex" role="progressbar" aria-valuemin={0} aria-valuemax={JORNADA} aria-valuenow={usados} aria-label={`Camión ${c}: ${num(usados)} de ${JORNADA} minutos`}>
      <div style={{ width: p + '%', background: COLOR_CAMION[c] }} />
      {e > 0 && <div className="striped" style={{ width: e + '%' }} />}
    </div>
  )
}

const usadosDe = (base, c) => base?.tiempos?.[String(c)] ?? 0

// Tarjeta del panel derecho (sin zona elegida): plan de los camiones
export function PlanCamiones({ base, ruta, preview }) {
  return (
    <Tarjeta className="p-6">
      <h3 className="text-[17px] font-semibold mb-4">Plan de los camiones</h3>
      <div className="space-y-4">
        {[1, 2, 3, 4].map((c) => {
          const ts = ruta[c] || []
          const extra = preview && preview.camion === c ? preview.tiempo_tarea : 0
          return (
            <div key={c}>
              <div className="flex items-center gap-2 mb-1.5">
                <Camion n={c} />
                <span className="font-semibold text-[13.5px]">Camión {c}</span>
                <span className="ml-auto text-[13px] text-muted">{ts.length ? `${num(usadosDe(base, c))} / ${JORNADA} min` : 'sin tareas'}</span>
              </div>
              <Barra c={c} usados={usadosDe(base, c)} extra={extra} />
              {ts.map((t, i) => <div key={i} className="text-[12px] text-muted mt-1">{i + 1}. {textoTarea(t)}{t[0] === 'CAMBIO' ? ` (${t[2]}/${t[3]})` : ''}</div>)}
              {extra > 0 && <div className="text-[12px] text-cta-ink font-medium mt-1">+ vista previa: {num(extra)} min</div>}
            </div>
          )
        })}
      </div>
      <p className="text-[12.5px] text-muted mt-4">Jornada de {JORNADA} min por camión.</p>
    </Tarjeta>
  )
}

// Fila de 4 tarjetas bajo el mapa (cuando hay una tarea en preparación)
export function FilaCamiones({ base, ruta, preview }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((c) => {
        const ts = ruta[c] || []
        const extra = preview && preview.camion === c ? preview.tiempo_tarea : 0
        const libres = JORNADA - usadosDe(base, c)
        return (
          <Tarjeta key={c} className="p-5">
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Camion n={c} /> <span>Camión {c}</span><span className="ml-auto">{num(libres)} min libres</span>
            </div>
            <div className="text-[12.5px] text-muted my-1.5 min-h-[18px]">
              {ts.length ? ts.map(textoTarea).join(' · ') : 'sin tareas'}
              {extra > 0 && <div className="text-cta-ink font-medium">+ vista previa: {preview.tarea[0] === 'CAMBIO' ? `${textoTarea(preview.tarea)} (${preview.tarea[2]} / ${preview.tarea[3]})` : textoTarea(preview.tarea)} (−{num(extra)} min)</div>}
            </div>
            <Barra c={c} usados={usadosDe(base, c)} extra={extra} />
          </Tarjeta>
        )
      })}
    </div>
  )
}

// Barras diminutas de la franja plegada
export function MiniCamiones({ base, preview }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-[190px]">
      {[1, 2, 3, 4].map((c) => {
        const extra = preview && preview.camion === c ? preview.tiempo_tarea : 0
        return (
          <div key={c} className="flex items-center gap-1.5">
            <Camion n={c} size={16} />
            <div className="flex-1"><Barra c={c} usados={usadosDe(base, c)} extra={extra} /></div>
          </div>
        )
      })}
    </div>
  )
}
