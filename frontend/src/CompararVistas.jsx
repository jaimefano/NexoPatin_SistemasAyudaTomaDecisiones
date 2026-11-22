import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter, ZAxis, LabelList, ReferenceArea, Cell,
} from 'recharts'
import { Tarjeta, Insignia, IconAviso, IconFlecha, IconCerrar, Camion } from './components/ui.jsx'
import { MinimapaPlan } from './components/MapView.jsx'
import { ZONAS, TEXTO_PLAN, claseVar, nombrePlan, num, sgn, resumenTarea, textoTareaCorto, tareasDe } from './utils.js'

// ---------------------------------------------------------------- piezas comunes
const FILAS = [
  { id: 'beneficio3', nombre: 'Beneficio 3 días', met: 'beneficio', d: 0, u: 'USD', get: (b, m) => b[m].beneficio3 },
  { id: 'beneficio1', nombre: 'Beneficio día 1', met: 'beneficio', d: 0, u: 'USD', get: (b, m) => b[m].beneficio1 },
  { id: 'coste', nombre: 'Coste de camiones', met: 'coste', d: 0, u: 'USD', get: (b, m) => b[m].coste },
  { id: 'demanda', nombre: 'Demanda atendida 3 días', met: 'demanda', d: 1, u: '%', du: 'pp', get: (b, m) => b[m].demanda * 100 },
  { id: 'perdidos', nombre: 'Viajes perdidos 3 días', met: 'perdidos', d: 0, u: '', get: (b, m) => b[m].perdidos },
  { id: 'bajos', nombre: 'Bajos sin cambiar', met: 'bajos', d: 0, u: '', get: (b) => b.bajos_sin_cambiar },
  { id: 'reserva', nombre: 'Reserva del taller', met: 'reserva', d: 0, u: '', get: (b) => b.reserva_taller },
]
const corta = (z) => (z === 'Norte-Centro' ? 'N-Centro' : z)
const MODOS = [{ valor: 'esperado', texto: 'Escenario esperado' }, { valor: 'peor', texto: 'Peor escenario' }]

export function Segmentado({ valor, onChange, opciones, className = '' }) {
  return (
    <div className={`inline-flex gap-1 bg-surface-2 rounded-full p-1 ${className}`} role="radiogroup">
      {opciones.map((o) => (
        <button key={o.valor} role="radio" aria-checked={valor === o.valor} onClick={() => onChange(o.valor)}
          className={`rounded-full h-9 px-4 text-[13px] font-semibold whitespace-nowrap transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta ${valor === o.valor ? 'bg-accent text-white' : 'text-ink hover:bg-accent-bg hover:text-accent-ink active:scale-95'}`}>{o.texto}</button>
      ))}
    </div>
  )
}

const mezcla = (a, b, t) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - t) + parseInt(b.slice(1 + i, 3 + i), 16) * t).toString(16).padStart(2, '0')).join('')
const colorCalor = (v, max) => mezcla('#FDE7D9', '#B2182B', max > 0 ? Math.min(1, v / max) : 0)
const colorDif = (d, max) => (d <= 0 ? mezcla('#F1F1F1', '#2E9E5B', max > 0 ? Math.min(1, -d / max) : 0) : mezcla('#F1F1F1', '#C0392B', max > 0 ? Math.min(1, d / max) : 0))

const Pie = ({ children }) => <p className="text-[12.5px] text-muted mt-3">{children}</p>

