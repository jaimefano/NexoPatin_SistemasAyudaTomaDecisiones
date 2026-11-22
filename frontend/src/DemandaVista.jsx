import React, { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import { Tarjeta } from './components/ui.jsx'
import { ZONAS, num } from './utils.js'
import { getDemandaHoraria } from './api.js'

// Mapa de calor de la demanda del día siguiente por zona y hora (y por franjas), para que el jefe vea cuándo y dónde habrá más viajes
// y compruebe si su plan deja patinetes cargados donde hacen falta.

const corta = (z) => (z === 'Norte-Centro' ? 'N-Centro' : z)
const FRANJAS = [
  { n: 'Madrugada', h0: 0, h1: 6 }, { n: 'Mañana', h0: 6, h1: 12 }, { n: 'Mediodía', h0: 12, h1: 16 },
  { n: 'Tarde', h0: 16, h1: 20 }, { n: 'Noche', h0: 20, h1: 24 },
]
const ESCENARIOS = [{ valor: 'esperado', texto: 'Demanda esperada' }, { valor: 'flojo', texto: 'Floja' }, { valor: 'fuerte', texto: 'Fuerte' }]

const mezcla = (a, b, t) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - t) + parseInt(b.slice(1 + i, 3 + i), 16) * t).toString(16).padStart(2, '0')).join('')
// Escala de calor: crema (poca demanda) → naranja → rojo oscuro (mucha)
export const colorDemanda = (t) => { t = Math.max(0, Math.min(1, t)); return t < 0.5 ? mezcla('#FFF7E6', '#F6A63B', t * 2) : mezcla('#F6A63B', '#B2182B', (t - 0.5) * 2) }
const GRAD = 'linear-gradient(90deg,#FFF7E6,#F6A63B,#B2182B)'

const sum = (a) => a.reduce((x, y) => x + y, 0)
const argmax = (a) => a.reduce((m, v, i) => (v > a[m] ? i : m), 0)
const horaTxt = (h) => `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`
const fmtCelda = (v, grande) => (v < 0.05 ? '' : v < 10 && !grande ? num(v, 1) : num(v, 0))
// Ventana de 4 horas seguidas con más demanda
function ventana(fila, n = 4) {
  let mejor = 0, ini = 0
  for (let s = 0; s + n <= fila.length; s++) { const t = sum(fila.slice(s, s + n)); if (t > mejor) { mejor = t; ini = s } }
  return { ini, fin: ini + n, suma: mejor }
}

export function useDemandaHoraria() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let vivo = true
    getDemandaHoraria().then((d) => vivo && setDatos(d)).catch((e) => vivo && setError(e.message || 'Error de red'))
    return () => { vivo = false }
  }, [])
  return { datos, error }
}

// Miniatura para la vista principal de Comparar
export function MiniCalor({ className = 'w-full h-[150px]' }) {
  const { datos } = useDemandaHoraria()
  if (!datos) return <div className={className} />
  const M = datos.esperado, max = Math.max(...datos.fuerte.flat(), 1)
  return (
    <svg viewBox="0 0 240 70" className={className} preserveAspectRatio="none" role="img" aria-label="Vista previa: mapa de calor de la demanda por zona y hora">
      {M.map((fila, z) => fila.map((v, h) => <rect key={z + '-' + h} x={h * 10 + 0.5} y={z * 14 + 0.5} width={9} height={13} rx={1.5} fill={colorDemanda(v / max)} />))}
    </svg>
  )
}

