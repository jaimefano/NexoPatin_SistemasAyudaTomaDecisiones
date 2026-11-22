import React, { useMemo } from 'react'
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Tarjeta, Selector } from './ui.jsx'
import { METRICAS, LETRAS, COLOR_PLAN } from '../utils.js'

const EJES = ['beneficio', 'perdidos', 'demanda', 'coste', 'bajos', 'reserva']
const etiq = (m) => `${METRICAS[m].nombre}${METRICAS[m].unidad ? ` (${METRICAS[m].unidad})` : ''}`
const CORTO = { beneficio: 'Beneficio', perdidos: 'Viajes perdidos', demanda: 'Demanda', coste: 'Coste', bajos: 'Bajos sin cambiar', reserva: 'Reserva' }
const corto = (m) => CORTO[m]

// Dispersión de planes: solo dibuja los de la bandeja y el del ratón. Sin zona "buena" sombreada. Los planes de la bandeja salen con su
// letra y color; el punto bajo el ratón (o la fila marcada) con un anillo azul; marca "no hacer nada".
// Escala "bonita": paso 1/2/5·10^n, límites múltiplos del paso y como mucho ~5 marcas (sin etiquetas solapadas ni valores raros como 15,6)
function escala(valores, noNegativo) {
  const v = valores.filter((x) => Number.isFinite(x))
  if (!v.length) return { dom: [0, 1], ticks: [0, 1] }
  let lo = Math.min(...v), hi = Math.max(...v)
  if (hi - lo < 1e-9) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.06
  lo -= pad; hi += pad
  if (noNegativo && lo < 0) lo = 0
  const bruto = (hi - lo) / 4, pot = 10 ** Math.floor(Math.log10(bruto)), r = bruto / pot
  const paso = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * pot
  const a = Math.floor(lo / paso + 1e-9) * paso, b = Math.ceil(hi / paso - 1e-9) * paso
  const ticks = []
  for (let t = a; t <= b + paso / 2; t += paso) ticks.push(Math.round(t / paso) * paso)
  return { dom: [a, b], ticks }
}
const fmt = (v) => String(Math.round(v * 100) / 100).replace('.', ',')

