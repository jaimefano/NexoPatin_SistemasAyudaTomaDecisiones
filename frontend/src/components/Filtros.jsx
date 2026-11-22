import React, { useEffect, useMemo, useRef, useState } from 'react'
import { IconBuscar, IconCerrar } from './ui.jsx'
import { METRICAS, num, cargadosFinales } from '../utils.js'

const NOMBRE = { beneficio: 'Beneficio 3 d.', perdidos: 'Viajes perdidos', demanda: 'Demanda atendida', coste: 'Coste', bajos: 'Bajos sin cambiar', reserva: 'Reserva' }
const TITULO = { beneficio: 'Beneficio 3 días', perdidos: 'Viajes perdidos 3 días', demanda: 'Demanda atendida', coste: 'Coste de camiones', bajos: 'Bajos sin cambiar', reserva: 'Reserva del taller' }
export const METRICAS_FILTRO = ['beneficio', 'perdidos', 'demanda', 'coste', 'bajos', 'reserva']
const BINS = 28

const redondea = (m, v) => Number(v.toFixed(METRICAS[m].d))
export const valorPlan = (m, p) => redondea(m, METRICAS[m].abs(p.kpis))

function textoRango(m, [lo, hi]) {
  const u = METRICAS[m].unidad ? ' ' + METRICAS[m].unidad : ''
  const d = METRICAS[m].d
  if (lo == null) return `${NOMBRE[m]} ≤ ${num(hi, d)}${u}`
  if (hi == null) return `${NOMBRE[m]} ≥ ${num(lo, d)}${u}`
  return `${NOMBRE[m]}: ${num(lo, d)} – ${num(hi, d)}${u}`
}

// Popover con el histograma de los planes y un selector de rango doble
function PopoverRango({ m, planes, rango, onAplicar, onBorrar }) {
  const d = METRICAS[m].d, paso = d ? 1 / 10 ** d : 1
  const valores = useMemo(() => planes.map((p) => valorPlan(m, p)), [planes, m])
  const min = useMemo(() => Math.floor(Math.min(...valores) / paso) * paso, [valores, paso])
  const max = useMemo(() => Math.ceil(Math.max(...valores) / paso) * paso, [valores, paso])
  const [lo, setLo] = useState(rango?.[0] ?? min)
  const [hi, setHi] = useState(rango?.[1] ?? max)
  const bins = useMemo(() => {
    const b = new Array(BINS).fill(0)
    valores.forEach((v) => { b[Math.min(BINS - 1, Math.floor(((v - min) / (max - min || 1)) * BINS))]++ })
    return b
  }, [valores, min, max])
  const tope = Math.max(...bins, 1)
  const dentro = valores.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9).length
  const u = METRICAS[m].unidad ? ' ' + METRICAS[m].unidad : ''
  const sinLimite = lo <= min && hi >= max
  const cabecera = sinLimite ? 'sin límites' : lo <= min ? `hasta ${num(hi, d)}${u}` : hi >= max ? `desde ${num(lo, d)}${u}` : `${num(lo, d)} – ${num(hi, d)}${u}`
  return (
    <div className="absolute left-0 top-[46px] z-50 w-[300px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,.18)] border border-border p-4" role="dialog" aria-label={`Filtro: ${TITULO[m]}`}>
      <div className="flex items-baseline justify-between mb-2">
        <b className="text-[14px]">{TITULO[m]}</b><span className="text-accent font-bold text-[13px]">{cabecera}</span>
      </div>
      <div className="flex items-end gap-[2px] h-[54px]" aria-hidden="true">
        {bins.map((c, i) => {
          const centro = min + ((i + 0.5) / BINS) * (max - min)
          const act = centro >= lo && centro <= hi
          return <div key={i} className="flex-1 rounded-t-[2px]" style={{ height: Math.max(c ? 3 : 1, (c / tope) * 54), background: act ? '#000000' : '#DADADA' }} />
        })}
      </div>
      <div className="rango2 mt-1">
        <div className="pista" />
        <input type="range" min={min} max={max} step={paso} value={lo} aria-label="Mínimo" onChange={(e) => setLo(Math.min(Number(e.target.value), hi))} />
        <input type="range" min={min} max={max} step={paso} value={hi} aria-label="Máximo" onChange={(e) => setHi(Math.max(Number(e.target.value), lo))} />
      </div>
      <div className="flex justify-between text-[12px] text-muted mt-0.5">
        <span>{num(min, d)}</span><span>{dentro} {dentro === 1 ? 'plan dentro' : 'planes dentro'} del rango</span><span>{num(max, d)}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <button className="h-10 rounded-full bg-surface-2 font-semibold hover:bg-border" onClick={onBorrar}>Borrar</button>
        <button className="h-10 rounded-full bg-cta text-white font-semibold hover:bg-cta-hover" onClick={() => onAplicar([lo <= min ? null : lo, hi >= max ? null : hi])}>Aplicar</button>
      </div>
    </div>
  )
}