export function VistaDemanda({ formato, Seg }) {
  const { datos, error } = useDemandaHoraria()
  const [esc, setEsc] = useState('esperado')
  const [zsel, setZsel] = useState(null)
  const [hov, setHov] = useState(null)   // { z, c }
  const franjas = formato === 'franjas'

  const calc = useMemo(() => {
    if (!datos) return null
    const M = datos[esc]
    // Columnas del mapa: 24 horas o 5 franjas
    const cols = franjas
      ? FRANJAS.map((f) => ({ id: f.n, label: f.n, sub: `${f.h0}–${f.h1} h`, valor: (z) => sum(M[z].slice(f.h0, f.h1)), h0: f.h0, h1: f.h1 }))
      : Array.from({ length: 24 }, (_, h) => ({ id: h, label: String(h), sub: '', valor: (z) => M[z][h], h0: h, h1: h + 1 }))
    const V = ZONAS.map((_, z) => cols.map((c) => c.valor(z)))
    const totZona = M.map(sum), totCol = cols.map((_, c) => sum(V.map((fila) => fila[c])))
    const horaTot = Array.from({ length: 24 }, (_, h) => sum(M.map((fila) => fila[h])))
    const maxEsc = franjas ? Math.max(...ZONAS.flatMap((_, z) => FRANJAS.map((f) => sum(datos.fuerte[z].slice(f.h0, f.h1)))), 1) : Math.max(...datos.fuerte.flat(), 1)
    const pico = M.map((fila) => argmax(fila))
    const picoCol = V.map((fila) => argmax(fila))
    const vent = M.map((fila) => ventana(fila))
    const total = sum(totZona)
    return { M, cols, V, totZona, totCol, horaTot, maxEsc, pico, picoCol, vent, total, maxTotCol: Math.max(...totCol, 1) }
  }, [datos, esc, franjas])

  if (error) return <Tarjeta className="p-6 text-muted" role="alert">No se ha podido cargar la demanda de mañana: {error}</Tarjeta>
  if (!calc) return <div className="text-muted p-6" role="status">Cargando la demanda de mañana…</div>

  const { M, cols, V, totZona, totCol, horaTot, maxEsc, pico, picoCol, vent, total, maxTotCol } = calc
  const pct = (v, t) => num((v / Math.max(t, 1)) * 100)

  const zonaAct = zsel
  const hovInfo = hov ? { z: hov.z, c: cols[hov.c], v: V[hov.z][hov.c] } : null

  // Perfil por hora de la zona elegida (o de todas)
  const perfil = Array.from({ length: 24 }, (_, h) => ({ h, v: zonaAct == null ? horaTot[h] : M[zonaAct][h] }))
  const perfilMax = Math.max(...perfil.map((p) => p.v), 1)
  const top3 = [...perfil].sort((a, b) => b.v - a.v).slice(0, 3).map((p) => p.h)
  const tipPerfil = ({ active, payload }) => active && payload?.length ? (
    <div className="bg-white border border-border rounded-lg px-3 py-2 text-[12.5px] shadow-float"><div className="font-bold">{horaTxt(payload[0].payload.h)}</div><div>{num(payload[0].payload.v, 1)} viajes</div></div>
  ) : null

  const plantilla = `88px repeat(${cols.length}, minmax(0,1fr)) 64px`
  return (
    <div className="space-y-4">
      <Tarjeta className="px-5 py-4">
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <div>
            <h3 className="text-[17px] font-bold">Viajes esperados mañana por zona y {franjas ? 'franja del día' : 'hora'}</h3>
            <p className="text-[12.5px] text-muted">Cuanto más oscura la celda, más viajes. El contorno negro marca la hora punta de cada zona. Pulsa una zona para ver su perfil por hora.</p>
          </div>
          <Seg className="ml-auto" valor={esc} onChange={setEsc} opciones={ESCENARIOS} />
        </div>
        <div className="h-[22px] text-[13px] font-semibold mb-1" aria-live="polite">
          {hovInfo
            ? <>{ZONAS[hovInfo.z]} · {franjas ? `${hovInfo.c.label} (${hovInfo.c.sub})` : horaTxt(hovInfo.c.h0)}: <span className="text-[#B2182B]">{num(hovInfo.v, franjas ? 0 : 1)} viajes</span><span className="text-muted font-normal"> · el {pct(hovInfo.v, totZona[hovInfo.z])} % de la demanda de la zona</span></>
            : <span className="text-muted font-normal">Pasa el ratón por una celda para ver el detalle.</span>}
        </div>

        <div role="table" aria-label="Demanda esperada por zona y hora" className="select-none">
          {!franjas && (
            <div className="grid gap-[2px] mb-[2px]" style={{ gridTemplateColumns: plantilla }} role="row">
              <span />
              {FRANJAS.map((f) => <span key={f.n} className="text-[11px] text-muted font-semibold border-b border-border-strong text-center pb-0.5" style={{ gridColumn: `${2 + f.h0} / span ${f.h1 - f.h0}` }}>{f.n}</span>)}
            </div>
          )}
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: plantilla }} role="row">
            <span />
            {cols.map((c, ci) => (
              <div key={c.id} role="columnheader" className={`text-center leading-tight pb-1 ${hov?.c === ci ? 'text-ink font-bold' : 'text-muted'}`}>
                <div className="text-[12px] font-semibold">{c.label}</div>
                {franjas && <div className="text-[11px]">{c.sub}</div>}
              </div>
            ))}
            <span className="text-[12px] font-semibold text-center text-muted">Total</span>
          </div>
          {ZONAS.map((z, zi) => {
            const atenuado = zonaAct != null && zonaAct !== zi
            return (
              <div key={z} className={`grid gap-[2px] mt-[2px] transition-opacity ${atenuado ? 'opacity-35' : ''}`} style={{ gridTemplateColumns: plantilla }} role="row">
                <button type="button" onClick={() => setZsel((s) => (s === zi ? null : zi))} aria-pressed={zonaAct === zi}
                  className={`text-left text-[13px] font-semibold pr-2 rounded-md hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta ${zonaAct === zi ? 'bg-accent text-white px-2 hover:bg-accent' : ''}`}>{corta(z)}</button>
                {cols.map((c, ci) => {
                  const v = V[zi][ci], t = v / maxEsc, esPico = franjas ? picoCol[zi] === ci : pico[zi] === ci
                  return (
                    <div key={c.id} role="cell" aria-label={`${z}, ${franjas ? c.label : horaTxt(c.h0)}: ${num(v, 1)} viajes${esPico ? ', hora punta' : ''}`}
                      onMouseEnter={() => setHov({ z: zi, c: ci })} onMouseLeave={() => setHov(null)} onClick={() => setZsel((s) => (s === zi ? null : zi))}
                      className={`h-[44px] rounded-[4px] flex items-center justify-center text-[11.5px] font-semibold cursor-pointer transition-transform hover:scale-[1.12] hover:z-10 relative ${esPico ? 'outline outline-2 outline-ink -outline-offset-2' : ''}`}
                      style={{ background: colorDemanda(t), color: t > 0.55 ? '#fff' : '#3a2b1c' }}>{fmtCelda(v, franjas)}</div>
                  )
                })}
                <div role="cell" className="h-[44px] rounded-[4px] bg-surface-2 flex items-center justify-center text-[12.5px] font-bold">{num(totZona[zi])}</div>
              </div>
            )
          })}
          <div className="grid gap-[2px] mt-[6px]" style={{ gridTemplateColumns: plantilla }} role="row">
            <span className="text-[13px] font-bold self-center">Total</span>
            {cols.map((c, ci) => (
              <div key={c.id} role="cell" className="h-[34px] rounded-[4px] flex items-center justify-center text-[11px] font-bold border border-border"
                style={{ background: colorDemanda(totCol[ci] / maxTotCol), color: totCol[ci] / maxTotCol > 0.55 ? '#fff' : '#3a2b1c' }}>{fmtCelda(totCol[ci], true)}</div>
            ))}
            <div className="h-[34px] rounded-[4px] bg-cta text-white flex items-center justify-center text-[12.5px] font-bold">{num(total)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-[12.5px] text-muted mt-3 flex-wrap">
          Pocos viajes<span className="h-2.5 w-[200px] rounded-full inline-block" style={{ background: GRAD }} />Muchos (máx. {num(maxEsc, franjas ? 0 : 1)})
          <span className="mx-1">·</span>Misma escala en los tres escenarios.
          <span className="ml-auto"><i className="inline-block w-3.5 h-3.5 rounded-[3px] outline outline-2 outline-ink -outline-offset-2 mr-1.5 align-[-3px]" />Hora punta de la zona</span>
        </div>
      </Tarjeta>

      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
        <Tarjeta className="px-5 py-4">
          <h3 className="text-[16px] font-bold">Horas punta de cada zona</h3>
          <p className="text-[12.5px] text-muted mb-2">Para cada zona, su hora punta y la ventana de 4 horas más cargada: es cuando más patinetes cargados hacen falta allí. Pulsa una zona para ver su perfil.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse" aria-label="Horas punta por zona y patinetes cargados de cada plan">
              <thead className="bg-surface"><tr>
                <th scope="col" className="text-left font-semibold px-2 py-2 text-[12px]">Zona</th>
                <th scope="col" className="text-right font-semibold px-2 text-[12px]">Hora punta</th>
                <th scope="col" className="text-right font-semibold px-2 text-[12px]">Ventana de 4 h</th>
              </tr></thead>
              <tbody>
                {ZONAS.map((z, zi) => (
                  <tr key={z} onClick={() => setZsel((s) => (s === zi ? null : zi))} onMouseEnter={() => setHov({ z: zi, c: franjas ? picoCol[zi] : pico[zi] })} onMouseLeave={() => setHov(null)}
                    className={`border-b border-border last:border-0 cursor-pointer transition-colors ${zonaAct === zi ? 'bg-surface' : 'hover:bg-surface'}`}>
                    <th scope="row" className="text-left px-2 py-2.5 font-semibold">{corta(z)}</th>
                    <td className="text-right px-2 whitespace-nowrap"><b>{pico[zi]} h</b><span className="block text-[11.5px] text-muted">{num(M[zi][pico[zi]], 1)} viajes</span></td>
                    <td className="text-right px-2 whitespace-nowrap">{vent[zi].ini}–{vent[zi].fin} h<span className="block text-[11.5px] text-muted">{pct(vent[zi].suma, totZona[zi])} % del día</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>

        <Tarjeta className="px-5 py-4">
          <h3 className="text-[16px] font-bold">Perfil por hora · {zonaAct == null ? 'todas las zonas' : ZONAS[zonaAct]}</h3>
          <p className="text-[12.5px] text-muted">Viajes esperados en cada hora de mañana. Las tres horas más cargadas, más oscuras.</p>
          <div style={{ height: 260 }} role="img" aria-label="Perfil horario de la demanda">
            <ResponsiveContainer>
              <BarChart data={perfil} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="12%">
                <CartesianGrid stroke="#EEEEEE" vertical={false} />
                <XAxis dataKey="h" tick={{ fontSize: 11 }} stroke="#AFAFAF" interval={1} />
                <YAxis tick={{ fontSize: 11, fill: '#6B6B6B' }} stroke="#AFAFAF" width={34} tickFormatter={(v) => num(v)} />
                <Tooltip content={tipPerfil} cursor={{ fill: 'rgba(0,0,0,.05)' }} />
                <Bar dataKey="v" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {perfil.map((p) => <Cell key={p.h} fill={top3.includes(p.h) ? '#B2182B' : colorDemanda(0.25 + 0.4 * (p.v / perfilMax))} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[12.5px] text-muted mt-1">Horas más cargadas: {top3.slice().sort((a, b) => a - b).map((h) => `${h} h`).join(', ')}. {zonaAct != null ? 'Pulsa la zona otra vez para ver todas.' : 'Pulsa una zona para ver la suya.'}</div>
        </Tarjeta>
      </div>
    </div>
  )
}