export default function ScatterPlanes({ planes, todos, propios = [], nada, ejes, setEjes, bandeja, previoId, onHover, onAlternar }) {
  const idsBandeja = bandeja.map((p) => (p && p.origen === 'pool' ? p.id : null))
  // Solo se dibujan los planes de la bandeja (del servidor y propios) y el plan bajo el ratón/fila marcada. Las escalas salen de TODOS
  // los planes (y los propios con KPI) para que los ejes no se muevan al marcar o filtrar.
  const puntos = useMemo(() => {
    const ids = new Set([...idsBandeja.filter(Boolean), previoId].filter(Boolean))
    const delServidor = (todos || planes).filter((p) => ids.has(p.id))
    const delPropio = propios.filter((p) => p.kpis && (bandeja[p.slot]?.origen === 'propio' || p.id === previoId))
    return [...delServidor, ...delPropio].map((p) => ({ x: METRICAS[ejes.x].abs(p.kpis), y: METRICAS[ejes.y].abs(p.kpis), id: p.id, slot: p.slot, p }))
  }, [todos, planes, propios, ejes, bandeja, previoId])
  const dominio = useMemo(() => {
    const base = [...(todos || planes), ...propios].map((p) => p.kpis).filter(Boolean)
    const rango = (m) => escala([...base.map((k) => METRICAS[m].abs(k)), METRICAS[m].abs(nada)], m !== 'beneficio')   // magnitudes no negativas nunca bajan de 0
    return { x: rango(ejes.x), y: rango(ejes.y) }
  }, [todos, planes, propios, nada, ejes])
  const opciones = EJES.map((m) => ({ valor: m, texto: corto(m) }))
  const invY = false                                // eje Y con el 0 abajo (más alto = más valor)
  const pNada = [{ x: METRICAS[ejes.x].abs(nada), y: METRICAS[ejes.y].abs(nada), id: '__nada' }]

  const forma = (p) => {
    const { cx, cy, payload } = p
    if (cx == null || cy == null) return null
    const esPropio = !!payload.p.propio
    const i = esPropio ? payload.slot : idsBandeja.indexOf(payload.id)
    const activo = payload.id === previoId
    const manejadores = { onClick: () => { if (!esPropio) onAlternar(payload.p) }, onMouseEnter: () => onHover(payload.id), onMouseLeave: () => onHover(null), style: { cursor: esPropio ? 'default' : 'pointer' } }
    if (i >= 0) {
      return (
        <g {...manejadores}>
          {activo && <circle cx={cx} cy={cy} r={12} fill="none" stroke="#11A5A5" strokeWidth="2" />}
          <circle cx={cx} cy={cy} r={8} fill={COLOR_PLAN[LETRAS[i]]} stroke="#fff" strokeWidth="1.5" />
          <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{LETRAS[i]}</text>
        </g>
      )
    }
    if (activo) {
      return (
        <g {...manejadores}>
          <circle cx={cx} cy={cy} r={11} fill="none" stroke="#11A5A5" strokeWidth="2" />
          <circle cx={cx} cy={cy} r={4.5} fill="#11A5A5" />
          <text x={cx} y={cy - 16} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0A6B6B">Plan {payload.id}</text>
        </g>
      )
    }
    return <circle cx={cx} cy={cy} r={3.8} fill="#fff" fillOpacity={0.6} stroke="#9A9A9A" strokeWidth="1.2" {...manejadores} />
  }
  const formaNada = ({ cx, cy }) => (cx == null ? null : (
    <g>
      <rect x={cx - 5} y={cy - 5} width="10" height="10" fill="#8C8C8C" />
      <text x={cx + 9} y={cy + 4} fontSize="11" fill="#6B6B6B">no hacer nada</text>
    </g>
  ))

  return (
    <Tarjeta className="px-5 py-4 flex flex-col min-h-0 flex-1">
      <h3 className="text-[17px] font-semibold mb-2">Dónde caen tus planes</h3>
      <div className="flex gap-2 mb-1 flex-wrap">
        <Selector plano etiqueta="X" valor={ejes.x} opciones={opciones} onChange={(v) => setEjes({ ...ejes, x: v })} />
        <Selector plano etiqueta="Y" valor={ejes.y} opciones={opciones} onChange={(v) => setEjes({ ...ejes, y: v })} />
      </div>
      <div className="flex-1 min-h-[110px]" role="img" aria-label="Gráfico de dispersión de los planes">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 14, right: 52, bottom: 26, left: 6 }}>
            <CartesianGrid stroke="#EEEEEE" />
            <XAxis type="number" dataKey="x" tick={{ fontSize: 11, fill: '#8C8C8C' }} stroke="#AFAFAF" domain={dominio.x.dom} ticks={dominio.x.ticks} interval={0} allowDataOverflow tickFormatter={fmt}
              label={{ value: etiq(ejes.x) + ' →', position: 'insideBottom', offset: -16, fontSize: 12, fill: '#000' }} />
            <YAxis type="number" dataKey="y" reversed={invY} tick={{ fontSize: 11, fill: '#8C8C8C' }} stroke="#AFAFAF" width={46} domain={dominio.y.dom} ticks={dominio.y.ticks} interval={0} allowDataOverflow tickFormatter={fmt}
              label={{ value: etiq(ejes.y), angle: -90, position: 'insideLeft', fontSize: 12, fill: '#000', dx: -2, style: { textAnchor: 'middle' } }} />
            <Scatter data={puntos} isAnimationActive={false} shape={forma} />
            <Scatter data={pNada} isAnimationActive={false} shape={formaNada} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[12.5px] text-muted text-center h-[36px] leading-[18px] overflow-hidden">{puntos.length === 0 ? 'Marca planes en la bandeja o pasa el ratón por una fila para ver dónde caen.' : ''}</div>
    </Tarjeta>
  )
}