const textoZona = ([lo, hi]) => (lo == null ? `≤ ${hi}` : hi == null ? `≥ ${lo}` : `${lo} – ${hi}`)
// Deslizador del mínimo de patinetes cargados que debe dejar el plan en UNA zona al acabar la noche
function PopoverZona({ zona, planes, estado, valor, className, onAplicar, onBorrar }) {
  const i = estado.zonas.indexOf(zona)
  const porPlan = useMemo(() => planes.map((p) => cargadosFinales(estado.cargados, p.ruta)[zona]), [planes, estado, zona])
  const lo = Math.min(...porPlan), hi = Math.max(...porPlan)
  const [a, setA] = useState(valor?.[0] ?? lo)
  const [b, setB] = useState(valor?.[1] ?? hi)
  const activo = a > lo || b < hi
  const cumplen = porPlan.filter((x) => x >= a && x <= b).length
  const bins = useMemo(() => {
    const b = new Array(BINS).fill(0)
    porPlan.forEach((x) => { b[Math.min(BINS - 1, Math.floor(((x - lo) / (hi - lo || 1)) * BINS))]++ })
    return b
  }, [porPlan, lo, hi])
  const tope = Math.max(...bins, 1)
  return (
    <div className={`absolute z-50 w-[300px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,.18)] border border-border p-4 ${className}`} role="dialog" aria-label={`Filtro: cargados en ${zona}`}>
      <div className="flex items-baseline justify-between mb-1">
        <b className="text-[14px]">Cargados en {zona}</b><span className="text-accent font-bold text-[13px]">{!activo ? 'sin límites' : a <= lo ? `hasta ${b}` : b >= hi ? `desde ${a}` : `${a} – ${b}`}</span>
      </div>
      <p className="text-[12px] text-muted mb-2">Ahora hay {estado.cargados[zona]} · demanda de mañana ≈ {num(estado.demanda_zona?.[i] ?? 0)} viajes</p>
      <div className="flex items-end gap-[2px] h-[54px]" aria-hidden="true">
        {bins.map((c, k) => {
          const centro = lo + ((k + 0.5) / BINS) * (hi - lo)
          return <div key={k} className="flex-1 rounded-t-[2px]" style={{ height: Math.max(c ? 3 : 1, (c / tope) * 54), background: centro >= a && centro <= b ? '#000000' : '#DADADA' }} />
        })}
      </div>
      <div className="rango2 mt-1">
        <div className="pista" />
        <input type="range" min={lo} max={hi} step={1} value={a} aria-label={`Mínimo de cargados en ${zona}`} onChange={(e) => setA(Math.min(Number(e.target.value), b))} />
        <input type="range" min={lo} max={hi} step={1} value={b} aria-label={`Máximo de cargados en ${zona}`} onChange={(e) => setB(Math.max(Number(e.target.value), a))} />
      </div>
      <div className="flex justify-between text-[12px] text-muted mt-0.5">
        <span>{lo}</span><span aria-live="polite">{cumplen} {cumplen === 1 ? 'plan dentro' : 'planes dentro'} del rango</span><span>{hi}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <button className="h-10 rounded-full bg-surface-2 font-semibold hover:bg-border" onClick={onBorrar}>Borrar</button>
        <button className="h-10 rounded-full bg-cta text-white font-semibold hover:bg-cta-hover" onClick={() => onAplicar(activo ? [a <= lo ? null : a, b >= hi ? null : b] : null)}>Aplicar</button>
      </div>
    </div>
  )
}