// ---------------------------------------------------------------- 1. MAPAS
function VistaMapas({ R, huecos, mapa, formato, modo }) {
  const zonas = (b) => b[modo].perdidos_zona
  const maxPer = Math.max(...zonas(R.nada), ...R.rutas.flatMap((r) => zonas(r)), 1)
  const maxDif = Math.max(...R.rutas.flatMap((r) => zonas(r).map((v, i) => Math.abs(v - zonas(R.nada)[i]))), 1)
  const [ampliado, setAmpliado] = useState(null)     // índice (en huecos) del mapa ampliado, o null
  useEffect(() => {
    if (ampliado == null) return
    const f = (e) => e.key === 'Escape' && setAmpliado(null)
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [ampliado])

  // Lo que pinta el mapa de cada plan según el formato
  const datosMapa = (h, k) => {
    const r = R.rutas[k]
    const pz = zonas(r), p0 = zonas(R.nada)
    let relleno, valores, cabecera
    if (formato === 'calor') {
      relleno = Object.fromEntries(ZONAS.map((z, i) => [z, colorCalor(pz[i], maxPer)]))
      valores = Object.fromEntries(ZONAS.map((z, i) => [z, num(pz[i])]))
      cabecera = `${num(r[modo].perdidos)} perdidos`
    } else if (formato === 'dif') {
      relleno = Object.fromEntries(ZONAS.map((z, i) => [z, colorDif(pz[i] - p0[i], maxDif)]))
      valores = Object.fromEntries(ZONAS.map((z, i) => [z, sgn(pz[i] - p0[i])]))
      cabecera = `${sgn(r[modo].perdidos - R.nada[modo].perdidos)} viajes perdidos`
    } else cabecera = `${tareasDe(h.p.ruta).length} tareas · ${num(r.minutos)} min`
    return { relleno, valores, cabecera }
  }
  const mapaDe = (h, k, clase) => {
    const { relleno, valores } = datosMapa(h, k)
    return <MinimapaPlan mapa={mapa} ruta={h.p.ruta} color={h.color} detalle relleno={relleno} valores={valores}
      flujos={formato === 'flujos'} sinFlechas={formato === 'calor' || formato === 'dif'} className={clase} titulo={`Mapa del plan ${h.letra}`} />
  }
  // Ampliado (como en Opciones): la columna del plan elegido se ensancha con una transición y empuja a las otras.
  // El mapa es un SVG (vectorial) y pasa al modo detalle, así que mantiene la nitidez a cualquier tamaño.
  const columnas = huecos.map((_, k) => `minmax(0,${ampliado == null ? 1 : k === ampliado ? 3 : 0.7}fr)`).join(' ')
  return (
    <div>
      <div className="grid gap-4 transition-[grid-template-columns] duration-300 ease-out" style={{ gridTemplateColumns: columnas }}>
        {huecos.map((h, k) => {
          const grande = ampliado === k, estrecho = ampliado != null && !grande
          const nombre = nombrePlan(h.p, h.i)
          return (
            <Tarjeta key={h.i} className="p-3.5 min-w-0">
              <div className="flex items-center gap-2.5 mb-2 min-w-0">
                <Insignia letra={h.letra} size={26} /><h3 className="text-[16px] font-bold truncate">{nombre}</h3>
                {!estrecho && <span className="ml-auto text-[13px] text-muted whitespace-nowrap">{datosMapa(h, k).cabecera}</span>}
                <button type="button" onClick={() => setAmpliado(grande ? null : k)} aria-expanded={grande} aria-label={`${grande ? 'Reducir' : 'Ampliar'} el mapa del ${nombre}`}
                  className={`${estrecho ? 'ml-auto' : 'ml-1'} shrink-0 inline-flex items-center rounded-full h-8 px-3 text-[12.5px] font-semibold bg-accent-bg text-accent-ink hover:bg-accent hover:text-white active:scale-95 transition-all duration-200`}>{grande ? 'Reducir' : estrecho ? '⤢' : 'Ampliar'}</button>
              </div>
              <button type="button" onClick={() => setAmpliado(grande ? null : k)} tabIndex={-1} aria-hidden="true" className={`block w-full rounded-xl ${grande ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}>
                {mapaDe(h, k, `w-full transition-[height] duration-300 ease-out ${ampliado == null ? 'h-[420px]' : 'h-[640px]'}`)}
              </button>
            </Tarjeta>
          )
        })}
      </div>
      {formato === 'calor' && <><Leyenda ini="Pocos viajes perdidos" fin="Muchos" grad="linear-gradient(90deg,#FDE7D9,#B2182B)" texto="Misma escala de color en los tres mapas." /><Pie>Número en cada zona: viajes perdidos en 3 días. Sin hacer nada: {ZONAS.map((z, i) => `${corta(z)} ${num(zonas(R.nada)[i])}`).join(' · ')}.</Pie></>}
      {formato === 'dif' && <><Leyenda ini="Mejora (menos perdidos)" fin="Empeora (más perdidos)" grad="linear-gradient(90deg,#2E9E5B,#F1F1F1,#C0392B)" texto="Cada zona frente a no hacer nada." /><Pie>Verde: el plan pierde menos viajes que no hacer nada; rojo: pierde más.</Pie></>}
      {formato === 'flujos' && <Pie>Cada flecha agrupa los patinetes movidos de un origen a un destino; el grosor y el número indican cuántos. Los cambios parten del taller.</Pie>}
      {formato === 'lado' && <Pie>Cada flecha es una tarea del plan: reubicar entre zonas o cambio de baterías desde el taller (cuadrado negro).</Pie>}
    </div>
  )
}

const Leyenda = ({ ini, fin, grad, texto }) => (
  <div className="flex items-center gap-2.5 text-[12.5px] text-muted mt-3">
    {ini}<span className="h-2.5 w-[200px] rounded-full inline-block" style={{ background: grad }} />{fin}<span className="mx-1">·</span>{texto}
  </div>
)

// ---------------------------------------------------------------- 2. DATOS
function Indicadores({ R, huecos, modo }) {
  return (
    <Tarjeta className="px-5 py-4">
      <table className="w-full text-[14px] border-collapse" aria-label="Indicadores de los planes frente a no hacer nada">
        <thead className="bg-surface">
          <tr>
            <th scope="col" className="text-left font-semibold px-3 py-2.5 text-[13px]">Indicador</th>
            <th scope="col" className="text-right font-semibold px-3 text-[13px]">No hacer nada</th>
            {huecos.map((h, k) => { const av = R.rutas[k].avisos || []; return <th key={h.i} scope="col" className="text-right font-semibold px-3 text-[13px] whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Insignia letra={h.letra} size={20} />{nombrePlan(h.p, h.i)}{av.length > 0 && <span className="text-warning-ink inline-flex" title={'Incumple un límite: ' + av.join(' · ')} role="img" aria-label={'Incumple un límite: ' + av.join(', ')}><IconAviso size={15} /></span>}</span></th> })}
          </tr>
        </thead>
        <tbody>
          {FILAS.map((f) => {
            const v0 = f.get(R.nada, modo)
            return (
              <tr key={f.id} className="border-b border-border">
                <th scope="row" className="text-left px-3 py-3 font-semibold">{f.nombre}</th>
                <td className="text-right px-3 text-muted">{num(v0, f.d)}{f.u ? ' ' + f.u : ''}</td>
                {R.rutas.map((r, k) => {
                  const v = f.get(r, modo), dif = v - v0
                  return (
                    <td key={k} className="text-right px-3 py-1.5 leading-tight whitespace-nowrap">
                      <div className="font-semibold">{num(v, f.d)}{f.u ? ' ' + f.u : ''}</div>
                      <div className={`text-[12.5px] font-semibold ${claseVar(f.met, dif)}`}>{sgn(dif, f.d)}{f.du ? ' ' + f.du : f.u ? ' ' + f.u : ''}</div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <Pie>{modo === 'peor' ? 'Peor escenario: el de demanda más desfavorable de los tres.' : 'Valor esperado: media de los tres escenarios de demanda.'} Verde: mejora respecto a no hacer nada; rojo: empeora.</Pie>
    </Tarjeta>
  )
}

function Limites({ R, huecos, limites }) {
  const l = limites || {}
  return (
    <div className={`grid gap-4 ${huecos.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {huecos.map((h, k) => {
        const r = R.rutas[k], av = r.avisos || []
        const filas = [
          ['Coste de camiones', `${num(r.esperado.coste)} USD`, l.coste_max != null ? `límite: ${num(l.coste_max)} USD` : 'sin límite'],
          ['Reserva del taller', num(r.reserva_taller), l.reserva_min != null ? `mínimo: ${num(l.reserva_min)}` : 'sin mínimo'],
          ['Bajos sin cambiar', num(r.bajos_sin_cambiar), 'al terminar la noche'],
          ['Minutos de camión', `${num(r.minutos)} min`, 'suma de los 4 camiones'],
        ]
        return (
          <Tarjeta key={h.i} className="px-5 py-4">
            <div className="flex items-center gap-2.5 mb-3"><Insignia letra={h.letra} size={26} /><h3 className="text-[17px] font-bold">{nombrePlan(h.p, h.i)}</h3></div>
            <div className={`rounded-xl px-3.5 py-2.5 mb-3 text-[14px] font-semibold ${av.length ? 'bg-[#FFF3D6] text-warning-ink' : 'bg-surface text-positive'}`}>
              {av.length ? <span className="inline-flex items-start gap-1.5"><IconAviso size={16} className="mt-0.5 shrink-0" />Incumple: {av.join(' · ')}</span> : '✓ Cumple todos los límites'}
            </div>
            <dl className="text-[14px]">
              {filas.map(([n, v, nota]) => (
                <div key={n} className="flex items-baseline py-2 border-b border-border last:border-0"><dt className="font-semibold">{n}<span className="block text-[12px] text-muted font-normal">{nota}</span></dt><dd className="ml-auto font-semibold">{v}</dd></div>
              ))}
            </dl>
          </Tarjeta>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- 3. GRÁFICOS
const EJES_RADAR = [
  { id: 'ben', nombre: 'Beneficio', sube: true, get: (b, m) => b[m].beneficio3, f: (v) => `${num(v)} USD` },
  { id: 'dem', nombre: 'Demanda atendida', sube: true, get: (b, m) => b[m].demanda * 100, f: (v) => `${num(v, 1)} %` },
  { id: 'per', nombre: 'Menos viajes perdidos', sube: false, get: (b, m) => b[m].perdidos, f: (v) => `${num(v)} perdidos` },
  { id: 'cos', nombre: 'Menos coste', sube: false, get: (b, m) => b[m].coste, f: (v) => `${num(v)} USD` },
  { id: 'baj', nombre: 'Menos bajos', sube: false, get: (b) => b.bajos_sin_cambiar, f: (v) => `${num(v)} bajos` },
  { id: 'res', nombre: 'Reserva taller', sube: true, get: (b) => b.reserva_taller, f: (v) => `${num(v)} en reserva` },
]
function datosRadar(R, huecos, modo) {
  const todos = [R.nada, ...R.rutas]
  return EJES_RADAR.map((e) => {
    const vals = todos.map((b) => e.get(b, modo)), mn = Math.min(...vals), mx = Math.max(...vals)
    const punt = (v) => (mx === mn ? 55 : 10 + 90 * ((e.sube ? v - mn : mx - v) / (mx - mn)))
    const fila = { eje: e.nombre, nada: punt(vals[0]), raw_nada: e.f(vals[0]) }
    huecos.forEach((h, k) => { fila[h.letra] = punt(vals[k + 1]); fila['raw_' + h.letra] = e.f(vals[k + 1]) })
    return fila
  })
}

// Información que acompaña a la telaraña: valor real de cada eje, mejor plan por eje y puntuación media de cada plan.
const PESO_BASE = 5   // peso por defecto de cada KPI (todos iguales)
function infoRadar(R, huecos, modo, pesosIn) {
  huecos = huecos.slice(0, R.rutas.length)
  const todos = [R.nada, ...R.rutas]
  const ejes = EJES_RADAR.map((e) => {
    const vals = todos.map((b) => e.get(b, modo)), mn = Math.min(...vals), mx = Math.max(...vals)
    const punt = (v) => (mx === mn ? 55 : 10 + 90 * ((e.sube ? v - mn : mx - v) / (mx - mn)))
    const planes = vals.slice(1)
    const mejorVal = e.sube ? Math.max(...planes) : Math.min(...planes)
    return {
      nombre: e.nombre, sube: e.sube, empate: mx === mn,
      nada: { txt: e.f(vals[0]), punt: punt(vals[0]) },
      planes: planes.map((v) => ({ txt: e.f(v), punt: punt(v), mejor: mx !== mn && v === mejorVal })),
    }
  })
  let w = ejes.map((_, i) => pesosIn?.[i] ?? PESO_BASE)
  if (!w.some((x) => x > 0)) w = w.map(() => PESO_BASE)         // sin ningún peso: se vuelve al reparto igual
  const sw = w.reduce((s, x) => s + x, 0)
  ejes.forEach((e, i) => { e.peso = w[i] / sw })                  // parte de la nota que aporta cada eje (suma 1)
  const medias = huecos.map((_, k) => ejes.reduce((s, e) => s + e.planes[k].punt * e.peso, 0))
  const mediaNada = ejes.reduce((s, e) => s + e.nada.punt * e.peso, 0)
  const pesos = huecos.map((_, k) => ejes.filter((e) => e.peso > 0 && e.planes[k].mejor).map((e) => e.nombre))
  const peores = huecos.map((_, k) => ejes.filter((e) => e.peso > 0 && !e.empate && e.planes[k].punt <= 10.5).map((e) => e.nombre))
  return { ejes, medias, mediaNada, mejores: pesos, peores, ganador: medias.indexOf(Math.max(...medias)) }
}

// Popover de peso de un KPI (mismo aspecto que los filtros de Opciones)
function PopoverPeso({ nombre, valor, suma, className, onAplicar, onBorrar }) {
  const [v, setV] = useState(valor)
  const total = suma + v
  const parte = total > 0 ? Math.round((v / total) * 100) : 0
  return (
    <div className={`absolute z-50 w-[290px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,.18)] border border-border p-4 text-left ${className}`} role="dialog" aria-label={`Peso de ${nombre}`}>
      <div className="flex items-baseline justify-between mb-1">
        <b className="text-[14px]">Peso: {nombre}</b><span className="text-accent font-bold text-[13px]">{v === PESO_BASE ? 'normal' : v === 0 ? 'no cuenta' : `${v} de 10`}</span>
      </div>
      <p className="text-[12px] text-muted mb-3">Aporta el {parte} % de la nota con este peso.</p>
      <div className="rango2">
        <div className="pista" />
        <input type="range" min={0} max={10} step={1} value={v} aria-label={`Peso de ${nombre}`} onChange={(e) => setV(Number(e.target.value))} style={{ pointerEvents: 'auto' }} />
      </div>
      <div className="flex justify-between text-[12px] text-muted mt-0.5"><span>0 · no cuenta</span><span>10 · lo máximo</span></div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <button className="h-10 rounded-full bg-surface-2 font-semibold hover:bg-border" onClick={onBorrar}>Borrar</button>
        <button className="h-10 rounded-full bg-cta text-white font-semibold hover:bg-cta-hover" onClick={() => onAplicar(v)}>Aplicar</button>
      </div>
    </div>
  )
}

function PanelRadar({ R, huecos: hs, modo }) {
  const huecos = hs.slice(0, R.rutas.length)   // por si R y los planes elegidos van desfasados un instante
  const [pw, setPw] = useState(() => EJES_RADAR.map(() => PESO_BASE))
  const info = useMemo(() => infoRadar(R, huecos, modo, pw), [R, hs, modo, pw])
  const igual = pw.every((x) => x === pw[0])
  const [abierto, setAbierto] = useState(null)       // 'menu' | 'm:<i>' (menú abierto con el deslizador de ese KPI) | 'c:<i>' (chip ya aplicado)
  const raiz = useRef(null)
  useEffect(() => {
    const f = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAbierto(null) }
    const k = (e) => e.key === 'Escape' && setAbierto(null)
    document.addEventListener('mousedown', f); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', k) }
  }, [])
  const poner = (i, v) => { setPw((o) => o.map((x, j) => (j === i ? v : x))); setAbierto(null) }
  const chip = 'inline-flex items-center gap-1.5 rounded-full h-10 px-4 text-[13px] font-medium whitespace-nowrap'
  if (!huecos.length) return null
  return (
    <div className="space-y-4 min-w-0">
      <Tarjeta className="px-5 py-4">
        <h3 className="text-[16px] font-bold">Equilibrio de cada plan</h3>
        <p className="text-[12.5px] text-muted mb-2">Puntuación media {igual ? 'de los 6 ejes, todos con el mismo peso' : 'ponderada con tus pesos'} (de 10 a 100). {modo === 'peor' ? 'Peor escenario de demanda.' : 'Escenario esperado.'}</p>
        <div ref={raiz} className="flex items-center gap-2 flex-wrap mb-3" role="group" aria-label="Pesos de cada KPI">
          {EJES_RADAR.map((e, i) => pw[i] !== PESO_BASE && (
            <div key={e.id} className="relative">
              <span className={`${chip} bg-accent-bg text-accent-ink`}>
                <button onClick={() => setAbierto(abierto === 'c:' + i ? null : 'c:' + i)} className="font-semibold" aria-haspopup="dialog" aria-expanded={abierto === 'c:' + i}>{e.nombre}: peso {pw[i]} ▾</button>
                <button onClick={() => poner(i, PESO_BASE)} aria-label={`Quitar peso de ${e.nombre}`} className="-mr-1 w-5 h-5 rounded-full inline-flex items-center justify-center hover:bg-white/70"><IconCerrar size={13} strokeWidth={2.6} /></button>
              </span>
              {abierto === 'c:' + i && <PopoverPeso key={'c' + i} nombre={e.nombre} valor={pw[i]} suma={pw.reduce((s, x, j) => s + (j === i ? 0 : x), 0)} className="left-0 top-[46px]" onAplicar={(v) => poner(i, v)} onBorrar={() => poner(i, PESO_BASE)} />}
            </div>
          ))}
          <div className="relative">
            <button onClick={() => setAbierto(abierto === 'menu' || abierto?.startsWith('m:') ? null : 'menu')} aria-haspopup="menu" aria-expanded={abierto === 'menu' || !!abierto?.startsWith('m:')}
              className={`${chip} border border-dashed border-border-strong bg-white hover:bg-surface`}>+ Dar más peso a un KPI</button>
            {(abierto === 'menu' || abierto?.startsWith('m:')) && (
              <div className="absolute left-0 top-[46px] z-50 w-[220px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,.18)] border border-border py-2" role="menu">
                {EJES_RADAR.map((e, i) => (
                  <button key={e.id} role="menuitem" onClick={() => setAbierto('m:' + i)} className={`flex w-full items-center justify-between text-left px-4 py-2 text-[13.5px] hover:bg-surface ${abierto === 'm:' + i ? 'bg-surface font-semibold' : ''}`}>
                    <span>{e.nombre}</span>{pw[i] !== PESO_BASE ? <span className="text-accent text-[12px] font-semibold">{pw[i]}</span> : <span className="text-muted">›</span>}
                  </button>
                ))}
              </div>
            )}
            {abierto?.startsWith('m:') && (() => { const i = Number(abierto.slice(2)); return <PopoverPeso key={abierto} nombre={EJES_RADAR[i].nombre} valor={pw[i]} suma={pw.reduce((s, x, j) => s + (j === i ? 0 : x), 0)} className="left-[228px] top-[46px]" onAplicar={(v) => poner(i, v)} onBorrar={() => poner(i, PESO_BASE)} /> })()}
          </div>
          {!igual && <button type="button" onClick={() => setPw(EJES_RADAR.map(() => PESO_BASE))} className="text-[12.5px] text-muted underline hover:text-ink">Igualar todos</button>}
        </div>
        <div className="space-y-2.5">
          {huecos.map((h, k) => (
            <div key={h.i}>
              <div className="flex items-center gap-2 text-[14px]">
                <Insignia letra={h.letra} size={22} /><span className="font-semibold truncate">{nombrePlan(h.p, h.i)}</span>
                <span className="ml-auto font-bold">{num(info.medias[k])}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 mt-1.5 overflow-hidden"><div className="h-full rounded-full" style={{ width: info.medias[k] + '%', background: h.color }} /></div>
              <div className="text-[12.5px] text-muted mt-1">
                {info.mejores[k].length ? <>Mejor en: {info.mejores[k].join(', ').toLowerCase()}.</> : 'No es el mejor en ningún eje.'}
                {info.peores[k].length > 0 && <> Punto débil: {info.peores[k].join(', ').toLowerCase()}.</>}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 text-[13px] text-muted pt-1 border-t border-border"><span>No hacer nada</span><span className="ml-auto font-semibold">{num(info.mediaNada)}</span></div>
        </div>
      </Tarjeta>
      <Tarjeta className="px-5 py-4">
        <h3 className="text-[16px] font-bold mb-1">Valor real de cada eje</h3>
        <table className="w-full text-[13px] border-collapse" aria-label="Valores reales de los ejes de la telaraña">
          <thead className="bg-surface">
            <tr>
              <th scope="col" className="text-left font-semibold px-2 py-2 text-[12px]">Eje</th>
              <th scope="col" className="text-right font-semibold px-2 text-[12px]">Nada</th>
              {huecos.map((h) => <th key={h.i} scope="col" className="text-right font-semibold px-2 text-[12px]"><span className="inline-flex items-center gap-1"><Insignia letra={h.letra} size={18} /></span></th>)}
            </tr>
          </thead>
          <tbody>
            {info.ejes.map((e) => (
              <tr key={e.nombre} className="border-b border-border last:border-0">
                <th scope="row" className="text-left px-2 py-2 font-semibold leading-tight">{e.nombre}<span className="block text-[11px] text-muted font-normal">{e.sube ? 'más es mejor' : 'menos es mejor'}</span></th>
                <td className="text-right px-2 text-muted whitespace-nowrap">{e.nada.txt}</td>
                {e.planes.map((p, k) => (
                  <td key={k} className={`text-right px-2 whitespace-nowrap ${p.mejor ? 'font-bold text-positive' : ''}`}>{p.txt}{p.mejor && <span aria-label="mejor plan en este eje"> ✓</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <Pie>✓ marca el mejor plan en cada eje. En la telaraña, cada eje va de 10 (peor de los cuatro) a 100 (mejor de los cuatro), incluyendo «no hacer nada».</Pie>
      </Tarjeta>
    </div>
  )
}

function GrafRadar({ R, huecos, modo, pequeno = false }) {
  const datos = useMemo(() => datosRadar(R, huecos, modo), [R, huecos, modo])
  const tip = ({ active, payload, label }) => active && payload?.length ? (
    <div className="bg-white border border-border rounded-lg px-3 py-2 text-[12.5px] shadow-float">
      <div className="font-bold mb-1">{label}</div>
      <div className="text-muted">No hacer nada: {payload[0].payload.raw_nada}</div>
      {huecos.map((h) => <div key={h.letra} style={{ color: h.color }} className="font-semibold">Plan {h.letra}: {payload[0].payload['raw_' + h.letra]}</div>)}
    </div>
  ) : null
  const graf = (
    <ResponsiveContainer>
      <RadarChart data={datos} outerRadius={pequeno ? '80%' : '72%'}>
        <PolarGrid stroke="#DDD" />
        {!pequeno && <PolarAngleAxis dataKey="eje" tick={{ fontSize: 13, fill: '#222' }} />}
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="nada" stroke="#9A9A9A" strokeDasharray="5 4" fill="#9A9A9A" fillOpacity={0.06} isAnimationActive={false} />
        {huecos.map((h) => <Radar key={h.letra} dataKey={h.letra} stroke={h.color} strokeWidth={2.5} fill={h.color} fillOpacity={0.14} isAnimationActive={false} />)}
        {!pequeno && <Tooltip content={tip} />}
      </RadarChart>
    </ResponsiveContainer>
  )
  if (pequeno) return graf
  return (
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
      <Tarjeta className="px-5 py-4">
        <h3 className="text-[17px] font-bold">Perfil de cada plan</h3>
        <p className="text-[12.5px] text-muted">Cada eje va de peor a mejor entre los planes: cuanto más lejos del centro, mejor. Gana el plan más equilibrado, no solo el más rentable. Pasa el ratón por un eje para ver los valores reales.</p>
        <div style={{ height: 440 }} role="img" aria-label="Gráfico de telaraña de los planes">{graf}</div>
        <LeyendaPlanes huecos={huecos} nada />
      </Tarjeta>
      <PanelRadar R={R} huecos={huecos} modo={modo} />
    </div>
  )
}

const LeyendaPlanes = ({ huecos, nada }) => (
  <div className="flex items-center gap-4 text-[12.5px] text-muted">
    {nada && <span><i className="inline-block w-3 h-3 bg-[#CFCFCF] mr-1.5 align-[-1px]" />No hacer nada</span>}
    {huecos.map((h) => <span key={h.letra}><i className="inline-block w-3 h-3 mr-1.5 align-[-1px]" style={{ background: h.color }} />Plan {h.letra}</span>)}
  </div>
)

// ---- Coste-beneficio: ganancia sobre no hacer nada (USD) frente al coste de camiones, en el escenario esperado y en el peor
const lista = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : a[0])

// Marcas "bonitas" (1, 2, 5 × 10ⁿ) para que los ejes no muestren valores raros
function ticksBonitos(min, max, n = 5) {
  const bruto = Math.max(max - min, 1) / n, mag = 10 ** Math.floor(Math.log10(bruto)), f = bruto / mag
  const paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag
  const ini = Math.floor(min / paso), fin = Math.ceil(max / paso)
  const t = []
  for (let i = ini; i <= fin; i++) t.push(Math.round(i * paso * 1000) / 1000)
  return t
}

function infoDisp(R, huecos) {
  const n = Math.min(huecos.length, R.rutas.length)
  const planes = huecos.slice(0, n).map((h, k) => {
    const r = R.rutas[k], e = r.esperado, p = r.peor
    const gE = e.beneficio3 - R.nada.esperado.beneficio3, gP = p.beneficio3 - R.nada.peor.beneficio3
    return { h, k, r, coste: e.coste, costeP: p.coste, gE, gP, rent: e.coste > 0 ? gE / e.coste : null, rentP: p.coste > 0 ? gP / p.coste : null, avisos: r.avisos || [] }
  })
  const conRent = planes.filter((x) => x.rent != null)
  const masRent = conRent.length ? conRent.reduce((a, x) => (x.rent > a.rent ? x : a)) : null
  const masBen = planes.length ? planes.reduce((a, x) => (x.gE > a.gE ? x : a)) : null
  return { planes, masRent, masBen }
}

function frasesDisp(info, pres) {
  const f = []
  const { masBen, masRent, planes } = info
  if (masBen) {
    if (masBen.gE > 0) f.push(`El Plan ${masBen.h.letra} es el que más beneficio da sobre no hacer nada (${sgn(masBen.gE)} USD).`)
    else f.push(`Ningún plan mejora a no hacer nada en el escenario esperado: el Plan ${masBen.h.letra} es el que menos pierde (${sgn(masBen.gE)} USD).`)
  }
  if (masRent && masRent.gE > 0) f.push(`El Plan ${masRent.h.letra} es el más rentable: ${num(masRent.rent, 2)} USD de beneficio por cada USD gastado en camiones.`)
  const cae = planes.filter((x) => x.gE > 0 && x.gP <= 0).map((x) => x.h.letra)
  if (cae.length) f.push(`${cae.length > 1 ? 'Los planes' : 'El plan'} ${lista(cae)} ${cae.length > 1 ? 'ganan' : 'gana'} en el escenario esperado pero ${cae.length > 1 ? 'pierden' : 'pierde'} en el peor.`)
  const firmes = planes.filter((x) => x.gP > 0).map((x) => x.h.letra)
  if (firmes.length) f.push(`${firmes.length > 1 ? 'Los planes' : 'El plan'} ${lista(firmes)} ${firmes.length > 1 ? 'mantienen' : 'mantiene'} el beneficio incluso en el peor escenario.`)
  const pasan = planes.filter((x) => x.avisos.length).map((x) => x.h.letra)
  if (pasan.length) f.push(`${pasan.length > 1 ? 'Los planes' : 'El plan'} ${lista(pasan)} ${pasan.length > 1 ? 'incumplen' : 'incumple'} algún límite.`)
  if (pres != null) {
    const dentro = planes.filter((x) => x.coste <= pres).map((x) => x.h.letra), fuera = planes.filter((x) => x.coste > pres).map((x) => x.h.letra)
    f.push(`Con un presupuesto de ${num(pres)} USD: ${dentro.length ? `caben ${lista(dentro)}` : 'no cabe ningún plan'}${fuera.length ? ` y se pasa${fuera.length > 1 ? 'n' : ''} ${lista(fuera)}` : ''}.`)
  }
  return f
}

const ESC_VER = [{ valor: 'ambos', texto: 'Ambos escenarios' }, { valor: 'esperado', texto: 'Esperado' }, { valor: 'peor', texto: 'Peor' }]

function DetalleDisp({ R, x }) {
  if (!x) return <Tarjeta className="px-5 py-4"><h3 className="text-[16px] font-bold mb-1">Detalle de un plan</h3><p className="text-[13px] text-muted">Pasa el ratón por un plan, o púlsalo, para ver aquí todos sus números. Púlsalo otra vez para soltarlo.</p></Tarjeta>
  const filas = [
    ['Beneficio sobre no hacer nada', 'beneficio', (b, m) => b[m].beneficio3 - R.nada[m].beneficio3, (v) => `${sgn(v)} USD`],
    ['Coste de camiones', 'coste', (b, m) => b[m].coste, (v) => `${num(v)} USD`],
    ['Viajes perdidos de más (+) o de menos (−)', 'perdidos', (b, m) => b[m].perdidos - R.nada[m].perdidos, (v) => sgn(v)],
    ['Demanda atendida', 'demanda', (b, m) => (b[m].demanda - R.nada[m].demanda) * 100, (v) => `${sgn(v, 1)} pp`],
  ]
  const dias = [0, 1, 2].map((d) => x.r.por_dia.esperado[d] - R.nada.por_dia.esperado[d])
  const tareas = tareasDe(x.h.p.ruta).length
  return (
    <Tarjeta className="px-5 py-4">
      <div className="flex items-center gap-2.5 mb-1"><Insignia letra={x.h.letra} size={26} /><h3 className="text-[16px] font-bold truncate">{nombrePlan(x.h.p, x.h.i)}</h3><span className="ml-auto text-[12.5px] text-muted whitespace-nowrap">{tareas} tareas · {num(x.r.minutos)} min</span></div>
      <p className="text-[12px] text-muted mb-2">Cambios frente a no hacer nada. Verde: mejora; rojo: empeora.</p>
      <table className="w-full text-[13px] border-collapse">
        <thead className="bg-surface"><tr><th className="text-left font-semibold px-2 py-1.5 text-[12px]" /><th scope="col" className="text-right font-semibold px-2 text-[12px]">Esperado</th><th scope="col" className="text-right font-semibold px-2 text-[12px]">Peor</th></tr></thead>
        <tbody>
          {filas.map(([n, met, get, fmt]) => {
            const e = get(x.r, 'esperado'), p = get(x.r, 'peor'), neutro = met === 'coste'
            return (
              <tr key={n} className="border-b border-border last:border-0">
                <th scope="row" className="text-left px-2 py-2 font-semibold">{n}</th>
                <td className={`text-right px-2 whitespace-nowrap font-semibold ${neutro ? '' : claseVar(met, met === 'beneficio' ? e : e)}`}>{fmt(e)}</td>
                <td className={`text-right px-2 whitespace-nowrap font-semibold ${neutro ? '' : claseVar(met, p)}`}>{fmt(p)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-3 text-[12px] font-semibold text-muted">Beneficio acumulado sobre no hacer nada (esperado)</div>
      <div className="grid grid-cols-3 gap-2 mt-1">
        {dias.map((v, d) => <div key={d} className="bg-surface rounded-lg px-2.5 py-1.5"><div className="text-[11.5px] text-muted">Día {d + 1}</div><div className={`text-[14px] font-bold ${claseVar('beneficio', v)}`}>{sgn(v)}</div></div>)}
      </div>
    </Tarjeta>
  )
}

function GrafDispersion({ R, huecos, limites }) {
  const info = useMemo(() => infoDisp(R, huecos), [R, huecos])
  const cmax = limites?.coste_max
  const [ver, setVer] = useState('ambos')
  const [sel, setSel] = useState(null)
  const [hov, setHov] = useState(null)
  const [pres, setPres] = useState(null)
  const act = hov ?? sel
  const xAct = info.planes.find((x) => x.h.letra === act) || null

  const xs = info.planes.flatMap((x) => [x.coste, x.costeP]), ys = info.planes.flatMap((x) => [x.gE, x.gP])
  const xt = ticksBonitos(0, Math.max(...xs, cmax ?? 0, 1) * 1.15)
  const xmax = xt[xt.length - 1]
  const rango = Math.max(Math.max(...ys, 0) - Math.min(...ys, 0), 1)
  const yt = ticksBonitos(Math.min(...ys, 0) - rango * 0.12, Math.max(...ys, 0) + rango * 0.1)
  const y0 = yt[0], y1 = yt[yt.length - 1]

  const alternar = (l) => setSel((s) => (s === l ? null : l))
  const forma = (letra, color) => ({ cx, cy, payload }) => {
    // Círculo grande con la letra = el punto principal (esperado, o el peor si solo se ve ese). Anillo pequeño = el peor caso, unido por la línea.
    const dim = act && act !== letra, grande = act === letra
    const principal = payload.etq
    const col = payload.peor && !principal ? color : color
    return (
      <g opacity={dim ? 0.4 : 1} style={{ cursor: 'pointer' }}>
        {principal
          ? <><circle cx={cx} cy={cy} r={grande ? 18 : 16} fill={col} stroke="#fff" strokeWidth={3} />
              <text x={cx} y={cy + 5.5} textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff">{letra}</text></>
          : <circle cx={cx} cy={cy} r={6} fill="#fff" stroke={col} strokeWidth={3} />}
        {principal && <text x={cx + 24} y={cy - 1} fontSize="14.5" fontWeight="800" fill="#222" stroke="#fff" strokeWidth="4" paintOrder="stroke">{payload.peor ? 'Peor caso: ' : ''}{sgn(payload.y)} USD
          <tspan x={cx + 24} dy="16" fontSize="12" fontWeight="500" fill="#6B6B6B">{payload.otro != null ? `peor caso: ${sgn(payload.otro)}` : `gasta ${num(payload.x)}`}</tspan></text>}
      </g>
    )
  }
  const tip = ({ active, payload }) => {
    const d = active && payload?.length ? payload[0].payload : null
    if (!d) return null
    return (
      <div className="bg-white border border-border rounded-lg px-3 py-2 text-[12.5px] shadow-float">
        <div className="font-bold mb-0.5" style={{ color: d.color }}>Plan {d.letra} · {d.peor ? 'peor escenario' : 'escenario esperado'}</div>
        <div>Coste: <b>{num(d.x)} USD</b></div>
        <div>Beneficio sobre no hacer nada: <b className={claseVar('beneficio', d.y)}>{sgn(d.y)} USD</b></div>
        {d.rent != null && <div>Beneficio por USD gastado: <b>{sgn(d.rent, 2)}</b></div>}
        <div className="text-muted mt-1">Púlsalo para ver su detalle</div>
      </div>
    )
  }
  const frases = frasesDisp(info, pres)
  const pasoPres = Math.max(1, Math.round(xmax / 200))
  const dentro = (x) => pres == null || x.coste <= pres

  const hayGanancia = info.planes.some((x) => x.gE > 0)
  return (
    <div className="space-y-4">
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
      <Tarjeta className="px-5 py-4">
        <h3 className="text-[17px] font-bold">Coste frente a beneficio</h3>
        <p className="text-[12.5px] text-muted">Cada círculo es un plan. <b>Más a la izquierda</b>: gasta menos en camiones. <b>Más arriba</b>: gana más que no hacer nada. El círculo grande es el escenario esperado; el anillo pequeño, unido por una barra, es el peor caso. Pulsa un plan para ver su detalle.</p>
        <div className="flex items-center gap-3 flex-wrap my-2.5">
          <Segmentado valor={ver} onChange={setVer} opciones={ESC_VER} />
          <div className="ml-auto flex items-center gap-2 text-[12.5px]">
            {pres == null
              ? <button type="button" onClick={() => setPres(Math.round((cmax ?? xmax / 1.15 / 1.2) / pasoPres) * pasoPres)} className="rounded-full h-9 px-3.5 font-semibold bg-accent-bg text-accent-ink hover:bg-accent hover:text-white active:scale-95 transition-all duration-200">+ Probar un presupuesto</button>
              : <>
                  <label className="inline-flex items-center gap-3 font-semibold text-[13px]">Presupuesto de camiones
                    <input type="range" min={0} max={xmax} step={pasoPres} value={pres} onChange={(e) => setPres(Number(e.target.value))} className="rango-pres w-[190px]" style={{ '--p': (pres / xmax) * 100 + '%' }} aria-label="Presupuesto de camiones en USD" />
                    <span className="rounded-full bg-surface-2 text-ink px-3 py-1 text-[13.5px] font-bold whitespace-nowrap min-w-[84px] text-center">{num(pres)} USD</span></label>
                  <button type="button" onClick={() => setPres(null)} className="rounded-full h-8 px-3 font-semibold bg-surface-2 hover:bg-border whitespace-nowrap">Quitar</button>
                </>}
          </div>
        </div>
        <div style={{ height: 450 }} role="img" aria-label="Dispersión de coste frente a beneficio">
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 14, right: 130, bottom: 30, left: 8 }}>
              <CartesianGrid stroke="#EEEEEE" />
              <ReferenceArea x1={0} x2={xmax} y1={0} y2={y1} fill="#2E9E5B" fillOpacity={0.05} stroke="none" label={{ value: '▲ Ganas más que sin hacer nada', position: 'insideTopLeft', fontSize: 12, fontWeight: 600, fill: '#2E7D4F' }} />
              <ReferenceArea x1={0} x2={xmax} y1={y0} y2={0} fill="#fff" fillOpacity={0} stroke="none" label={{ value: '▼ Pierdes frente a no hacer nada', position: 'insideBottomLeft', fontSize: 12, fontWeight: 600, fill: '#8A8A8A' }} />
              <XAxis type="number" dataKey="x" name="Coste" ticks={xt} domain={[0, xmax]} allowDataOverflow tick={{ fontSize: 12 }} stroke="#AFAFAF" tickFormatter={(v) => num(v)} label={{ value: 'Coste de camiones (USD) → más gasto', position: 'insideBottom', offset: -16, fontSize: 12.5, fill: '#6B6B6B' }} />
              <YAxis type="number" dataKey="y" name="Beneficio" ticks={yt} domain={[y0, y1]} allowDataOverflow tick={{ fontSize: 12 }} stroke="#AFAFAF" tickFormatter={(v) => num(v)} width={60} label={{ value: '↑ Beneficio sobre no hacer nada (USD)', angle: -90, position: 'insideLeft', offset: -2, fontSize: 12.5, fill: '#6B6B6B', style: { textAnchor: 'middle' } }} />
              <ZAxis range={[260, 260]} />
              <ReferenceLine y={0} stroke="#444" strokeWidth={1.5} label={{ value: 'no hacer nada', position: 'right', fontSize: 11.5, fontWeight: 600, fill: '#444' }} />
              {cmax != null && <ReferenceLine x={cmax} stroke="#C0392B" strokeDasharray="6 4" label={{ value: `límite ${num(cmax)}`, position: 'top', fontSize: 11.5, fill: '#C0392B' }} />}
              {pres != null && <ReferenceArea x1={pres} x2={xmax} y1={y0} y2={y1} fill="#6B6B6B" fillOpacity={0.09} stroke="none" label={{ value: 'Fuera de presupuesto', position: 'insideBottomRight', fontSize: 11.5, fontWeight: 600, fill: '#6B6B6B' }} />}
              {pres != null && <ReferenceLine x={pres} stroke="#11A5A5" strokeWidth={2} label={{ value: `presupuesto ${num(pres)}`, position: 'insideTopRight', fontSize: 11.5, fontWeight: 600, fill: '#0A6B6B' }} />}
              <Tooltip content={tip} cursor={false} />
              {info.planes.map((x) => {
                const L = x.h.letra
                const pts = []
                // El anillo del peor caso va primero para que el círculo grande se dibuje encima
                if (ver !== 'esperado') pts.push({ x: x.costeP, y: x.gP, peor: true, etq: ver === 'peor', letra: L, color: x.h.color, rent: x.rentP })
                if (ver !== 'peor') pts.push({ x: x.coste, y: x.gE, peor: false, etq: true, letra: L, color: x.h.color, rent: x.rent, otro: ver === 'ambos' ? x.gP : null })
                const dim = act && act !== L
                return (
                  <Scatter key={L} name={`Plan ${L}`} data={pts} fill={x.h.color} shape={forma(L, x.h.color)} isAnimationActive={false}
                    line={pts.length > 1 ? { stroke: x.h.color, strokeWidth: 5, strokeLinecap: 'round', strokeOpacity: dim ? 0.12 : 0.35 } : false}
                    onMouseEnter={() => setHov(L)} onMouseLeave={() => setHov(null)} onClick={() => alternar(L)} />
                )
              })}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 text-[12.5px] text-muted flex-wrap">
          <span><i className="inline-block w-4 h-4 rounded-full bg-muted mr-1.5 align-[-3px]" />Escenario esperado</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-full border-[3px] border-muted bg-white mr-1.5 align-[-1px]" />Peor escenario</span>
          {cmax != null && <span><i className="inline-block w-4 border-t-2 border-dashed border-[#C0392B] mr-1.5 align-[3px]" />Límite de coste</span>}
          {pres != null && <span><i className="inline-block w-4 border-t-2 border-[#11A5A5] mr-1.5 align-[3px]" />Tu presupuesto</span>}
        </div>
      </Tarjeta>
      <div className="space-y-4 min-w-0">
        <Tarjeta className="px-5 py-4">
          <h3 className="text-[16px] font-bold">Cuánto rinde cada USD</h3>
          <p className="text-[12.5px] text-muted mb-2">Pulsa un plan para ver su detalle. Beneficio sobre no hacer nada, en USD.</p>
          <table className="w-full text-[13px] border-collapse" aria-label="Rentabilidad de cada plan">
            <thead className="bg-surface"><tr>
              <th scope="col" className="text-left font-semibold px-2 py-2 text-[12px]">Plan</th>
              <th scope="col" className="text-right font-semibold px-2 text-[12px]">Beneficio</th>
              <th scope="col" className="text-right font-semibold px-2 text-[12px]">Coste</th>
              {hayGanancia && <th scope="col" className="text-right font-semibold px-2 text-[12px]">Por USD gastado</th>}
              <th scope="col" className="text-right font-semibold px-2 text-[12px]">Peor caso</th>
            </tr></thead>
            <tbody>
              {info.planes.map((x) => {
                const L = x.h.letra, gana = info.masRent && info.masRent.h.letra === L && x.gE > 0, activo = act === L
                return (
                  <tr key={L} onMouseEnter={() => setHov(L)} onMouseLeave={() => setHov(null)} onClick={() => alternar(L)}
                    className={`border-b border-border last:border-0 cursor-pointer transition-colors ${activo ? 'bg-surface' : 'hover:bg-surface'} ${act && !activo ? 'opacity-60' : ''}`}>
                    <th scope="row" className="text-left px-2 py-2.5 font-semibold">
                      <button type="button" aria-pressed={sel === L} onClick={(e) => { e.stopPropagation(); alternar(L) }} className="inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta rounded-full">
                        <Insignia letra={L} size={22} />
                        {x.avisos.length > 0 && <span className="text-warning-ink inline-flex" title={'Incumple un límite: ' + x.avisos.join(' · ')} role="img" aria-label="Incumple un límite"><IconAviso size={14} /></span>}
                      </button>
                      {!dentro(x) && <span className="block text-[11px] font-semibold text-[#0A6B6B]">Se pasa del presupuesto</span>}
                    </th>
                    <td className={`text-right px-2 font-semibold whitespace-nowrap ${claseVar('beneficio', x.gE)}`}>{sgn(x.gE)}</td>
                    <td className="text-right px-2 whitespace-nowrap">{num(x.coste)}</td>
                    {hayGanancia && <td className={`text-right px-2 whitespace-nowrap ${gana ? 'font-bold text-positive' : ''}`}>{x.rent == null ? '—' : sgn(x.rent, 2)}{gana && <span aria-label="más rentable"> ✓</span>}</td>}
                    <td className={`text-right px-2 whitespace-nowrap font-semibold ${claseVar('beneficio', x.gP)}`}>{sgn(x.gP)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pie>«Por USD gastado»: beneficio dividido entre el coste de camiones (esperado). ✓: el más rentable. «Peor caso»: beneficio con la demanda más desfavorable.</Pie>
        </Tarjeta>
        <DetalleDisp R={R} x={xAct} />
      </div>
    </div>
    </div>
  )
}

// ---- Por día: beneficio acumulado frente a no hacer nada. "Hoy" = coste de los camiones de esta noche; luego cada día se recupera (o no).
function infoDias(R, huecos) {
  const n = R.nada.por_dia.esperado.length
  const planes = huecos.slice(0, R.rutas.length).map((h, k) => {
    const r = R.rutas[k]
    const hoy = -(r.esperado.coste - R.nada.esperado.coste)
    const serie = (m) => [hoy, ...Array.from({ length: n }, (_, d) => r.por_dia[m][d] - R.nada.por_dia[m][d])]
    return { h, k, r, sE: serie('esperado'), sP: serie('peor') }
  })
  return { n, planes }
}

// Qué pasa con un plan a lo largo de los días: ritmo del último día y cuándo compensa (o cuándo lo haría)
function tendencia(s, n) {
  const fin = s[n], ritmo = s[n] - s[n - 1], cruza = s.findIndex((v, i) => i > 0 && v >= 0)
  let texto, tipo
  if (cruza > 0) { tipo = 'ya'; texto = `Compensa desde el día ${cruza}.` }
  else if (ritmo > 0) {
    const d = n + Math.ceil(-fin / ritmo)
    tipo = 'mejora'
    texto = d <= 60 ? `Mejora ${num(ritmo)} USD al día: recuperaría su coste hacia el día ${d} si mantiene ese ritmo (estimación).` : `Mejora ${num(ritmo)} USD al día, pero tardaría más de 60 días en recuperar su coste.`
  } else { tipo = 'empeora'; texto = ritmo < 0 ? `No recupera su coste: cada día pierde ${num(-ritmo)} USD más que no hacer nada.` : 'Se queda igual cada día: no recupera su coste.' }
  return { fin, ritmo, cruza, texto, tipo }
}

function frasesDias(info, ver) {
  const { n, planes } = info
  const ser = (x) => (ver === 'peor' ? x.sP : x.sE)
  const t = planes.map((x) => ({ x, ...tendencia(ser(x), n) }))
  const f = []
  const mejor = t.reduce((a, b) => (b.fin > a.fin ? b : a))
  f.push(mejor.fin >= 0
    ? `Al terminar el día ${n}, el Plan ${mejor.x.h.letra} es el que mejor queda: ${sgn(mejor.fin)} USD frente a no hacer nada.`
    : `Ningún plan compensa su coste en ${n} días${ver === 'peor' ? ' (peor escenario)' : ''}: el Plan ${mejor.x.h.letra} es el que menos pierde (${sgn(mejor.fin)} USD).`)
  const mejoran = t.filter((z) => z.tipo === 'mejora').map((z) => z.x.h.letra), empeoran = t.filter((z) => z.tipo === 'empeora').map((z) => z.x.h.letra), ya = t.filter((z) => z.tipo === 'ya').map((z) => z.x.h.letra)
  if (ya.length) f.push(`${ya.length > 1 ? 'Los planes' : 'El plan'} ${lista(ya)} ya ${ya.length > 1 ? 'compensan' : 'compensa'} su coste dentro de estos ${n} días.`)
  if (mejoran.length) f.push(`${mejoran.length > 1 ? 'Los planes' : 'El plan'} ${lista(mejoran)} ${mejoran.length > 1 ? 'mejoran' : 'mejora'} cada día y ${mejoran.length > 1 ? 'acabarían' : 'acabaría'} compensando si se mantiene el ritmo.`)
  if (empeoran.length) f.push(`${empeoran.length > 1 ? 'Los planes' : 'El plan'} ${lista(empeoran)} ${empeoran.length > 1 ? 'pierden' : 'pierde'} cada día más que no hacer nada: el último día no compensa el coste de los camiones.`)
  return f
}

function DetalleDias({ info, x }) {
  if (!x) return <Tarjeta className="px-5 py-4"><h3 className="text-[16px] font-bold mb-1">Detalle de un plan</h3><p className="text-[13px] text-muted">Pasa el ratón por un plan, o púlsalo, para ver día a día cuánto gana o pierde. Púlsalo otra vez para soltarlo.</p></Tarjeta>
  const n = info.n
  const etiqueta = (i) => (i === 0 ? 'Hoy (coste de camiones)' : `Día ${i}`)
  return (
    <Tarjeta className="px-5 py-4">
      <div className="flex items-center gap-2.5 mb-1"><Insignia letra={x.h.letra} size={26} /><h3 className="text-[16px] font-bold truncate">{nombrePlan(x.h.p, x.h.i)}</h3></div>
      <p className="text-[12px] text-muted mb-2">Acumulado frente a no hacer nada.</p>
      <table className="w-full text-[13px] border-collapse">
        <thead className="bg-surface"><tr><th className="text-left font-semibold px-2 py-1.5 text-[12px]" /><th scope="col" className="text-right font-semibold px-2 text-[12px]">Esperado</th><th scope="col" className="text-right font-semibold px-2 text-[12px]">Peor</th><th scope="col" className="text-right font-semibold px-2 text-[12px]">Ese día</th></tr></thead>
        <tbody>
          {x.sE.map((v, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <th scope="row" className="text-left px-2 py-2 font-semibold">{etiqueta(i)}</th>
              <td className={`text-right px-2 whitespace-nowrap font-semibold ${claseVar('beneficio', v)}`}>{sgn(v)}</td>
              <td className={`text-right px-2 whitespace-nowrap font-semibold ${claseVar('beneficio', x.sP[i])}`}>{sgn(x.sP[i])}</td>
              <td className="text-right px-2 whitespace-nowrap text-muted">{i === 0 ? '—' : sgn(v - x.sE[i - 1])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Tarjeta>
  )
}

const VER_DIAS = [{ valor: 'ambos', texto: 'Ambos escenarios' }, { valor: 'esperado', texto: 'Esperado' }, { valor: 'peor', texto: 'Peor' }]
const FORMA_DIAS = [{ valor: 'acum', texto: 'Acumulado' }, { valor: 'dia', texto: 'Ganancia de cada día' }]

export function GraficoDias({ R, huecos }) {
  const info = useMemo(() => infoDias(R, huecos), [R, huecos])
  const [ver, setVer] = useState('ambos')
  const [forma, setForma] = useState('acum')
  const [sel, setSel] = useState(null)
  const [hov, setHov] = useState(null)
  const act = hov ?? sel
  const xAct = info.planes.find((x) => x.h.letra === act) || null
  const n = info.n
  const nombreDia = (i) => (i === 0 ? 'Hoy' : `Día ${i}`)
  const alternar = (l) => setSel((s) => (s === l ? null : l))
  const verE = ver !== 'peor', verP = ver !== 'esperado'
  const serMain = (x) => (ver === 'peor' ? x.sP : x.sE)

  // Filas del gráfico: acumulado, o ganancia de cada día (Hoy = coste de los camiones)
  const datos = Array.from({ length: n + 1 }, (_, i) => {
    const fila = { dia: nombreDia(i) }
    info.planes.forEach((x) => {
      const L = x.h.letra
      const d = (s) => (forma === 'acum' || i === 0 ? s[i] : s[i] - s[i - 1])
      fila[L] = d(x.sE); fila[L + '_p'] = d(x.sP)
    })
    return fila
  })
  const vals = datos.flatMap((f) => info.planes.flatMap((x) => [f[x.h.letra], f[x.h.letra + '_p']]))
  const rango = Math.max(Math.max(...vals, 0) - Math.min(...vals, 0), 1)
  const yt = ticksBonitos(Math.min(...vals, 0) - rango * 0.08, Math.max(...vals, 0) + rango * 0.12)
  const y0 = yt[0], y1 = yt[yt.length - 1]

  const insigniaFin = (x, principal) => ({ x: px, y: py, index, value }) => index === n ? (
    <g style={{ cursor: 'pointer' }} opacity={act && act !== x.h.letra ? 0.35 : 1} onClick={() => alternar(x.h.letra)}>
      <circle cx={px + 14} cy={py} r={11} fill={principal ? x.h.color : '#fff'} stroke={x.h.color} strokeWidth={2.5} />
      <text x={px + 14} y={py + 4} textAnchor="middle" fontSize="11.5" fontWeight="800" fill={principal ? TEXTO_PLAN[x.h.letra] : x.h.color}>{x.h.letra}</text>
      <text x={px + 30} y={py + 5} fontSize="13" fontWeight="700" fill="#222" stroke="#fff" strokeWidth="4" paintOrder="stroke">{sgn(value)}</text>
    </g>
  ) : null

  const tip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const f = payload[0].payload
    return (
      <div className="bg-white border border-border rounded-lg px-3 py-2 text-[12.5px] shadow-float">
        <div className="font-bold mb-1">{f.dia}{forma === 'dia' && f.dia !== 'Hoy' ? ' (ese día)' : ''}</div>
        {info.planes.map((x) => (
          <div key={x.h.letra} style={{ color: x.h.color }} className="font-semibold">Plan {x.h.letra}: {verE && <>{sgn(f[x.h.letra])} USD</>}{verE && verP && <span className="text-muted font-normal"> · peor </span>}{verP && <>{sgn(f[x.h.letra + '_p'])}{!verE && ' USD'}</>}</div>
        ))}
        <div className="text-muted mt-1">Frente a no hacer nada</div>
      </div>
    )
  }
  const frases = frasesDias(info, ver)
  const serT = (x) => (ver === 'peor' ? x.sP : x.sE)

  const ejes = (
    <>
      <CartesianGrid stroke="#EEEEEE" vertical={false} />
      <ReferenceArea y1={0} y2={y1} fill="#2E9E5B" fillOpacity={0.05} stroke="none" label={{ value: '▲ Ya compensa', position: 'insideTopLeft', fontSize: 12, fontWeight: 600, fill: '#2E7D4F' }} />
      <ReferenceArea y1={y0} y2={0} fill="#fff" fillOpacity={0} stroke="none" label={{ value: '▼ Aún no compensa', position: 'insideBottomLeft', fontSize: 12, fontWeight: 600, fill: '#8A8A8A' }} />
      <XAxis dataKey="dia" tick={{ fontSize: 13, fontWeight: 600 }} stroke="#AFAFAF" padding={{ left: 24, right: 24 }} />
      <YAxis ticks={yt} domain={[y0, y1]} allowDataOverflow tick={{ fontSize: 12, fill: '#6B6B6B' }} stroke="#AFAFAF" width={60} tickFormatter={(v) => num(v)}
        label={{ value: forma === 'acum' ? '↑ Beneficio acumulado sobre no hacer nada (USD)' : '↑ Ganancia de cada día sobre no hacer nada (USD)', angle: -90, position: 'insideLeft', offset: -2, fontSize: 12.5, fill: '#6B6B6B', style: { textAnchor: 'middle' } }} />
      <ReferenceLine y={0} stroke="#444" strokeWidth={1.5} label={{ value: 'no hacer nada', position: 'right', fontSize: 11.5, fontWeight: 600, fill: '#444' }} />
      <Tooltip content={tip} cursor={{ stroke: '#CCC', strokeDasharray: '3 3' }} />
    </>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
        <Tarjeta className="px-5 py-4">
          <h3 className="text-[17px] font-bold">Beneficio frente a no hacer nada, día a día</h3>
          <p className="text-[12.5px] text-muted">Hoy se pagan los camiones, así que todos los planes parten por debajo de cero. Cada día siguiente se ve si los viajes que evita el plan compensan ese gasto. <b>Línea continua</b>: escenario esperado; <b>línea discontinua</b>: el peor. Pulsa un plan para ver su detalle.</p>
          <div className="flex items-center gap-3 flex-wrap my-2.5">
            <Segmentado valor={forma} onChange={setForma} opciones={FORMA_DIAS} />
            <Segmentado className="ml-auto" valor={ver} onChange={setVer} opciones={VER_DIAS} />
          </div>
          <div style={{ height: 440 }} role="img" aria-label="Beneficio frente a no hacer nada por día">
            <ResponsiveContainer>
              {forma === 'acum' ? (
                <LineChart data={datos} margin={{ top: 14, right: 96, bottom: 8, left: 8 }}>
                  {ejes}
                  {info.planes.map((x) => {
                    const L = x.h.letra, dim = act && act !== L, grande = act === L
                    const ev = { onMouseEnter: () => setHov(L), onMouseLeave: () => setHov(null), onClick: () => alternar(L) }
                    return (
                      <React.Fragment key={L}>
                        {verP && <Line type="linear" dataKey={L + '_p'} stroke={x.h.color} strokeWidth={ver === 'peor' ? 3.5 : 2} strokeDasharray={ver === 'peor' ? undefined : '6 5'} strokeOpacity={dim ? 0.25 : ver === 'peor' ? 1 : 0.75}
                          dot={ver === 'peor' ? { r: 5, fill: x.h.color, stroke: '#fff', strokeWidth: 2 } : { r: 3.5, fill: '#fff', stroke: x.h.color, strokeWidth: 2 }} activeDot={false} isAnimationActive={false} label={ver === 'peor' ? insigniaFin(x, true) : undefined} {...ev} />}
                        {verE && <Line type="linear" dataKey={L} stroke={x.h.color} strokeWidth={grande ? 5 : 3.5} strokeOpacity={dim ? 0.25 : 1}
                          dot={{ r: grande ? 6 : 5, fill: x.h.color, stroke: '#fff', strokeWidth: 2 }} activeDot={false} isAnimationActive={false} label={insigniaFin(x, true)} {...ev} />}
                      </React.Fragment>
                    )
                  })}
                </LineChart>
              ) : (
                <BarChart data={datos} margin={{ top: 22, right: 16, bottom: 8, left: 8 }} barCategoryGap="22%" barGap={3}>
                  {ejes}
                  {info.planes.map((x) => {
                    const L = x.h.letra, dim = act && act !== L, key = ver === 'peor' ? L + '_p' : L
                    return (
                      <Bar key={L} dataKey={key} fill={x.h.color} fillOpacity={dim ? 0.25 : 1} radius={[3, 3, 3, 3]} isAnimationActive={false}
                        onMouseEnter={() => setHov(L)} onMouseLeave={() => setHov(null)} onClick={() => alternar(L)} style={{ cursor: 'pointer' }}>
                        <LabelList dataKey={key} position="top" formatter={(v) => sgn(v)} style={{ fontSize: 11, fontWeight: 700, fill: '#222' }} />
                      </Bar>
                    )
                  })}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 text-[12.5px] text-muted flex-wrap">
            {forma === 'acum' && verE && <span><i className="inline-block w-5 border-t-[3px] border-muted mr-1.5 align-[3px]" />Escenario esperado</span>}
            {forma === 'acum' && verP && ver !== 'peor' && <span><i className="inline-block w-5 border-t-[3px] border-dashed border-muted mr-1.5 align-[3px]" />Peor escenario</span>}
            {forma === 'dia' && <span>Barras: lo que gana o pierde cada plan ese día respecto a no hacer nada ({ver === 'peor' ? 'peor escenario' : 'escenario esperado'}).</span>}
          </div>
        </Tarjeta>
        <div className="space-y-4 min-w-0">
          <Tarjeta className="px-5 py-4">
            <h3 className="text-[16px] font-bold">Resultado acumulado por día</h3>
            <p className="text-[12.5px] text-muted mb-2">USD frente a no hacer nada ({ver === 'peor' ? 'peor escenario' : 'escenario esperado'}). Pulsa un plan para ver su detalle.</p>
            <table className="w-full text-[13px] border-collapse" aria-label="Resultado acumulado de cada plan por día">
              <thead className="bg-surface"><tr>
                <th scope="col" className="text-left font-semibold px-2 py-2 text-[12px]">Plan</th>
                {Array.from({ length: n + 1 }, (_, i) => <th key={i} scope="col" className="text-right font-semibold px-2 text-[12px]">{nombreDia(i)}</th>)}
                <th scope="col" className="text-right font-semibold px-2 text-[12px]">Tendencia</th>
              </tr></thead>
              <tbody>
                {info.planes.map((x) => {
                  const L = x.h.letra, s = serT(x), t = tendencia(s, n), activo = act === L
                  return (
                    <tr key={L} onMouseEnter={() => setHov(L)} onMouseLeave={() => setHov(null)} onClick={() => alternar(L)}
                      className={`border-b border-border last:border-0 cursor-pointer transition-colors ${activo ? 'bg-surface' : 'hover:bg-surface'} ${act && !activo ? 'opacity-60' : ''}`}>
                      <th scope="row" className="text-left px-2 py-2.5 font-semibold">
                        <button type="button" aria-pressed={sel === L} onClick={(e) => { e.stopPropagation(); alternar(L) }} className="inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta rounded-full"><Insignia letra={L} size={22} /></button>
                      </th>
                      {s.map((v, i) => <td key={i} className={`text-right px-2 whitespace-nowrap font-semibold ${claseVar('beneficio', v)}`}>{sgn(v)}</td>)}
                      <td className={`text-right px-2 whitespace-nowrap font-semibold ${t.tipo === 'empeora' ? 'text-negative' : 'text-positive'}`}>{t.ritmo > 0 ? `▲ +${num(t.ritmo)}/día` : `▼ ${sgn(t.ritmo)}/día`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pie>«Hoy» es el coste de los camiones de esta noche. «Tendencia»: lo que gana o pierde el plan, frente a no hacer nada, en el último día.</Pie>
          </Tarjeta>
          <DetalleDias info={info} x={xAct} />
        </div>
      </div>
    </div>
  )
}

// ---- Por zona: viajes perdidos en cada zona (3 días) con cada plan y sin hacer nada
function infoZonas(R, huecos, modo) {
  const planes = huecos.slice(0, R.rutas.length).map((h, k) => ({ h, k, pz: R.rutas[k][modo].perdidos_zona, tareas: tareasDe(h.p.ruta) }))
  const nada = R.nada[modo].perdidos_zona
  // Zonas ordenadas de la más afectada (sin hacer nada) a la menos
  const orden = ZONAS.map((_, i) => i).sort((a, b) => nada[b] - nada[a])
  const zonas = orden.map((i) => ({
    i, nombre: ZONAS[i], corta: corta(ZONAS[i]), nada: nada[i],
    planes: planes.map((x) => ({ L: x.h.letra, v: x.pz[i], d: x.pz[i] - nada[i] })),   // d < 0: el plan evita viajes perdidos
  }))
  const totNada = nada.reduce((a, b) => a + b, 0)
  const tot = planes.map((x) => ({ L: x.h.letra, v: x.pz.reduce((a, b) => a + b, 0) }))
  return { planes, zonas, totNada, tot }
}

const tocaZona = (t, z) => (t[0] === 'CAMBIO' ? t[1] === z : t[1] === z || t[2] === z)

function frasesZonas(info, modo) {
  const { zonas, totNada, tot, planes } = info
  const f = []
  const top = zonas[0]
  f.push(`Sin hacer nada se pierden ${num(totNada)} viajes en 3 días${modo === 'peor' ? ' (peor escenario)' : ''}. La zona más afectada es ${top.nombre}, con ${num(top.nada)} (${num((top.nada / Math.max(totNada, 1)) * 100)} %).`)
  const ev = tot.map((t) => ({ ...t, ev: totNada - t.v }))
  const mejor = ev.reduce((a, b) => (b.ev > a.ev ? b : a))
  f.push(mejor.ev > 0
    ? `El Plan ${mejor.L} es el que más viajes evita en total: ${num(mejor.ev)} menos (${num((mejor.ev / Math.max(totNada, 1)) * 100)} %).`
    : `Ningún plan reduce los viajes perdidos: el Plan ${mejor.L} es el que menos los aumenta (${sgn(-mejor.ev)}).`)
  const ayuda = top.planes.reduce((a, b) => (b.d < a.d ? b : a))
  f.push(ayuda.d < 0 ? `En ${top.nombre}, la zona más afectada, el que más ayuda es el Plan ${ayuda.L} (${sgn(ayuda.d)} viajes perdidos).` : `En ${top.nombre}, la zona más afectada, ningún plan reduce los viajes perdidos.`)
  const peores = zonas.flatMap((z) => z.planes.filter((p) => p.d > 0).map((p) => ({ ...p, z: z.nombre }))).sort((a, b) => b.d - a.d).slice(0, 2)
  if (peores.length) f.push(`Ojo: ${peores.map((p) => `el Plan ${p.L} pierde ${num(p.d)} viajes más que no hacer nada en ${p.z}`).join('; ')}.`)
  return f
}

function DetalleZona({ info, z }) {
  if (!z) return <Tarjeta className="px-5 py-4"><h3 className="text-[16px] font-bold mb-1">Detalle de una zona</h3><p className="text-[13px] text-muted">Pulsa una zona (en el gráfico o en la tabla) para ver qué hace cada plan en ella. Púlsala otra vez para soltarla.</p></Tarjeta>
  return (
    <Tarjeta className="px-5 py-4">
      <h3 className="text-[16px] font-bold">{z.nombre}</h3>
      <p className="text-[12.5px] text-muted mb-2">Sin hacer nada se pierden <b>{num(z.nada)}</b> viajes en esta zona. Qué hace cada plan en ella:</p>
      <div className="space-y-3">
        {info.planes.map((x, j) => {
          const p = z.planes[j], tareas = x.tareas.filter((t) => tocaZona(t, z.nombre))
          return (
            <div key={x.h.letra} className="border-t border-border pt-2.5 first:border-0 first:pt-0">
              <div className="flex items-center gap-2 text-[13.5px]">
                <Insignia letra={x.h.letra} size={22} /><span className="font-semibold">{nombrePlan(x.h.p, x.h.i)}</span>
                <span className="ml-auto whitespace-nowrap">{num(p.v)} perdidos <b className={claseVar('perdidos', p.d)}>({sgn(p.d)})</b></span>
              </div>
              <div className="text-[12.5px] text-muted mt-1 pl-[30px]">
                {tareas.length ? <ul className="list-disc pl-4 space-y-0.5">{tareas.map((t, i) => <li key={i}>{textoTareaCorto(t).replace(/Norte-Centro/g, 'N-Centro')}</li>)}</ul> : 'No actúa en esta zona.'}
              </div>
            </div>
          )
        })}
      </div>
    </Tarjeta>
  )
}

const VISTA_ZONAS = [{ valor: 'abs', texto: 'Viajes perdidos' }, { valor: 'dif', texto: 'Cambio frente a no hacer nada' }]

export function GraficoZonas({ R, huecos, modo }) {
  const info = useMemo(() => infoZonas(R, huecos, modo), [R, huecos, modo])
  const [vista, setVista] = useState('abs')
  const [zsel, setZsel] = useState(null)       // índice de zona elegida
  const [zhov, setZhov] = useState(null)
  const [ocultos, setOcultos] = useState([])   // letras de planes ocultos
  const zact = zhov ?? zsel
  const zAct = info.zonas.find((z) => z.i === zact) || null
  const alternarZona = (i) => setZsel((s) => (s === i ? null : i))
  const visibles = info.planes.filter((x) => !ocultos.includes(x.h.letra))
  const alternarPlan = (L) => setOcultos((o) => (o.includes(L) ? o.filter((l) => l !== L) : [...o, L]))
  const abs = vista === 'abs'

  // Filas: en "abs" los viajes perdidos; en "dif" los viajes evitados (nada − plan), de modo que arriba siempre es mejor
  const datos = info.zonas.map((z) => {
    const fila = { zona: z.corta, i: z.i, nada: z.nada }
    z.planes.forEach((p) => { fila[p.L] = abs ? p.v : -p.d })
    return fila
  })
  const vals = datos.flatMap((f) => [...(abs ? [f.nada] : []), ...visibles.map((x) => f[x.h.letra])])
  const yt = abs ? ticksBonitos(0, Math.max(...vals, 1) * 1.1) : ticksBonitos(Math.min(...vals, 0) - 1, Math.max(...vals, 0) + 1)
  const y0 = yt[0], y1 = yt[yt.length - 1]
  const op = (i) => (zact == null || zact === i ? 1 : 0.3)
  const frases = frasesZonas(info, modo)
  const tip = ({ active, payload }) => {
    const f = active && payload?.length ? payload[0].payload : null
    if (!f) return null
    const z = info.zonas.find((q) => q.i === f.i)
    return (
      <div className="bg-white border border-border rounded-lg px-3 py-2 text-[12.5px] shadow-float">
        <div className="font-bold mb-1">{z.nombre}</div>
        <div className="text-muted">Sin hacer nada: {num(z.nada)} perdidos</div>
        {visibles.map((x) => { const p = z.planes.find((q) => q.L === x.h.letra); return <div key={x.h.letra} style={{ color: x.h.color }} className="font-semibold">Plan {x.h.letra}: {num(p.v)} <span className="font-normal text-muted">({sgn(p.d)})</span></div> })}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
        <Tarjeta className="px-5 py-4">
          <h3 className="text-[17px] font-bold">{abs ? 'Viajes perdidos por zona (3 días)' : 'Viajes que evita cada plan, por zona'}</h3>
          <p className="text-[12.5px] text-muted">{abs ? 'Cuanto más baja la barra, mejor. La gris es no hacer nada: un plan ayuda en una zona si su barra queda por debajo de la gris.' : 'Frente a no hacer nada. Por encima de 0: el plan evita viajes perdidos en esa zona; por debajo: pierde más viajes que sin hacer nada.'} Las zonas van de la más afectada a la menos. Pulsa una zona para ver el detalle.</p>
          <div className="flex items-center gap-2 flex-wrap my-2.5">
            <Segmentado valor={vista} onChange={setVista} opciones={VISTA_ZONAS} />
            <div className="ml-auto flex items-center gap-1.5">
              {info.planes.map((x) => {
                const oculto = ocultos.includes(x.h.letra)
                return (
                  <button key={x.h.letra} type="button" aria-pressed={!oculto} onClick={() => alternarPlan(x.h.letra)} title={oculto ? 'Mostrar este plan' : 'Ocultar este plan'}
                    className={`inline-flex items-center gap-1.5 rounded-full h-9 pl-1.5 pr-3 text-[13px] font-semibold border-[1.5px] transition-all active:scale-95 ${oculto ? 'border-border text-muted opacity-60' : 'border-accent'}`}>
                    <Insignia letra={x.h.letra} size={22} />Plan {x.h.letra}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ height: 430 }} role="img" aria-label="Viajes perdidos por zona">
            <ResponsiveContainer>
              <BarChart data={datos} margin={{ top: 22, right: 12, bottom: 4, left: 8 }} barCategoryGap="18%" barGap={2}
                onClick={(st) => { const i = st?.activePayload?.[0]?.payload?.i; if (i != null) alternarZona(i) }}
                onMouseMove={(st) => { const i = st?.activePayload?.[0]?.payload?.i; setZhov(i ?? null) }} onMouseLeave={() => setZhov(null)}>
                <CartesianGrid stroke="#EEEEEE" vertical={false} />
                {!abs && <ReferenceArea y1={0} y2={y1} fill="#2E9E5B" fillOpacity={0.05} stroke="none" label={{ value: '▲ Evita viajes perdidos', position: 'insideTopLeft', fontSize: 12, fontWeight: 600, fill: '#2E7D4F' }} />}
                {!abs && <ReferenceArea y1={y0} y2={0} fill="#fff" fillOpacity={0} stroke="none" label={{ value: '▼ Pierde más que sin hacer nada', position: 'insideBottomLeft', fontSize: 12, fontWeight: 600, fill: '#8A8A8A' }} />}
                <XAxis dataKey="zona" tick={{ fontSize: 13, fontWeight: 600 }} stroke="#AFAFAF" />
                <YAxis ticks={yt} domain={[y0, y1]} allowDataOverflow width={52} tick={{ fontSize: 12, fill: '#6B6B6B' }} stroke="#AFAFAF" tickFormatter={(v) => num(v)}
                  label={{ value: abs ? 'Viajes perdidos en 3 días' : '↑ Viajes evitados frente a no hacer nada', angle: -90, position: 'insideLeft', offset: -2, fontSize: 12.5, fill: '#6B6B6B', style: { textAnchor: 'middle' } }} />
                {!abs && <ReferenceLine y={0} stroke="#444" strokeWidth={1.5} />}
                <Tooltip content={tip} cursor={{ fill: 'rgba(0,0,0,.05)' }} />
                {abs && <Bar dataKey="nada" fill="#BDBDBD" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {datos.map((f) => <Cell key={f.i} fillOpacity={op(f.i)} />)}
                  <LabelList dataKey="nada" position="top" formatter={(v) => num(v)} style={{ fontSize: 10.5, fontWeight: 700, fill: '#6B6B6B' }} />
                </Bar>}
                {visibles.map((x) => (
                  <Bar key={x.h.letra} dataKey={x.h.letra} fill={x.h.color} radius={[3, 3, 3, 3]} isAnimationActive={false}>
                    {datos.map((f) => <Cell key={f.i} fillOpacity={op(f.i)} />)}
                    <LabelList dataKey={x.h.letra} position="top" formatter={(v) => (abs ? num(v) : sgn(v))} style={{ fontSize: 10.5, fontWeight: 700, fill: '#222' }} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 text-[12.5px] text-muted flex-wrap">
            {abs && <span><i className="inline-block w-3 h-3 bg-[#BDBDBD] mr-1.5 align-[-1px]" />No hacer nada</span>}
            {info.planes.map((x) => <span key={x.h.letra} className={ocultos.includes(x.h.letra) ? 'opacity-40' : ''}><i className="inline-block w-3 h-3 mr-1.5 align-[-1px]" style={{ background: x.h.color }} />Plan {x.h.letra}</span>)}
            <span className="ml-auto">{modo === 'peor' ? 'Peor escenario' : 'Escenario esperado'}</span>
          </div>
        </Tarjeta>
        <div className="space-y-4 min-w-0">
          <Tarjeta className="px-5 py-4">
            <h3 className="text-[16px] font-bold">Cifras por zona</h3>
            <p className="text-[12.5px] text-muted mb-2">Viajes perdidos en 3 días y, debajo, el cambio frente a no hacer nada. Verde: el plan pierde menos viajes; ✓: el mejor de la zona.</p>
            <table className="w-full text-[13px] border-collapse" aria-label="Viajes perdidos por zona y plan">
              <thead className="bg-surface"><tr>
                <th scope="col" className="text-left font-semibold px-2 py-2 text-[12px]">Zona</th>
                <th scope="col" className="text-right font-semibold px-2 text-[12px]">Nada</th>
                {info.planes.map((x) => <th key={x.h.letra} scope="col" className="text-right font-semibold px-2 text-[12px]"><Insignia letra={x.h.letra} size={18} /></th>)}
              </tr></thead>
              <tbody>
                {info.zonas.map((z) => {
                  const min = Math.min(...z.planes.map((p) => p.v)), activo = zact === z.i
                  return (
                    <tr key={z.i} onMouseEnter={() => setZhov(z.i)} onMouseLeave={() => setZhov(null)} onClick={() => alternarZona(z.i)}
                      className={`border-b border-border cursor-pointer transition-colors ${activo ? 'bg-surface' : 'hover:bg-surface'} ${zact != null && !activo ? 'opacity-60' : ''}`}>
                      <th scope="row" className="text-left px-2 py-2 font-semibold">{z.corta}</th>
                      <td className="text-right px-2 text-muted whitespace-nowrap">{num(z.nada)}</td>
                      {z.planes.map((p) => (
                        <td key={p.L} className="text-right px-2 py-1 leading-tight whitespace-nowrap">
                          <div className="font-semibold">{num(p.v)}{p.v === min && p.d < 0 && <span className="text-positive" aria-label="mejor plan en la zona"> ✓</span>}</div>
                          <div className={`text-[11.5px] font-semibold ${claseVar('perdidos', p.d)}`}>{sgn(p.d)}</div>
                        </td>
                      ))}
                    </tr>
                  )
                })}
                <tr className="font-bold">
                  <th scope="row" className="text-left px-2 py-2.5">Total</th>
                  <td className="text-right px-2 text-muted whitespace-nowrap">{num(info.totNada)}</td>
                  {info.tot.map((t) => <td key={t.L} className="text-right px-2 py-1 leading-tight whitespace-nowrap"><div>{num(t.v)}</div><div className={`text-[11.5px] ${claseVar('perdidos', t.v - info.totNada)}`}>{sgn(t.v - info.totNada)}</div></td>)}
                </tr>
              </tbody>
            </table>
          </Tarjeta>
          <DetalleZona info={info} z={zAct} />
        </div>
      </div>
    </div>
  )
}

// ---- Escenarios: ¿aguanta cada plan si la demanda sale mal? Esperado (media de los tres escenarios) frente al peor.
// Todas las métricas se expresan "frente a no hacer nada" y de forma que arriba/positivo siempre es mejor.
const MET_ESC = [
  { id: 'ben3', texto: 'Beneficio 3 días', nombre: 'el beneficio a 3 días', eje: 'Beneficio frente a no hacer nada (USD)', get: (r, n, m) => r[m].beneficio3 - n[m].beneficio3, f: (v) => `${sgn(v)} USD` },
  { id: 'ben1', texto: 'Beneficio día 1', nombre: 'el beneficio del día 1', eje: 'Beneficio del día 1 frente a no hacer nada (USD)', get: (r, n, m) => r[m].beneficio1 - n[m].beneficio1, f: (v) => `${sgn(v)} USD` },
  { id: 'per', texto: 'Viajes evitados', nombre: 'los viajes perdidos que evita', eje: 'Viajes perdidos evitados frente a no hacer nada', get: (r, n, m) => n[m].perdidos - r[m].perdidos, f: (v) => sgn(v) },
  { id: 'dem', texto: 'Demanda atendida', nombre: 'la demanda atendida', eje: 'Demanda atendida frente a no hacer nada (pp)', get: (r, n, m) => (r[m].demanda - n[m].demanda) * 100, f: (v) => `${sgn(v, 1)} pp`, d: 1 },
]

function infoEsc(R, huecos, met) {
  const planes = huecos.slice(0, R.rutas.length).map((h, k) => {
    const r = R.rutas[k], E = met.get(r, R.nada, 'esperado'), P = met.get(r, R.nada, 'peor')
    const gE = r.esperado.beneficio3 - R.nada.esperado.beneficio3, gP = r.peor.beneficio3 - R.nada.peor.beneficio3
    return { h, k, r, E, P, caida: E - P, gE, gP, avisos: r.avisos || [] }
  })
  return { planes }
}

function frasesEsc(info, met) {
  const { planes } = info
  const f = []
  const mejorE = planes.reduce((a, b) => (b.E > a.E ? b : a)), mejorP = planes.reduce((a, b) => (b.P > a.P ? b : a))
  f.push(mejorE.h.letra === mejorP.h.letra
    ? `El Plan ${mejorE.h.letra} es el mejor en ${met.nombre} tanto en el escenario esperado (${met.f(mejorE.E)}) como en el peor (${met.f(mejorE.P)}).`
    : `El mejor plan cambia según la demanda: en ${met.nombre}, el ${mejorE.h.letra} gana en el escenario esperado (${met.f(mejorE.E)}) y el ${mejorP.h.letra} en el peor (${met.f(mejorP.P)}).`)
  const estable = planes.reduce((a, b) => (Math.abs(b.caida) < Math.abs(a.caida) ? b : a)), frag = planes.reduce((a, b) => (Math.abs(b.caida) > Math.abs(a.caida) ? b : a))
  if (planes.length > 1 && estable.h.letra !== frag.h.letra) f.push(`El Plan ${estable.h.letra} es el más estable (varía ${met.f(Math.abs(estable.caida)).replace('+', '')} entre un escenario y otro) y el ${frag.h.letra} el más sensible (${met.f(Math.abs(frag.caida)).replace('+', '')}).`)
  const siempre = planes.filter((x) => x.gP > 0).map((x) => x.h.letra), normal = planes.filter((x) => x.gE > 0 && x.gP <= 0).map((x) => x.h.letra)
  if (!siempre.length && !normal.length) f.push('Ningún plan compensa a no hacer nada a 3 días, ni siquiera en el escenario esperado.')
  else {
    if (siempre.length) f.push(`${siempre.length > 1 ? 'Los planes' : 'El plan'} ${lista(siempre)} ${siempre.length > 1 ? 'compensan' : 'compensa'} incluso en el peor escenario.`)
    if (normal.length) f.push(`${normal.length > 1 ? 'Los planes' : 'El plan'} ${lista(normal)} solo ${normal.length > 1 ? 'compensan' : 'compensa'} si la demanda es la esperada.`)
  }
  return f
}

function DetalleEsc({ R, x }) {
  if (!x) return <Tarjeta className="px-5 py-4"><h3 className="text-[16px] font-bold mb-1">Detalle de un plan</h3><p className="text-[13px] text-muted">Pulsa un plan (en el gráfico o en la tabla) para ver todas sus métricas en los dos escenarios. Púlsalo otra vez para soltarlo.</p></Tarjeta>
  const filas = [...MET_ESC.map((m) => ({ n: m.texto, E: m.get(x.r, R.nada, 'esperado'), P: m.get(x.r, R.nada, 'peor'), f: m.f })),
    { n: 'Coste de camiones', E: x.r.esperado.coste, P: x.r.peor.coste, f: (v) => `${num(v)} USD`, neutro: true }]
  return (
    <Tarjeta className="px-5 py-4">
      <div className="flex items-center gap-2.5 mb-1"><Insignia letra={x.h.letra} size={26} /><h3 className="text-[16px] font-bold truncate">{nombrePlan(x.h.p, x.h.i)}</h3></div>
      <p className="text-[12px] text-muted mb-2">Frente a no hacer nada.</p>
      <table className="w-full text-[13px] border-collapse">
        <thead className="bg-surface"><tr><th className="text-left font-semibold px-2 py-1.5 text-[12px]" /><th scope="col" className="text-right font-semibold px-2 text-[12px]">Esperado</th><th scope="col" className="text-right font-semibold px-2 text-[12px]">Peor</th></tr></thead>
        <tbody>
          {filas.map((q) => (
            <tr key={q.n} className="border-b border-border last:border-0">
              <th scope="row" className="text-left px-2 py-2 font-semibold">{q.n}</th>
              <td className={`text-right px-2 whitespace-nowrap font-semibold ${q.neutro ? '' : claseVar('beneficio', q.E)}`}>{q.f(q.E)}</td>
              <td className={`text-right px-2 whitespace-nowrap font-semibold ${q.neutro ? '' : claseVar('beneficio', q.P)}`}>{q.f(q.P)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Tarjeta>
  )
}

function GrafEscenarios({ R, huecos, mets }) {
  const metsOk = MET_ESC.filter((m) => !mets || mets.includes(m.id))
  const [metId, setMetId] = useState(metsOk[0].id)
  const [sel, setSel] = useState(null)
  const [hov, setHov] = useState(null)
  const met = metsOk.find((m) => m.id === metId) || metsOk[0]
  const info = useMemo(() => infoEsc(R, huecos, met), [R, huecos, met])
  const act = hov ?? sel
  const xAct = info.planes.find((x) => x.h.letra === act) || null
  const alternar = (L) => setSel((s) => (s === L ? null : L))
  const dim = (L) => (act && act !== L ? 0.3 : 1)

  const datos = info.planes.map((x) => ({ plan: `Plan ${x.h.letra}`, L: x.h.letra, E: x.E, P: x.P }))
  const vals = datos.flatMap((d) => [d.E, d.P])
  const rango = Math.max(Math.max(...vals, 0) - Math.min(...vals, 0), 1)
  const yt = ticksBonitos(Math.min(...vals, 0) - rango * 0.1, Math.max(...vals, 0) + rango * 0.15)
  const y0 = yt[0], y1 = yt[yt.length - 1]
  const frases = frasesEsc(info, met)
  // Etiqueta propia (sin heredar el borde discontinuo de la barra): encima si el valor es positivo, debajo si es negativo
  const etiquetaBarra = (fuerte) => ({ x, y, width, height, value }) => (
    <text x={x + width / 2} y={value >= 0 ? y - 7 : y + height + 16} textAnchor="middle" fontSize="12.5" fontWeight={fuerte ? 800 : 600} fill={fuerte ? '#222' : '#555'} stroke="none" strokeDasharray="none">{met.f(value).replace(' USD', '')}</text>
  )
  const tip =({ active, payload }) => {
    const d = active && payload?.length ? payload[0].payload : null
    if (!d) return null
    const x = info.planes.find((q) => q.h.letra === d.L)
    return (
      <div className="bg-white border border-border rounded-lg px-3 py-2 text-[12.5px] shadow-float">
        <div className="font-bold mb-1" style={{ color: x.h.color }}>Plan {d.L}</div>
        <div>Escenario esperado: <b>{met.f(d.E)}</b></div>
        <div>Peor escenario: <b>{met.f(d.P)}</b></div>
        <div className="text-muted mt-1">Diferencia entre ambos: {met.f(Math.abs(d.E - d.P)).replace('+', '')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
        <Tarjeta className="px-5 py-4">
          <h3 className="text-[17px] font-bold">¿Aguanta cada plan si la demanda sale mal?</h3>
          <p className="text-[12.5px] text-muted">Cada plan tiene dos barras: la <b>sólida</b> es el escenario esperado (media de los tres) y la <b>clara</b>, el peor. Cuanto menos baje la barra clara, más robusto es el plan. Pulsa un plan para ver su detalle.</p>
          {metsOk.length > 1 && <div className="my-2.5"><Segmentado valor={met.id} onChange={setMetId} opciones={metsOk.map((m) => ({ valor: m.id, texto: m.texto }))} /></div>}
          <div style={{ height: 420 }} role="img" aria-label="Resultado de cada plan en el escenario esperado y en el peor">
            <ResponsiveContainer>
              <BarChart data={datos} margin={{ top: 24, right: 12, bottom: 4, left: 8 }} barCategoryGap="28%" barGap={4}
                onClick={(st) => { const L = st?.activePayload?.[0]?.payload?.L; if (L) alternar(L) }}
                onMouseMove={(st) => setHov(st?.activePayload?.[0]?.payload?.L ?? null)} onMouseLeave={() => setHov(null)}>
                <CartesianGrid stroke="#EEEEEE" vertical={false} />
                <ReferenceArea y1={0} y2={y1} fill="#2E9E5B" fillOpacity={0.05} stroke="none" label={{ value: '▲ Mejor que no hacer nada', position: 'insideTopLeft', fontSize: 12, fontWeight: 600, fill: '#2E7D4F' }} />
                <ReferenceArea y1={y0} y2={0} fill="#fff" fillOpacity={0} stroke="none" label={{ value: '▼ Peor que no hacer nada', position: 'insideBottomLeft', fontSize: 12, fontWeight: 600, fill: '#8A8A8A' }} />
                <XAxis dataKey="plan" tick={{ fontSize: 14, fontWeight: 700 }} stroke="#AFAFAF" />
                <YAxis ticks={yt} domain={[y0, y1]} allowDataOverflow width={60} tick={{ fontSize: 12, fill: '#6B6B6B' }} stroke="#AFAFAF" tickFormatter={(v) => num(v, met.d || 0)}
                  label={{ value: '↑ ' + met.eje, angle: -90, position: 'insideLeft', offset: -2, fontSize: 12.5, fill: '#6B6B6B', style: { textAnchor: 'middle' } }} />
                <ReferenceLine y={0} stroke="#444" strokeWidth={1.5} label={{ value: 'no hacer nada', position: 'right', fontSize: 11.5, fontWeight: 600, fill: '#444' }} />
                <Tooltip content={tip} cursor={{ fill: 'rgba(0,0,0,.05)' }} />
                <Bar dataKey="E" radius={[4, 4, 4, 4]} isAnimationActive={false}>
                  {datos.map((d, i) => <Cell key={d.L} fill={info.planes[i].h.color} fillOpacity={dim(d.L)} />)}
                  <LabelList dataKey="E" content={etiquetaBarra(true)} />
                </Bar>
                <Bar dataKey="P" radius={[4, 4, 4, 4]} isAnimationActive={false}>
                  {datos.map((d, i) => <Cell key={d.L} fill={info.planes[i].h.color} fillOpacity={dim(d.L) * 0.3} stroke={info.planes[i].h.color} strokeWidth={2} strokeDasharray="4 3" strokeOpacity={dim(d.L)} />)}
                  <LabelList dataKey="P" content={etiquetaBarra(false)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 text-[12.5px] text-muted flex-wrap">
            <span><i className="inline-block w-3.5 h-3.5 rounded-[3px] bg-muted mr-1.5 align-[-2px]" />Escenario esperado</span>
            <span><i className="inline-block w-3.5 h-3.5 rounded-[3px] border-2 border-dashed border-muted bg-muted/30 mr-1.5 align-[-2px]" />Peor escenario</span>
          </div>
        </Tarjeta>
        <div className="space-y-4 min-w-0">
          <Tarjeta className="px-5 py-4">
            <h3 className="text-[16px] font-bold">Robustez de cada plan</h3>
            <p className="text-[12.5px] text-muted mb-2">{met.texto}, frente a no hacer nada.</p>
            <table className="w-full text-[13px] border-collapse" aria-label="Robustez de cada plan">
              <thead className="bg-surface"><tr>
                <th scope="col" className="text-left font-semibold px-2 py-2 text-[12px]">Plan</th>
                <th scope="col" className="text-right font-semibold px-2 text-[12px]">Esperado</th>
                <th scope="col" className="text-right font-semibold px-2 text-[12px]">Peor</th>
                <th scope="col" className="text-right font-semibold px-2 text-[12px]">Pierde</th>
              </tr></thead>
              <tbody>
                {info.planes.map((x) => {
                  const L = x.h.letra, activo = act === L
                  return (
                    <tr key={L} onMouseEnter={() => setHov(L)} onMouseLeave={() => setHov(null)} onClick={() => alternar(L)}
                      className={`border-b border-border last:border-0 cursor-pointer transition-colors ${activo ? 'bg-surface' : 'hover:bg-surface'} ${act && !activo ? 'opacity-60' : ''}`}>
                      <th scope="row" className="text-left px-2 py-2.5 font-semibold">
                        <span className="inline-flex items-center gap-1.5"><button type="button" aria-pressed={sel === L} onClick={(e) => { e.stopPropagation(); alternar(L) }} className="inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta rounded-full"><Insignia letra={L} size={22} /></button>
                          {x.avisos.length > 0 && <span className="text-warning-ink inline-flex" title={'Incumple un límite: ' + x.avisos.join(' · ')} role="img" aria-label="Incumple un límite"><IconAviso size={14} /></span>}</span>
                      </th>
                      <td className={`text-right px-2 whitespace-nowrap font-semibold ${claseVar('beneficio', x.E)}`}>{met.f(x.E)}</td>
                      <td className={`text-right px-2 whitespace-nowrap font-semibold ${claseVar('beneficio', x.P)}`}>{met.f(x.P)}</td>
                      <td className="text-right px-2 whitespace-nowrap text-muted">{x.caida > 0 ? '−' : x.caida < 0 ? '+' : ''}{met.f(Math.abs(x.caida)).replace('+', '')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pie>«Pierde»: lo que baja el plan al pasar del escenario esperado al peor. Cuanto menos, más robusto.</Pie>
          </Tarjeta>
          <DetalleEsc R={R} x={xAct} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 4. CAMIONES Y TAREAS
const MIN = 360
function Cronograma({ R, huecos }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {[1, 2, 3, 4].map((c) => (
        <Tarjeta key={c} className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3"><span className="w-6 h-6 rounded-full bg-muted text-white inline-flex items-center justify-center text-[12px] font-semibold">{c}</span><h3 className="text-[16px] font-bold">Camión {c}</h3></div>
          <div className="space-y-2.5">
            {huecos.map((h, k) => {
              const p = R.rutas[k].plan[String(c)]
              return (
                <div key={h.i} className="flex items-center gap-2.5">
                  <Insignia letra={h.letra} size={22} />
                  <div className="relative flex-1 h-[30px] rounded-md bg-surface-2 overflow-hidden" role="img" aria-label={`Plan ${h.letra}, camión ${c}: ${num(p.minutos)} de ${MIN} minutos`}>
                    {p.tareas.map((t, i) => {
                      const ancho = ((t.fin - t.inicio) / MIN) * 100
                      return (
                        <div key={i} title={`${resumenTarea(t.tarea)} (${num(t.fin - t.inicio)} min)`} className="absolute top-0 h-full text-[11px] font-semibold flex items-center px-1.5 overflow-hidden whitespace-nowrap"
                          style={{ left: (t.inicio / MIN) * 100 + '%', width: `calc(${ancho}% - 2px)`, background: h.color, color: TEXTO_PLAN[h.letra], opacity: i % 2 ? 0.72 : 1 }}>
                          {ancho > 12 && <span className="truncate">{resumenTarea(t.tarea).replace(/Norte-Centro/g, 'N-Centro')}</span>}
                        </div>
                      )
                    })}
                  </div>
                  <span className="w-[64px] text-right text-[12px] text-muted shrink-0">{p.tareas.length ? `${num(MIN - p.minutos)} libres` : 'sin uso'}</span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-[11px] text-muted mt-2 pl-[32px] pr-[74px]"><span>0</span><span>120</span><span>240</span><span>360 min</span></div>
        </Tarjeta>
      ))}
    </div>
  )
}

function TareasComunes({ huecos }) {
  const claveT = (t) => textoTareaCorto(t)
  const filas = useMemo(() => {
    const m = new Map()
    huecos.forEach((h, k) => tareasDe(h.p.ruta).forEach((t) => { const c = claveT(t); if (!m.has(c)) m.set(c, new Set()); m.get(c).add(k) }))
    return [...m.entries()].map(([texto, en]) => ({ texto, en })).sort((a, b) => b.en.size - a.en.size || a.texto.localeCompare(b.texto))
  }, [huecos])
  const nombreGrupo = (n) => (n === huecos.length ? `En los ${n} planes` : n > 1 ? `En ${n} planes` : 'Solo en un plan')
  let previo = null
  return (
    <Tarjeta className="px-5 py-4">
      <h3 className="text-[17px] font-bold">En qué se diferencian los planes</h3>
      <p className="text-[12.5px] text-muted mb-2">Las tareas que comparten los planes y las que son propias de cada uno.</p>
      <table className="w-full text-[14px] border-collapse">
        <thead className="bg-surface"><tr>
          <th className="text-left font-semibold px-3 py-2.5 text-[13px]">Tarea</th>
          {huecos.map((h) => <th key={h.i} className="text-center font-semibold px-3 text-[13px] w-[110px]"><span className="inline-flex items-center gap-1.5"><Insignia letra={h.letra} size={20} />{h.letra}</span></th>)}
        </tr></thead>
        <tbody>
          {filas.flatMap((f) => {
            const g = f.en.size
            const cab = g !== previo ? (previo = g, [<tr key={'g' + g}><td colSpan={huecos.length + 1} className="px-3 pt-4 pb-1 text-[12px] font-bold uppercase tracking-wide text-muted">{nombreGrupo(g)}</td></tr>]) : []
            return [...cab, (
              <tr key={f.texto} className="border-b border-border">
                <td className="px-3 py-2.5">{f.texto}</td>
                {huecos.map((h, k) => <td key={h.i} className="text-center">{f.en.has(k) ? <span className="inline-block w-5 h-5 rounded-full text-[12px] leading-5 font-bold" style={{ background: h.color, color: TEXTO_PLAN[h.letra] }} aria-label="sí">✓</span> : <span className="text-border-strong" aria-label="no">—</span>}</td>)}
              </tr>
            )]
          })}
        </tbody>
      </table>
    </Tarjeta>
  )
}

const MARGEN_MIN = 60   // por debajo de estos minutos libres un camión va justo ante imprevistos

function MinutosLibres({ R, huecos, onAmpliar }) {
  const hs = huecos.slice(0, R.rutas.length)
  const cam = [1, 2, 3, 4].map((c) => ({
    c,
    planes: hs.map((h, k) => {
      const p = R.rutas[k].plan[String(c)]
      const usados = Math.round(p.minutos), libres = MIN - usados
      return { h, usados, libres, vacio: !(p.tareas && p.tareas.length), justo: p.tareas?.length > 0 && libres < MARGEN_MIN }
    }),
  }))
  const resumen = hs.map((h, k) => {
    const filas = cam.map((x) => ({ c: x.c, ...x.planes[k] }))
    const libres = filas.reduce((s, f) => s + f.libres, 0), usados = filas.reduce((s, f) => s + f.usados, 0)
    const activos = filas.filter((f) => !f.vacio)
    const ajustado = activos.length ? activos.reduce((a, f) => (f.libres < a.libres ? f : a), activos[0]) : null
    return { h, libres, usados, ajustado, nJustos: filas.filter((f) => f.justo).length }
  })
  const mejor = resumen.reduce((a, r, i) => (r.libres > resumen[a].libres ? i : a), 0)
  const xMargen = ((MIN - MARGEN_MIN) / MIN) * 100
  return (
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
      <Tarjeta className="px-5 py-4">
        <h3 className="text-[17px] font-bold">Minutos libres de cada camión</h3>
        <p className="text-[12.5px] text-muted mb-2">Cada barra es la noche del camión (360 min): en color, el tiempo que trabaja; en gris, el que le sobra. Más gris significa más margen para añadir tareas o absorber imprevistos.</p>
        <div className="flex items-center gap-4 mb-3 flex-wrap"><LeyendaPlanes huecos={huecos} />
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted"><span className="inline-block h-3.5 border-l-2 border-dashed border-ink" aria-hidden="true" />Margen mínimo: {MARGEN_MIN} min libres</span>
        </div>
        <div className="space-y-4">
          {cam.map((x) => (
            <div key={x.c}>
              <div className="flex items-center gap-2 mb-1.5"><Camion n={x.c} /><b className="text-[14px]">Camión {x.c}</b></div>
              <div className="space-y-1.5">
                {x.planes.map((p) => (
                  <div key={p.h.i} className="flex items-center gap-3">
                    <Insignia letra={p.h.letra} size={20} />
                    <div className="relative h-[18px] flex-1 rounded-full bg-surface-2 overflow-hidden" role="img" aria-label={`Plan ${p.h.letra}, camión ${x.c}: ${p.usados} minutos usados y ${p.libres} libres`}>
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: (p.usados / MIN) * 100 + '%', background: p.h.color }} />
                      <div className="absolute inset-y-0 border-l-2 border-dashed border-ink/60" style={{ left: xMargen + '%' }} />
                    </div>
                    <div className="w-[190px] text-[12.5px] shrink-0 whitespace-nowrap">
                      {p.vacio ? <span className="text-muted">Sin tareas · {MIN} libres</span> : <><b className={p.justo ? 'text-negative' : ''}>{p.libres} libres</b><span className="text-muted"> · {p.usados} usados</span>{p.justo && <span className="text-negative font-semibold"> · justo</span>}</>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Tarjeta>
      <Tarjeta className="px-5 py-4 min-w-0">
        <h3 className="text-[16px] font-bold mb-2">Margen total de cada plan</h3>
        <div className="space-y-3">
          {resumen.map((r, k) => (
            <div key={r.h.i} className="rounded-xl bg-surface px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Insignia letra={r.h.letra} size={22} /><b className="text-[14px]">{nombrePlan(r.h.p, r.h.i)}</b>
                
                <span className="ml-auto text-[18px] font-bold">{num(r.libres)}<span className="text-[12px] font-semibold text-muted"> min libres</span></span>
              </div>
              <div className="text-[12.5px] text-muted">
                {num(r.usados)} min de trabajo en total.{' '}
                {r.ajustado ? <>El más ajustado es el <b className="text-ink">camión {r.ajustado.c}</b> con {r.ajustado.libres} min libres{r.nJustos ? <span className="text-negative font-semibold"> (por debajo del margen mínimo)</span> : ''}.</> : 'Ningún camión trabaja.'}
              </div>
              {onAmpliar && <button type="button" onClick={() => onAmpliar(r.h.i)} className="mt-2.5 inline-flex items-center gap-1.5 rounded-full h-9 px-4 text-[13px] font-semibold border border-border bg-white hover:border-accent transition-colors">Ampliar este plan <IconFlecha size={14} /></button>}
            </div>
          ))}
        </div>
        <Pie>Un camión «justo» tiene menos de {MARGEN_MIN} min libres: cualquier retraso podría dejar tareas sin hacer.</Pie>
      </Tarjeta>
    </div>
  )
}

function DetallePlan({ R, huecos }) {
  return (
    <div className={`grid gap-4 ${huecos.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {huecos.map((h, k) => (
        <Tarjeta key={h.i} className="px-5 py-4">
          <div className="flex items-center gap-2.5 mb-3"><Insignia letra={h.letra} size={24} /><h3 className="text-[16px] font-bold">{nombrePlan(h.p, h.i)}</h3></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((c) => {
              const p = R.rutas[k].plan[String(c)]
              return (
                <div key={c}>
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="w-5 h-5 rounded-full bg-muted text-white inline-flex items-center justify-center text-[11px] font-semibold">{c}</span>
                    <span className="font-semibold">Camión {c}</span><span className="ml-auto text-muted">{num(MIN - p.minutos)} min libres</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2 mt-1.5 overflow-hidden flex" role="progressbar" aria-valuemin={0} aria-valuemax={MIN} aria-valuenow={p.minutos} aria-label={`Camión ${c}: ${num(p.minutos)} de ${MIN} minutos`}>
                    {p.tareas.map((t, i) => <div key={i} style={{ width: ((t.fin - t.inicio) / MIN) * 100 + '%', background: h.color, opacity: i % 2 ? 0.65 : 1, borderRight: '2px solid #fff' }} />)}
                  </div>
                  <div className="text-[12.5px] text-muted mt-1">{p.tareas.length ? p.tareas.map((t) => `${resumenTarea(t.tarea).replace(/Norte-Centro/g, 'N-Centro')} (${num(t.fin - t.inicio)} min)`).join(' · ') : 'sin tareas'}</div>
                </div>
              )
            })}
          </div>
        </Tarjeta>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- KPI de la flota: bajos sin cambiar y reserva del taller
const KPI_FLOTA = {
  bajos: { titulo: 'Bajos sin cambiar por plan', sub: 'Patinetes con la batería baja que siguen en la calle al acabar la noche. Menos es mejor.', get: (b) => b.bajos_sin_cambiar, u: 'bajos', baja: true },
  reserva: { titulo: 'Reserva del taller por plan', sub: 'Patinetes cargados que quedan en el taller al acabar la noche. Más es mejor.', get: (b) => b.reserva_taller, u: 'en reserva', baja: false },
}
const GRIS_NADA = '#BDBDBD'

function GrafKpiPlanes({ R, huecos, k }) {
  const C = KPI_FLOTA[k]
  const nada = C.get(R.nada)
  const filas = huecos.slice(0, R.rutas.length).map((h, i) => ({ h, v: C.get(R.rutas[i]), d: C.get(R.rutas[i]) - nada }))
  const datos = [{ n: 'No hacer nada', v: nada, c: GRIS_NADA }, ...filas.map((x) => ({ n: `Plan ${x.h.letra}`, v: x.v, c: x.h.color }))]
  const yt = ticksBonitos(0, Math.max(...datos.map((d) => d.v), 1) * 1.15)
  const mejor = filas.reduce((a, x) => ((C.baja ? x.v < a.v : x.v > a.v) ? x : a), filas[0])
  const bien = (d) => (C.baja ? d < 0 : d > 0)
  return (
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
      <Tarjeta className="px-5 py-4">
        <h3 className="text-[17px] font-bold">{C.titulo}</h3>
        <p className="text-[12.5px] text-muted mb-2">{C.sub}</p>
        <div style={{ height: 380 }} role="img" aria-label={C.titulo}>
          <ResponsiveContainer>
            <BarChart data={datos} margin={{ top: 24, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke="#EEE" />
              <XAxis dataKey="n" tickLine={false} axisLine={{ stroke: '#CCC' }} tick={{ fontSize: 13, fill: '#222' }} />
              <YAxis domain={[yt[0], yt[yt.length - 1]]} ticks={yt} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#666' }} width={44} />
              <ReferenceLine y={nada} stroke="#999" strokeDasharray="5 4" />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,.04)' }} formatter={(v) => [`${num(v)} ${C.u}`, '']} separator="" />
              <Bar dataKey="v" radius={[6, 6, 0, 0]} isAnimationActive={false} maxBarSize={90}>
                {datos.map((d, i) => <Cell key={i} fill={d.c} />)}
                <LabelList dataKey="v" position="top" formatter={(v) => num(v)} style={{ fontSize: 13, fontWeight: 700, fill: '#222' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Tarjeta>
      <div className="space-y-4 min-w-0">
        <Tarjeta className="px-5 py-4">
          <h3 className="text-[16px] font-bold mb-2">Frente a no hacer nada</h3>
          {filas.map((x) => (
            <div key={x.h.i} className="flex items-center gap-2 py-2 border-b border-border last:border-0 text-[14px]">
              <Insignia letra={x.h.letra} size={22} /><span className="font-semibold">{nombrePlan(x.h.p, x.h.i)}</span>
              <span className="ml-auto text-muted">{num(x.v)} {C.u}</span>
              <span className={`font-bold w-[64px] text-right ${x.d === 0 ? 'text-muted' : bien(x.d) ? 'text-positive' : 'text-negative'}`}>{sgn(x.d)}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-2 text-[13px] text-muted"><span>No hacer nada</span><span className="ml-auto font-semibold">{num(nada)} {C.u}</span></div>
        </Tarjeta>
      </div>
    </div>
  )
}

// Estado por zona al acabar la noche: bajos que quedan o cargados que quedan
function GrafKpiZonas({ R, huecos, estado, clave }) {
  const hs = huecos.slice(0, R.rutas.length)
  const titulo = clave === 'bajos' ? 'Bajos sin cambiar por zona' : 'Cargados por zona al acabar la noche'
  const sub = clave === 'bajos' ? 'Dónde quedan patinetes con la batería baja. Menos es mejor.' : 'Dónde quedan los patinetes cargados tras la noche: hay que protegerlos donde habrá más demanda.'
  const datos = ZONAS.map((z) => {
    const f = { zona: corta(z), nada: estado?.[clave]?.[z] ?? 0 }
    hs.forEach((h, i) => { f[h.letra] = R.rutas[i].flota.zonas[z][clave] })
    return f
  })
  const vals = datos.flatMap((d) => [d.nada, ...hs.map((h) => d[h.letra])])
  const yt = ticksBonitos(0, Math.max(...vals, 1) * 1.15)
  return (
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
      <Tarjeta className="px-5 py-4">
        <h3 className="text-[17px] font-bold">{titulo}</h3>
        <p className="text-[12.5px] text-muted mb-2">{sub}</p>
        <div style={{ height: 380 }} role="img" aria-label={titulo}>
          <ResponsiveContainer>
            <BarChart data={datos} margin={{ top: 12, right: 12, left: 0, bottom: 4 }} barGap={3}>
              <CartesianGrid vertical={false} stroke="#EEE" />
              <XAxis dataKey="zona" tickLine={false} axisLine={{ stroke: '#CCC' }} tick={{ fontSize: 13, fill: '#222' }} />
              <YAxis domain={[yt[0], yt[yt.length - 1]]} ticks={yt} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#666' }} width={44} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,.04)' }} />
              <Bar dataKey="nada" name="No hacer nada" fill={GRIS_NADA} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              {hs.map((h) => <Bar key={h.letra} dataKey={h.letra} name={`Plan ${h.letra}`} fill={h.color} radius={[4, 4, 0, 0]} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <LeyendaPlanes huecos={huecos} nada />
      </Tarjeta>
      <Tarjeta className="px-5 py-4 min-w-0">
        <h3 className="text-[16px] font-bold mb-2">Valores por zona</h3>
        <table className="w-full text-[13px] border-collapse" aria-label={titulo}>
          <thead className="bg-surface"><tr>
            <th scope="col" className="text-left font-semibold px-2 py-2 text-[12px]">Zona</th>
            <th scope="col" className="text-right font-semibold px-2 text-[12px]">Nada</th>
            {hs.map((h) => <th key={h.i} scope="col" className="text-right px-2"><Insignia letra={h.letra} size={18} /></th>)}
          </tr></thead>
          <tbody>
            {ZONAS.map((z, i) => (
              <tr key={z} className="border-b border-border last:border-0">
                <th scope="row" className="text-left font-medium px-2 py-2">{z}</th>
                <td className="text-right px-2 text-muted">{num(datos[i].nada)}</td>
                {hs.map((h) => <td key={h.i} className="text-right px-2 font-semibold">{num(datos[i][h.letra])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Tarjeta>
    </div>
  )
}

// ---------------------------------------------------------------- Datos: cobertura de la demanda, desglose económico y exportación
function Cobertura({ R, huecos, estado }) {
  const hs = huecos.slice(0, R.rutas.length)
  const dem = estado?.demanda_zona || []
  const filas = ZONAS.map((z, i) => ({
    z, d: dem[i] ?? 0, ahora: estado?.cargados?.[z] ?? 0,
    planes: hs.map((h, k) => { const c = R.rutas[k].flota.zonas[z].cargados; return { c, r: dem[i] ? (c / dem[i]) * 100 : 0 } }),
  }))
  const ratios = filas.flatMap((f) => f.planes.map((p) => p.r))
  const rmin = Math.min(...ratios), rmax = Math.max(...ratios)
  const fondo = (r) => mezcla('#FDE3D6', '#D8F0E0', rmax > rmin ? (r - rmin) / (rmax - rmin) : 1)
  const debil = hs.map((_, k) => filas.reduce((a, f) => (f.planes[k].r < a.planes[k].r ? f : a), filas[0]))
  return (
    <div className="space-y-4">
      <Tarjeta className="px-5 py-4">
        <h3 className="text-[17px] font-bold">Cobertura de la demanda de mañana</h3>
        <p className="text-[12.5px] text-muted mb-3">Patinetes cargados que deja cada plan en cada zona al terminar la noche, frente a los viajes que se esperan allí mañana. Cuanto más verde, más protegida está la zona.</p>
        <table className="w-full text-[14px] border-collapse" aria-label="Cobertura de la demanda por zona y plan">
          <thead className="bg-surface">
            <tr>
              <th scope="col" className="text-left font-semibold px-3 py-2.5 text-[13px]">Zona</th>
              <th scope="col" className="text-right font-semibold px-3 text-[13px]">Demanda mañana</th>
              <th scope="col" className="text-right font-semibold px-3 text-[13px]">Cargados ahora</th>
              {hs.map((h) => <th key={h.i} scope="col" className="text-right font-semibold px-3 text-[13px] whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Insignia letra={h.letra} size={20} />{nombrePlan(h.p, h.i)}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.z} className="border-b border-border">
                <th scope="row" className="text-left px-3 py-3 font-semibold">{f.z}</th>
                <td className="text-right px-3 text-muted">≈ {num(f.d)} viajes</td>
                <td className="text-right px-3 text-muted">{num(f.ahora)}</td>
                {f.planes.map((p, k) => (
                  <td key={k} className="text-right px-3 py-2 leading-tight" style={{ background: fondo(p.r) }}>
                    <div className="font-bold">{num(p.c)} cargados</div>
                    <div className="text-[12px] text-ink/70">{num(p.r)} por cada 100 viajes</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <Pie>Es una referencia: un patinete puede hacer varios viajes en el día, así que no hace falta llegar a 100.</Pie>
      </Tarjeta>
      <Tarjeta className="px-5 py-4">
        <h3 className="text-[16px] font-bold mb-2">Zona peor cubierta de cada plan</h3>
        <div className={`grid gap-3 ${hs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {hs.map((h, k) => (
            <div key={h.i} className="rounded-xl bg-surface px-4 py-3">
              <div className="flex items-center gap-2 mb-1"><Insignia letra={h.letra} size={22} /><b className="text-[14px]">{nombrePlan(h.p, h.i)}</b></div>
              <div className="text-[13.5px]"><b>{debil[k].z}</b>: {num(debil[k].planes[k].c)} cargados para ≈ {num(debil[k].d)} viajes ({num(debil[k].planes[k].r)} por cada 100).</div>
            </div>
          ))}
        </div>
      </Tarjeta>
    </div>
  )
}

// Beneficio a lo largo de los días: coste de la noche, ingresos de cada día y cuándo se recupera la inversión
function desgloseEco(R, huecos, modo) {
  const hs = huecos.slice(0, R.rutas.length)
  const bloque = (b) => {
    const cum = b.por_dia[modo], coste = b[modo].coste
    const ingresos = cum.map((v, i) => (i === 0 ? v + coste : v - cum[i - 1]))
    return { cum, coste, ingresos }
  }
  const nada = bloque(R.nada)
  const planes = hs.map((h, k) => {
    const b = bloque(R.rutas[k])
    const ventaja = b.cum.map((v, i) => v - nada.cum[i])
    const rec = ventaja.findIndex((v) => v >= 0)
    return { h, ...b, ventaja, recupera: rec < 0 ? null : rec + 1 }
  })
  return { nada, planes, n: nada.cum.length }
}

function Economia({ R, huecos, modo }) {
  const d = useMemo(() => desgloseEco(R, huecos, modo), [R, huecos, modo])
  const dias = Array.from({ length: d.n }, (_, i) => i)
  const celda = (txt, cls = '') => <td className={`text-right px-3 py-2.5 whitespace-nowrap ${cls}`}>{txt}</td>
  const usd = (v) => `${num(v)} USD`
  const cab = (t) => <tr className="bg-surface"><th scope="colgroup" colSpan={2 + d.planes.length} className="text-left px-3 py-1.5 text-[12px] font-semibold text-muted">{t}</th></tr>
  return (
    <Tarjeta className="px-5 py-4">
      <h3 className="text-[17px] font-bold">Desglose económico</h3>
      <p className="text-[12.5px] text-muted mb-3">De dónde sale el beneficio de cada plan: lo que cuestan los camiones esta noche y lo que ingresa cada día. {modo === 'peor' ? 'Peor escenario de demanda.' : 'Escenario esperado.'}</p>
      <table className="w-full text-[14px] border-collapse" aria-label="Desglose económico por día y plan">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="text-left font-semibold px-3 py-2.5 text-[13px]">Concepto</th>
            <th scope="col" className="text-right font-semibold px-3 text-[13px]">No hacer nada</th>
            {d.planes.map((p) => <th key={p.h.i} scope="col" className="text-right font-semibold px-3 text-[13px] whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Insignia letra={p.h.letra} size={20} />{nombrePlan(p.h.p, p.h.i)}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {cab('Esta noche')}
          <tr className="border-b border-border"><th scope="row" className="text-left px-3 py-2.5 font-semibold">Coste de camiones</th>{celda(usd(-d.nada.coste), 'text-muted')}{d.planes.map((p) => celda(usd(-p.coste), 'font-semibold ' + (p.coste > 0 ? 'text-negative' : '')))}</tr>
          {cab('Ingresos de cada día')}
          {dias.map((i) => (
            <tr key={i} className="border-b border-border"><th scope="row" className="text-left px-3 py-2.5 font-semibold">Día {i + 1}</th>{celda(usd(d.nada.ingresos[i]), 'text-muted')}{d.planes.map((p) => celda(usd(p.ingresos[i]), 'font-semibold'))}</tr>
          ))}
          {cab('Beneficio acumulado')}
          {dias.map((i) => (
            <tr key={i} className="border-b border-border"><th scope="row" className="text-left px-3 py-2.5 font-semibold">Hasta el día {i + 1}</th>{celda(usd(d.nada.cum[i]), 'text-muted')}{d.planes.map((p) => celda(usd(p.cum[i]), 'font-semibold'))}</tr>
          ))}
          {cab('Frente a no hacer nada')}
          {dias.map((i) => (
            <tr key={i} className="border-b border-border"><th scope="row" className="text-left px-3 py-2.5 font-semibold">Hasta el día {i + 1}</th>{celda('—', 'text-muted')}{d.planes.map((p) => celda(`${sgn(p.ventaja[i])} USD`, `font-bold ${claseVar('beneficio', p.ventaja[i])}`))}</tr>
          ))}
          <tr><th scope="row" className="text-left px-3 py-3 font-semibold">Se recupera la inversión</th>{celda('—', 'text-muted')}{d.planes.map((p) => celda(p.recupera ? `el día ${p.recupera}` : 'no en 3 días', 'font-bold ' + (p.recupera ? 'text-positive' : 'text-negative')))}</tr>
        </tbody>
      </table>
      <Pie>El coste de los camiones se paga esta noche; los ingresos llegan con los viajes de cada día. «Se recupera la inversión» es el primer día en que el plan acumula tanto beneficio como no hacer nada.</Pie>
    </Tarjeta>
  )
}

// Exportar la comparación: CSV (separador «;» y coma decimal, para abrirlo directamente en Excel) e impresión
function csvComparacion(R, huecos, estado) {
  const hs = huecos.slice(0, R.rutas.length)
  const c = (v) => (typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : `"${String(v).replace(/"/g, '""')}"`)
  const fila = (a) => a.map(c).join(';')
  const nombres = hs.map((h) => nombrePlan(h.p, h.i))
  const L = []
  for (const m of ['esperado', 'peor']) {
    L.push(fila([`Indicadores (${m === 'peor' ? 'peor escenario' : 'escenario esperado'})`, 'No hacer nada', ...nombres]))
    FILAS.forEach((f) => L.push(fila([f.nombre + (f.u ? ` (${f.u})` : ''), f.get(R.nada, m), ...R.rutas.map((r) => f.get(r, m))])))
    L.push('')
  }
  L.push(fila(['Cargados al terminar la noche por zona', 'Demanda mañana (viajes)', 'Cargados ahora', ...nombres]))
  ZONAS.forEach((z, i) => L.push(fila([z, estado?.demanda_zona?.[i] ?? 0, estado?.cargados?.[z] ?? 0, ...R.rutas.map((r) => r.flota.zonas[z].cargados)])))
  L.push('')
  for (const m of ['esperado', 'peor']) {
    const d = desgloseEco(R, huecos, m)
    L.push(fila([`Desglose económico (${m})`, 'No hacer nada', ...nombres]))
    L.push(fila(['Coste de camiones (USD)', -d.nada.coste, ...d.planes.map((p) => -p.coste)]))
    Array.from({ length: d.n }, (_, i) => L.push(fila([`Ingresos día ${i + 1} (USD)`, d.nada.ingresos[i], ...d.planes.map((p) => p.ingresos[i])])))
    Array.from({ length: d.n }, (_, i) => L.push(fila([`Beneficio acumulado hasta el día ${i + 1} (USD)`, d.nada.cum[i], ...d.planes.map((p) => p.cum[i])])))
    L.push(fila(['Se recupera la inversión', '—', ...d.planes.map((p) => (p.recupera ? `día ${p.recupera}` : 'no en 3 días'))]))
    L.push('')
  }
  return '﻿' + L.join('\r\n')
}

function BotonesExportar({ R, huecos, estado }) {
  const bajar = () => {
    const url = URL.createObjectURL(new Blob([csvComparacion(R, huecos, estado)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'comparacion-de-planes.csv'; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const cls = 'rounded-full h-9 px-4 text-[13px] font-semibold border border-border bg-white hover:border-accent transition-colors'
  return (
    <div className="flex items-center gap-2 print:hidden">
      <button type="button" onClick={bajar} className={cls}>Descargar CSV</button>
      <button type="button" onClick={() => window.print()} className={cls}>Imprimir</button>
    </div>
  )
}

// ---------------------------------------------------------------- vistas interiores
export const VISTAS = {
  mapas: {
    titulo: 'Comparar mapas', miga: 'Mapas', ayuda: 'Cambia de formato para ver los planes de otra forma.',
    formatos: [{ valor: 'lado', texto: 'Lado a lado' }, { valor: 'calor', texto: 'Calor: viajes perdidos' }, { valor: 'dif', texto: 'Diferencias' }, { valor: 'flujos', texto: 'Flujos' }],
    usaModo: (f) => f === 'calor' || f === 'dif',
  },
  datos: {
    titulo: 'Comparar datos', miga: 'Datos', ayuda: 'Los números exactos de cada plan y los límites que cumple.',
    formatos: [{ valor: 'indicadores', texto: 'Indicadores' }, { valor: 'cobertura', texto: 'Cobertura de la demanda' }, { valor: 'economia', texto: 'Desglose económico' }, { valor: 'limites', texto: 'Límites y avisos' }],
    usaModo: (f) => f === 'indicadores' || f === 'economia',
  },
  graficos: {
    titulo: 'Comparar gráficos', miga: 'Gráficos', ayuda: 'El perfil de cada plan, su evolución y su riesgo.',
    formatos: [{ valor: 'radar', texto: 'Perfil de cada plan' }, { valor: 'disp', texto: 'Beneficio frente a coste' }, { valor: 'dias', texto: 'Evolución en 3 días' }, { valor: 'zonas', texto: 'Viajes perdidos por zona' }, { valor: 'esc', texto: 'Esperado frente a peor caso' }],
    usaModo: (f) => f === 'radar' || f === 'zonas',
  },
  camiones: {
    titulo: 'Comparar camiones y tareas', miga: 'Camiones y tareas', ayuda: 'Cómo se ejecuta cada plan: qué hace cada camión y en qué se diferencian.',
    formatos: [{ valor: 'crono', texto: 'Cronograma' }, { valor: 'tareas', texto: 'Tareas comunes y propias' }, { valor: 'libres', texto: 'Minutos libres' }, { valor: 'detalle', texto: 'Detalle por plan' }],
    usaModo: () => false,
  },
}

// Gráficos agrupados por el KPI que se quiere analizar: cada KPI ofrece los estudios que sirven para leerlo
const G = {
  radar: { valor: 'radar', texto: 'Perfil de cada plan' },
  disp: { valor: 'disp', texto: 'Beneficio frente a coste' },
  dias: { valor: 'dias', texto: 'Evolución en 3 días' },
  zonas: { valor: 'zonas', texto: 'Viajes perdidos por zona' },
  esc: { valor: 'esc', texto: 'Esperado frente a peor caso' },
  bajpl: { valor: 'bajpl', texto: 'Bajos por plan' },
  bajzo: { valor: 'bajzo', texto: 'Bajos por zona' },
  respl: { valor: 'respl', texto: 'Reserva por plan' },
  reszo: { valor: 'reszo', texto: 'Cargados por zona' },
}
const KPIS_GRAF = [
  { id: 'gral', texto: 'Visión general', graficos: [G.radar], mets: null },
  { id: 'ben', texto: 'Beneficio', graficos: [G.disp, G.dias, G.esc], mets: ['ben3', 'ben1'] },
  { id: 'per', texto: 'Viajes perdidos', graficos: [G.zonas, G.esc], mets: ['per'] },
  { id: 'dem', texto: 'Demanda atendida', graficos: [G.esc], mets: ['dem'] },
  { id: 'cos', texto: 'Coste', graficos: [G.disp], mets: null },
  { id: 'baj', texto: 'Bajos sin cambiar', graficos: [G.bajpl, G.bajzo], mets: null },
  { id: 'res', texto: 'Lugar de los patinetes', graficos: [G.respl, G.reszo], mets: null },
]

export function VistaInterior({ vista, R, huecos, mapa, limites, estado, onAmpliar }) {
  const def = VISTAS[vista]
  const [kpi, setKpi] = useState('gral')
  const kdef = KPIS_GRAF.find((k) => k.id === kpi)
  const formatos = vista === 'graficos' ? kdef.graficos : def.formatos
  const [formato, setFormato] = useState(def.formatos[0].valor)
  const [modo, setModo] = useState('esperado')
  const f = formatos.some((x) => x.valor === formato) ? formato : formatos[0].valor
  return (
    <div>
      {vista === 'graficos' && (
        <div className="mb-3">
          <div className="text-[13px] font-semibold mb-1.5">¿Qué KPI quieres analizar?</div>
          <Segmentado valor={kpi} onChange={setKpi} opciones={KPIS_GRAF.map((k) => ({ valor: k.id, texto: k.texto }))} />
        </div>
      )}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {vista === 'graficos' && kdef.graficos.length === 1 ? null : <Segmentado valor={f} onChange={setFormato} opciones={formatos} />}
        {def.usaModo(f) && <Segmentado className="ml-auto" valor={modo} onChange={setModo} opciones={MODOS} />}
        {vista === 'datos' && <div className={def.usaModo(f) ? '' : 'ml-auto'}><BotonesExportar R={R} huecos={huecos} estado={estado} /></div>}
      </div>
      {vista === 'mapas' && <VistaMapas R={R} huecos={huecos} mapa={mapa} formato={f} modo={modo} />}
      {vista === 'datos' && (f === 'indicadores' ? <Indicadores R={R} huecos={huecos} modo={modo} /> : f === 'cobertura' ? <Cobertura R={R} huecos={huecos} estado={estado} /> : f === 'economia' ? <Economia R={R} huecos={huecos} modo={modo} /> : <Limites R={R} huecos={huecos} limites={limites} />)}
      {vista === 'graficos' && (f === 'radar' ? <GrafRadar R={R} huecos={huecos} modo={modo} /> : f === 'disp' ? <GrafDispersion R={R} huecos={huecos} limites={limites} /> : f === 'dias' ? <GraficoDias R={R} huecos={huecos} modo={modo} /> : f === 'zonas' ? <GraficoZonas R={R} huecos={huecos} modo={modo} /> : f === 'bajpl' ? <GrafKpiPlanes R={R} huecos={huecos} k="bajos" /> : f === 'respl' ? <GrafKpiPlanes R={R} huecos={huecos} k="reserva" /> : f === 'bajzo' ? <GrafKpiZonas R={R} huecos={huecos} estado={estado} clave="bajos" /> : f === 'reszo' ? <GrafKpiZonas R={R} huecos={huecos} estado={estado} clave="cargados" /> : <GrafEscenarios key={kpi} R={R} huecos={huecos} mets={kdef.mets} />)}
      {vista === 'camiones' && (f === 'crono' ? <Cronograma R={R} huecos={huecos} /> : f === 'tareas' ? <TareasComunes huecos={huecos} /> : f === 'libres' ? <MinutosLibres R={R} huecos={huecos} onAmpliar={onAmpliar} /> : <DetallePlan R={R} huecos={huecos} />)}
    </div>
  )
}

// ---------------------------------------------------------------- vista principal: los 4 botones
function MiniTabla({ R, huecos }) {
  const filas = [['Beneficio', 'beneficio', (b) => b.esperado.beneficio3, 0], ['Perdidos', 'perdidos', (b) => b.esperado.perdidos, 0], ['Coste', 'coste', (b) => b.esperado.coste, 0]]
  return (
    <div className="grid gap-x-2 gap-y-1.5 text-[12px] font-semibold items-center" style={{ gridTemplateColumns: `1.2fr repeat(${huecos.length}, 1fr)` }}>
      <span />{huecos.map((h) => <span key={h.i} className="text-right" style={{ color: h.color }}>{h.letra}</span>)}
      {filas.map(([n, met, get]) => (
        <React.Fragment key={n}>
          <span>{n}</span>
          {R.rutas.map((r, k) => { const d = get(r) - get(R.nada); return <span key={k} className={`text-right ${claseVar(met, d)}`}>{sgn(d)}</span> })}
        </React.Fragment>
      ))}
    </div>
  )
}

function MiniCamiones({ R, huecos }) {
  return (
    <div className="space-y-2 mt-1">
      {[1, 2, 3, 4].map((c) => (
        <div key={c} className="space-y-0.5">
          {huecos.map((h, k) => (
            <div key={h.i} className="relative h-[7px] rounded-full bg-white overflow-hidden">
              {R.rutas[k].plan[String(c)].tareas.map((t, i) => <div key={i} className="absolute top-0 h-full" style={{ left: (t.inicio / MIN) * 100 + '%', width: ((t.fin - t.inicio) / MIN) * 100 + '%', background: h.color, opacity: i % 2 ? 0.7 : 1 }} />)}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function Hub({ R, huecos, mapa, abrir }) {
  const per = R.nada.esperado.perdidos_zona
  const maxPer = Math.max(...per, ...R.rutas.flatMap((r) => r.esperado.perdidos_zona), 1)
  const h0 = huecos.reduce((a, h, k) => (R.rutas[k].esperado.perdidos < R.rutas[a].esperado.perdidos ? k : a), 0)
  const relleno = Object.fromEntries(ZONAS.map((z, i) => [z, colorCalor(R.rutas[h0].esperado.perdidos_zona[i], maxPer)]))
  const OPCIONES = [
    { id: 'mapas', desc: 'Dónde actúa cada plan y cómo queda cada zona.', miniatura: <MinimapaPlan mapa={mapa} ruta={huecos[h0].p.ruta} color={huecos[h0].color} relleno={relleno} sinFlechas className="w-full h-[150px]" titulo="Vista previa: mapa de calor" /> },
    { id: 'datos', desc: 'Los números exactos de cada plan y los límites que cumple.', miniatura: <MiniTabla R={R} huecos={huecos} /> },
    { id: 'graficos', desc: 'El perfil de cada plan, su evolución y su riesgo.', miniatura: <div className="h-[150px]" aria-hidden="true"><GrafRadar R={R} huecos={huecos} modo="esperado" pequeno /></div> },
    { id: 'camiones', desc: 'Cómo se ejecuta cada plan: qué hace cada camión y en qué se diferencian.', miniatura: <MiniCamiones R={R} huecos={huecos} /> },
  ]
  return (
    <div>
      <h2 className="text-[22px] font-bold">¿Cómo quieres compararlos?</h2>
      <p className="text-[13.5px] text-muted mb-3">Elige un tipo de comparación. Dentro podrás cambiar de formato.</p>
      <div className="grid grid-cols-2 gap-4">
        {OPCIONES.map((o) => {
          const v = VISTAS[o.id]
          return (
            <button key={o.id} onClick={() => abrir(o.id)} aria-label={`${v.titulo}: ${v.formatos.map((x) => x.texto).join(', ')}`}
              className="group text-left bg-white border-[1.5px] border-border hover:border-accent rounded-2xl px-6 py-5 grid items-center gap-5 transition-colors min-h-[210px]" style={{ gridTemplateColumns: 'minmax(0,1fr) 270px' }}>
              <div>
                <h3 className="text-[21px] font-bold mb-1">{v.titulo}</h3>
                <p className="text-[13.5px] text-muted mb-3 leading-snug">{o.desc}</p>
                <div className="flex flex-wrap gap-1.5 mb-4">{v.formatos.map((x) => <span key={x.valor} className="bg-surface-2 rounded-full px-2.5 py-1 text-[12px] font-semibold">{x.texto}</span>)}</div>
                <span className="inline-flex items-center gap-2 bg-cta text-white rounded-full h-10 px-5 text-[13px] font-semibold">Abrir <IconFlecha size={16} /></span>
              </div>
              <div className="bg-surface rounded-xl p-3 h-[170px] flex flex-col justify-center overflow-hidden" aria-hidden="true">{o.miniatura}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
