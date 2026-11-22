import React, { useMemo, useState } from 'react'
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table'
import { Camion, Boton, Selector, IconBuscar, IconFiltro, IconAviso, IconOrden } from './ui.jsx'
import { METRICAS, ZONAS, claseVar, textoVar, textoTarea, detalleTarea, claveTarea, num } from '../utils.js'

const COLS = ['beneficio', 'perdidos', 'demanda', 'coste', 'bajos', 'tiempo']
const VISIBLES = 10
const CABECERA = { beneficio: ['Beneficio', '3 días'], perdidos: ['Viajes perdidos', '3 días'], demanda: ['Demanda', 'atendida'], coste: ['Coste', 'camiones'], bajos: ['Bajos sin', 'cambiar'], tiempo: ['Tiempo libre', 'del camión'] }

export const ordenInicial = (lista) =>
  [...lista].sort((a, b) => ZONAS.indexOf(a.tarea[1]) - ZONAS.indexOf(b.tarea[1]) || (a.tarea[0] === b.tarea[0] ? 0 : a.tarea[0] === 'CAMBIO' ? -1 : 1) || ZONAS.indexOf(a.tarea[2]) - ZONAS.indexOf(b.tarea[2]) || a.camion - b.camion)

export default function Tabla({ base, candidatas, filtros, setFiltros, activa, onHover, onSelect, onAnadir, compact, cargando, mostrarAnadirPropia, onAnadirPropia }) {
  const [verTodas, setVerTodas] = useState(false)
  const filtradas = useMemo(() => candidatas.filter((c) => {
    const t = c.tarea
    if (filtros.q && !(textoTarea(t) + ' ' + (detalleTarea(t) || '')).toLowerCase().includes(filtros.q.toLowerCase())) return false
    if (filtros.tipo !== 'Todos' && t[0] !== filtros.tipo) return false
    if (filtros.zona !== 'Todas' && !(t[1] === filtros.zona || (t[0] === 'REUBICAR' && t[2] === filtros.zona))) return false
    if (filtros.camion !== 'Todos' && String(c.camion) !== filtros.camion) return false
    if (!filtros.incumplen && c.avisos.length) return false
    return true
  }), [candidatas, filtros])

  const columns = useMemo(() => COLS.map((m) => ({
    id: m, header: METRICAS[m].nombre,
    accessorFn: (c) => (m === 'tiempo' ? c.tiempo_libre : METRICAS[m].var(c.delta, c)),
    sortUndefined: 'last',
  })), [])
  const [sorting, setSorting] = useState([])
  const table = useReactTable({ data: filtradas, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), enableSortingRemoval: true })
  const filas = table.getRowModel().rows
  const mostrar = verTodas ? filas : filas.slice(0, compact ? VISIBLES : VISIBLES)
  const resto = filas.length - mostrar.length

  const cab = (m) => {
    const h = CABECERA[m]
    const s = sorting[0]?.id === m ? (sorting[0].desc ? '↓' : '↑') : null
    return (
      <th key={m} className="text-right font-semibold px-2 py-2 text-[12px] leading-tight align-bottom" aria-sort={s ? (s === '↑' ? 'ascending' : 'descending') : 'none'}>
        <button className="text-right inline-flex items-end gap-0.5 hover:underline" onClick={() => setSorting((o) => (o[0]?.id !== m ? [{ id: m, desc: true }] : o[0].desc ? [{ id: m, desc: false }] : []))}>
          <span className="whitespace-nowrap">{h[0]}<br />{h[1]}</span>
          {s ? <span>{s}</span> : <IconOrden size={11} className="opacity-70" />}
        </button>
      </th>
    )
  }

  return (
    <section aria-label="Alternativas">
      <div className="flex items-center gap-x-3 gap-y-3 flex-wrap mb-3">
        <h2 className={`font-bold ${compact ? 'text-[20px] mr-auto' : 'text-[22px] w-full'}`}>
          {compact ? 'Alternativas' : <>Alternativas para añadir a la ruta · tú eliges el orden</>} <span className="font-normal text-muted">({candidatas.length})</span>
        </h2>
        <label className="flex items-center gap-2 bg-surface rounded-full h-10 px-4 w-[190px] text-[13px]">
          <IconBuscar size={16} className="text-muted" />
          <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="Buscar tarea..." value={filtros.q} onChange={(e) => setFiltros({ q: e.target.value })} aria-label="Buscar tarea" />
        </label>
        <Selector etiqueta="Tipo" valor={filtros.tipo} onChange={(v) => setFiltros({ tipo: v })} opciones={[{ valor: 'Todos', texto: 'Todos' }, { valor: 'CAMBIO', texto: 'Cambio' }, { valor: 'REUBICAR', texto: 'Reubicar' }]} />
        <Selector etiqueta="Zona" valor={filtros.zona} onChange={(v) => setFiltros({ zona: v })} opciones={[{ valor: 'Todas', texto: 'Todas' }, ...ZONAS.map((z) => ({ valor: z, texto: z }))]} />
        <Selector etiqueta="Camión" valor={filtros.camion} onChange={(v) => setFiltros({ camion: v })} opciones={[{ valor: 'Todos', texto: 'Todos' }, ...[1, 2, 3, 4].map((c) => ({ valor: String(c), texto: String(c) }))]} />
        <label className="flex items-center gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-black" checked={filtros.incumplen} onChange={(e) => setFiltros({ incumplen: e.target.checked })} />
          mostrar las que incumplen un límite
        </label>
        {mostrarAnadirPropia && <Boton variante="borde" className="!h-10 !px-4 text-[13px]" onClick={onAnadirPropia}>+ Añadir tarea propia</Boton>}
      </div>

      <div className={`border-y border-border overflow-auto ${verTodas ? 'max-h-[560px]' : ''} ${cargando ? 'dim' : ''}`}>
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 800 }}>
          <thead className="bg-surface sticky top-0 z-[1]">
            <tr>
              <th className="text-left font-semibold px-2.5 py-2 text-[12px] align-bottom min-w-[270px]">Tarea posible</th>
              {COLS.map(cab)}
              <th className="w-[90px]" />
            </tr>
          </thead>
          <tbody>
            <tr className="bg-surface border-b border-border font-semibold">
              <td className="px-2.5 py-2.5">Ruta actual (no hacer nada)</td>
              {COLS.map((m) => {
                const t = m === 'tiempo' ? 360 : METRICAS[m].abs(base)
                return <td key={m} className="text-right px-2 py-2.5 whitespace-nowrap">{num(t, METRICAS[m].d)}{METRICAS[m].unidad ? ' ' + METRICAS[m].unidad : ''}</td>
              })}
              <td />
            </tr>
            {mostrar.map(({ original: c }) => {
              const id = claveTarea(c.camion, c.tarea)
              const marcada = activa === id
              const inc = c.avisos.length > 0
              return (
                <tr key={id} tabIndex={0}
                  className={`border-b border-border cursor-pointer ${marcada ? 'bg-accent-bg outline outline-2 outline-accent -outline-offset-2' : 'hover:bg-surface'} ${inc ? 'text-muted-2 italic' : ''}`}
                  onMouseEnter={() => onHover(c)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(c)} onBlur={() => onHover(null)}
                  onClick={() => onSelect(c)} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(c) }}>
                  <td className="px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <Camion n={c.camion} size={18} />
                      <div className="leading-tight">
                        <div className={inc ? '' : 'font-medium'}>{textoTarea(c.tarea)}</div>
                        {detalleTarea(c.tarea) && <div className="text-[12px] text-muted-2 not-italic">{detalleTarea(c.tarea)}</div>}
                        {inc && <div className="not-italic mt-0.5 inline-flex items-center gap-1 bg-[#FFF3D6] text-warning-ink text-[11.5px] font-medium rounded px-1.5"><IconAviso size={12} /> {c.avisos.join(' · ')}</div>}
                      </div>
                    </div>
                  </td>
                  {COLS.map((m) => (
                    <td key={m} className={`text-right px-2 py-1.5 font-semibold whitespace-nowrap ${m === 'tiempo' ? (inc ? 'font-normal' : 'font-normal text-muted') : inc ? '' : claseVar(m, METRICAS[m].var(c.delta, c))}`}>
                      {m === 'tiempo' ? `${num(c.tiempo_libre)} min` : textoVar(m, METRICAS[m].var(c.delta, c))}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right not-italic">
                    <Boton variante="borde" className="!h-9 !px-4 text-[13px]" onClick={(e) => { e.stopPropagation(); onAnadir(c) }}>Añadir</Boton>
                  </td>
                </tr>
              )
            })}
            {mostrar.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted py-6">
                {candidatas.length === 0 ? 'No quedan tareas posibles: sin tiempo de camión, stock o bajos.' : 'Ninguna tarea cumple los filtros.'}
              </td></tr>
            )}
            {resto > 0 && (
              <tr><td colSpan={8} className="text-center py-2.5 bg-surface text-muted"><button className="hover:underline" onClick={() => setVerTodas(true)}>… {resto} tareas posibles más</button></td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!compact && (
        <p className="text-[12px] text-muted mt-3">
          Cada celda es la <b className="text-ink">variación</b> de ese indicador si se añade la tarea a la ruta actual. Haz clic en una cabecera para ordenar (orden inicial: por zona). Al pasar el ratón por una fila, los indicadores de arriba y el mapa muestran cómo quedaría. El sistema no marca ninguna tarea como recomendada.
        </p>
      )}
    </section>
  )
}
