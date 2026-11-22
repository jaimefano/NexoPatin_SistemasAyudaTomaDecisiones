import React, { useEffect, useRef } from 'react'
import { IconOrden, Insignia } from './ui.jsx'
import { METRICAS, LETRAS, claseVar, textoVar, textoAbs, num } from '../utils.js'

export const COLS_PLAN = ['beneficio', 'perdidos', 'demanda', 'coste', 'bajos', 'reserva']
const CABECERA = { beneficio: ['Beneficio', '3 días'], perdidos: ['Viajes perdidos', '3 días'], demanda: ['Demanda', 'atendida'], coste: ['Coste', 'camiones'], bajos: ['Bajos sin', 'cambiar'], reserva: ['Reserva', 'taller'] }
export const valorOrden = (id, p) => (id === 'plan' ? p.id : id === 'tareas' ? p.n_tareas : METRICAS[id].abs(p.kpis))

// Tabla de planes (Opciones): casilla/insignia · plan y tareas · 6 indicadores (valor y diferencia con no hacer nada).
// Primera fila fija "No hacer nada". Orden inicial neutro (por identificador); cabecera ordenable.
export const COLS_COMPACTAS = ['beneficio', 'perdidos', 'coste']
export default function TablaPlanes({ compacta, planes, nada, bandeja, previoId, marcadoId, onHover, onMarcar, onAlternar, orden, setOrden, visibles, masVisibles, cargando }) {
  const cols = compacta ? COLS_COMPACTAS : COLS_PLAN   // con el mapa ampliado la tabla se simplifica: 3 indicadores y sin la línea de tareas
  const idsBandeja = bandeja.map((p) => (p && p.origen === 'pool' ? p.id : null))
  const mostrar = planes.slice(0, visibles)
  const resto = planes.length - mostrar.length
  const marcadaRef = useRef(null)
  useEffect(() => { marcadaRef.current?.scrollIntoView({ block: 'nearest' }) }, [marcadoId])

  const ciclo = (id) => setOrden(orden?.id !== id ? { id, desc: false } : !orden.desc ? { id, desc: true } : null)
  const cab = (m) => {
    const h = CABECERA[m]
    const s = orden?.id === m ? (orden.desc ? '↓' : '↑') : null
    return (
      <th key={m} scope="col" className="text-right font-semibold px-2.5 text-[12px] leading-tight align-bottom pb-2 h-[48px]" aria-sort={s ? (orden.desc ? 'descending' : 'ascending') : 'none'}>
        <button className="text-right inline-flex items-end gap-0.5 hover:underline" onClick={() => ciclo(m)}>
          <span className="whitespace-nowrap">{h[0]}<br />{h[1]}</span>
          {s ? <span>{s}</span> : <IconOrden size={11} className="opacity-70" />}
        </button>
      </th>
    )
  }

  return (
    <div className={`overflow-auto flex-1 min-h-0 ${cargando ? 'dim' : ''}`}>
      <table aria-label="Planes de la noche" className="w-full text-[13px] border-collapse" aria-busy={!!cargando} style={{ minWidth: compacta ? 0 : 860 }}>
        <thead className="bg-surface sticky top-0 z-[2]">
          <tr>
            <th scope="col" className="w-[44px]"><span className="sr-only">En la bandeja</span></th>
            <th scope="col" className="text-left font-semibold px-2 text-[12px] align-bottom pb-2" style={{ minWidth: compacta ? 150 : 250 }}>
              <button className="inline-flex items-end gap-1 hover:underline" onClick={() => ciclo('plan')}>Plan y tareas {orden?.id === 'plan' ? <span>{orden.desc ? '↓' : '↑'}</span> : <IconOrden size={11} className="opacity-70" />}</button>
            </th>
            {cols.map(cab)}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-surface border-b border-border font-semibold sticky top-[48px] z-[1]">
            <td />
            <td className="px-2 py-2.5 text-[13.5px]">No hacer nada</td>
            {cols.map((m) => <td key={m} className="text-right px-2.5 py-2.5 whitespace-nowrap">{textoAbs(m, METRICAS[m].abs(nada))}</td>)}
          </tr>
          {mostrar.map((p) => {
            const i = idsBandeja.indexOf(p.id)
            const marcada = p.id === previoId
            return (
              <tr key={p.id} id={`plan-${p.id}`} ref={p.id === marcadoId ? marcadaRef : null} aria-selected={marcada}
                className={`border-b border-border cursor-pointer ${marcada ? 'bg-surface outline outline-2 outline-ink -outline-offset-2' : 'hover:bg-surface'}`}
                onMouseEnter={() => onHover(p.id)} onMouseLeave={() => onHover(null)} onClick={() => onMarcar(p.id)}>
                <td className="pl-3 pr-1 py-1.5">
                  <button role="checkbox" aria-checked={i >= 0} aria-label={`Plan ${p.id} en la bandeja`} onClick={(e) => { e.stopPropagation(); onAlternar(p) }}
                    className="inline-flex items-center justify-center rounded-full">
                    {i >= 0 ? <Insignia letra={LETRAS[i]} size={24} /> : <span className="w-[22px] h-[22px] rounded-[6px] border-2 border-border-strong bg-white inline-block" />}
                  </button>
                </td>
                <td className="px-2 py-1.5 max-w-[330px]">
                  <div className="leading-tight">
                    <div><span className="font-semibold text-[13.5px]">Plan {p.id}</span> <span className="text-muted-2">·</span> <span className="text-muted">{p.n_tareas} {p.n_tareas === 1 ? 'tarea' : 'tareas'}{compacta ? '' : ` · ${num(p.minutos)} min`}</span></div>
                    {!compacta && <div className="text-[12px] text-muted truncate" title={p.tareas.join(' · ')}>{p.tareas.join(' · ')}</div>}
                  </div>
                </td>
                {cols.map((m) => {
                  const v = METRICAS[m].var(p.delta)
                  return (
                    <td key={m} className="text-right px-2.5 py-1.5 whitespace-nowrap leading-tight">
                      <div className="font-semibold">{textoAbs(m, METRICAS[m].abs(p.kpis))}</div>
                      <div className={`text-[12px] font-semibold ${claseVar(m, v)}`}>{textoVar(m, v)}</div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {mostrar.length === 0 && (
            <tr><td colSpan={cols.length + 2} className="text-center text-muted py-8">Ningún plan cumple estos filtros. Quita alguno o usa Crear plan propio.</td></tr>
          )}
          {resto > 0 && (
            <tr><td colSpan={cols.length + 2} className="text-center py-2.5 bg-surface text-muted">
              <button className="hover:underline" onClick={masVisibles}>… {num(resto)} planes más {orden ? '(ordenados por la columna elegida)' : '(ordenados por identificador)'}</button>
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