function PopoverTareas({ valor, onCambio, onCerrar }) {
  return (
    <div className="absolute left-0 top-[46px] z-50 w-[260px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,.18)] border border-border p-4" role="dialog" aria-label="Filtro: número de tareas">
      <b className="text-[14px]">Número de tareas</b>
      <div className="flex gap-2 flex-wrap my-3">
        {[1, 2, 3, 4, 5, 6].map((n) => {
          const on = valor.includes(n)
          return <button key={n} aria-pressed={on} onClick={() => onCambio(on ? valor.filter((x) => x !== n) : [...valor, n].sort())}
            className={`w-10 h-10 rounded-full font-semibold ${on ? 'bg-accent text-white' : 'bg-surface-2 hover:bg-accent-bg hover:text-accent-ink'}`}>{n}</button>
        })}
      </div>
      <div className="flex gap-3">
        <button className="flex-1 h-10 rounded-full bg-surface-2 font-semibold hover:bg-border" onClick={() => { onCambio([]); onCerrar() }}>Todas</button>
        <button className="flex-1 h-10 rounded-full bg-cta text-white font-semibold hover:bg-cta-hover" onClick={onCerrar}>Listo</button>
      </div>
    </div>
  )
}

// Fila de filtros: búsqueda, filtros activos con ✕, "Tareas" y "+ Añadir filtro"
export default function Filtros({ planes, filtros, setFiltros, resumen, deshabilitado, accion, estado }) {
  const [abierto, setAbierto] = useState(null)       // 'm:coste' | 'n:coste' (nuevo) | 'menu' | 'tareas'
  const raiz = useRef(null)
  useEffect(() => {
    const f = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAbierto(null) }
    const t = (e) => e.key === 'Escape' && setAbierto(null)
    document.addEventListener('mousedown', f); document.addEventListener('keydown', t)
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', t) }
  }, [])
  const activos = METRICAS_FILTRO.filter((m) => filtros.rangos[m])
  const libres = METRICAS_FILTRO.filter((m) => !filtros.rangos[m])
  const poner = (m, r) => { const rangos = { ...filtros.rangos }; if (!r || (r[0] == null && r[1] == null)) delete rangos[m]; else rangos[m] = r; setFiltros({ rangos }); setAbierto(null) }
  const chip = 'inline-flex items-center gap-1.5 rounded-full h-10 px-4 text-[13px] font-medium whitespace-nowrap'
  const inerte = deshabilitado ? 'opacity-50 pointer-events-none' : ''

  return (
    <div ref={raiz} role="search" aria-label="Filtros de planes" className={`flex items-center gap-2.5 mb-3 flex-wrap ${inerte}`}>
      <label className="flex items-center gap-2 bg-surface rounded-full h-10 px-4 w-[190px] text-[13px]">
        <IconBuscar size={16} className="text-muted" />
        <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="Buscar plan..." value={filtros.q} onChange={(e) => setFiltros({ q: e.target.value })} aria-label="Buscar plan" />
      </label>

      {activos.map((m) => (
        <div key={m} className="relative">
          <span className={`${chip} bg-accent-bg text-accent-ink`}>
            <button onClick={() => setAbierto(abierto === 'm:' + m ? null : 'm:' + m)} className="font-semibold" aria-haspopup="dialog" aria-expanded={abierto === 'm:' + m}>{textoRango(m, filtros.rangos[m])} ▾</button>
            <button onClick={() => poner(m, null)} aria-label={`Quitar filtro ${NOMBRE[m]}`} className="-mr-1 w-5 h-5 rounded-full inline-flex items-center justify-center hover:bg-white/70"><IconCerrar size={13} strokeWidth={2.6} /></button>
          </span>
          {abierto === 'm:' + m && <PopoverRango m={m} planes={planes} rango={filtros.rangos[m]} onAplicar={(r) => poner(m, r)} onBorrar={() => poner(m, null)} />}
        </div>
      ))}

      <div className="relative">
        <button onClick={() => setAbierto(abierto === 'tareas' ? null : 'tareas')} aria-haspopup="dialog" aria-expanded={abierto === 'tareas'} className={`${chip} ${filtros.tareas.length ? 'bg-accent-bg text-accent-ink font-semibold' : 'bg-surface-2 text-ink hover:bg-border'}`}>
          Tareas: {filtros.tareas.length ? filtros.tareas.join(', ') : 'todas'} ▾
        </button>
        {abierto === 'tareas' && <PopoverTareas valor={filtros.tareas} onCambio={(v) => setFiltros({ tareas: v })} onCerrar={() => setAbierto(null)} />}
      </div>

      {estado?.cargados && (() => {
        const mz = filtros.minZona || {}
        const poner = (z, v) => { const o = { ...mz }; if (v == null) delete o[z]; else o[z] = v; setFiltros({ minZona: o }); setAbierto(null) }
        return (
          <>
            {Object.keys(mz).map((z) => (
              <div key={z} className="relative">
                <span className={`${chip} bg-accent-bg text-accent-ink`}>
                  <button onClick={() => setAbierto(abierto === 'z:' + z ? null : 'z:' + z)} className="font-semibold" aria-haspopup="dialog" aria-expanded={abierto === 'z:' + z}>{z}: {textoZona(mz[z])} cargados ▾</button>
                  <button onClick={() => poner(z, null)} aria-label={`Quitar filtro de cargados en ${z}`} className="-mr-1 w-5 h-5 rounded-full inline-flex items-center justify-center hover:bg-white/70"><IconCerrar size={13} strokeWidth={2.6} /></button>
                </span>
                {abierto === 'z:' + z && <PopoverZona zona={z} planes={planes} estado={estado} valor={mz[z]} className="left-0 top-[46px]" onAplicar={(v) => poner(z, v)} onBorrar={() => poner(z, null)} />}
              </div>
            ))}
            <div className="relative">
              <button onClick={() => setAbierto(abierto === 'zonas' || abierto?.startsWith('zn:') ? null : 'zonas')} aria-haspopup="menu" aria-expanded={abierto === 'zonas' || !!abierto?.startsWith('zn:')}
                className={`${chip} bg-surface-2 text-ink hover:bg-border`}>Cargados por zona ▾</button>
              {(abierto === 'zonas' || abierto?.startsWith('zn:')) && (
                <div className="absolute left-0 top-[46px] z-50 w-[200px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,.18)] border border-border py-2" role="menu">
                  {estado.zonas.map((z) => (
                    <button key={z} role="menuitem" onClick={() => setAbierto('zn:' + z)}
                      className={`flex w-full items-center justify-between text-left px-4 py-2 text-[13.5px] hover:bg-surface ${abierto === 'zn:' + z ? 'bg-surface font-semibold' : ''}`}>
                      <span>{z}</span>{mz[z] != null ? <span className="text-accent text-[12px] font-semibold">{textoZona(mz[z])}</span> : <span className="text-muted">›</span>}
                    </button>
                  ))}
                </div>
              )}
              {abierto?.startsWith('zn:') && <PopoverZona key={abierto} zona={abierto.slice(3)} planes={planes} estado={estado} valor={mz[abierto.slice(3)]} className="left-[208px] top-[46px]"
                onAplicar={(v) => poner(abierto.slice(3), v)} onBorrar={() => poner(abierto.slice(3), null)} />}
            </div>
          </>
        )
      })()}

      <div className="relative">
        <button onClick={() => setAbierto(abierto === 'menu' ? null : 'menu')} aria-haspopup="menu" aria-expanded={abierto === 'menu'} disabled={!libres.length}
          className={`${chip} border border-dashed border-border-strong bg-white hover:bg-surface disabled:opacity-50`}>+ Añadir filtro</button>
        {abierto === 'menu' && (
          <div className="absolute left-0 top-[46px] z-50 w-[220px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,.18)] border border-border py-2" role="menu">
            {libres.map((m) => <button key={m} role="menuitem" className="block w-full text-left px-4 py-2 hover:bg-surface text-[13.5px]" onClick={() => setAbierto('n:' + m)}>{TITULO[m]}</button>)}
          </div>
        )}
        {abierto?.startsWith('n:') && <PopoverRango m={abierto.slice(2)} planes={planes} rango={null} onAplicar={(r) => poner(abierto.slice(2), r)} onBorrar={() => setAbierto(null)} />}
      </div>
      <span className="ml-auto text-[13px] text-muted" aria-live="polite">{resumen}</span>
      {accion}
    </div>
  )
}
