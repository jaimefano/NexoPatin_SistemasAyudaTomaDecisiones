import React from 'react'
import { Chipvar } from './ui.jsx'
import { METRICAS, num, textoVar } from '../utils.js'

export default function Kpis({ base, preview, limites, compact, cargando }) {
  if (!base) return null
  const d = preview?.delta
  const tarjetas = [
    { id: 'beneficio', valor: num(base.beneficio), unidad: 'USD', dia1: `día 1: ${num(base.beneficio_dia1)} USD`, v: d && textoVar('beneficio', d.beneficio) },
    { id: 'perdidos', valor: num(base.perdidos), unidad: '', dia1: `día 1: ${num(base.perdidos_dia1)}`, v: d && textoVar('perdidos', d.perdidos) },
    { id: 'demanda', valor: num(base.demanda_atendida * 100, 1), unidad: '%', dia1: `día 1: ${num(base.demanda_dia1 * 100)} %`, v: d && textoVar('demanda', d.demanda_atendida * 100) },
    { id: 'coste', valor: num(base.coste), unidad: 'USD', dia1: limites.coste_max != null ? `límite: ${num(limites.coste_max)} USD` : 'sin límite', v: d && textoVar('coste', d.coste) },
    { id: 'bajos', valor: num(base.bajos_sin_cambiar), unidad: 'bajos sin cambiar', dia1: `reserva taller: ${num(base.reserva)} (mín.: ${limites.reserva_min != null ? num(limites.reserva_min) : '—'})`, v: d && textoVar('bajos', d.bajos_sin_cambiar), titulo: 'Al terminar la noche' },
  ]
  return (
    <div className={`grid grid-cols-5 gap-4 ${cargando ? 'dim' : ''}`}>
      {tarjetas.map((t) => (
        <div key={t.id} className={`bg-white border border-border rounded-2xl ${compact ? 'px-4 py-2.5' : 'px-5 pt-4 pb-3.5'}`}>
          <div className="text-[13px] text-muted">{t.titulo || METRICAS[t.id].nombre}</div>
          <div className={`flex items-baseline gap-1.5 ${compact ? 'mt-0' : 'mt-1 mb-2.5 pb-2.5 border-b border-border'}`}>
            <span className={`font-semibold leading-tight ${compact ? 'text-[24px]' : 'text-[30px]'}`}>{t.valor}</span>
            <span className="text-[13px] text-muted">{t.unidad}</span>
          </div>
          {compact ? (
            <div className="text-[12px] text-muted flex items-center gap-1.5 flex-wrap">
              <span>{t.dia1.split(' · ')[0].replace(/\(mín.*$/, '')}</span> · <span>fila: {t.v ? <Chipvar>{t.v}</Chipvar> : '—'}</span>
            </div>
          ) : (
            <>
              <div className="text-[12.5px] text-muted">{t.dia1}</div>
              <div className="text-[12.5px] text-muted mt-0.5">con la fila marcada: {t.v ? <Chipvar>{t.v}</Chipvar> : '—'}</div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
