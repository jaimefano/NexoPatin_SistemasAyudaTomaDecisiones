import React, { useMemo } from 'react'
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot } from 'recharts'
import { Tarjeta, Selector } from './ui.jsx'
import { METRICAS, textoTarea, claveTarea } from '../utils.js'

const EJES = ['beneficio', 'perdidos', 'demanda', 'coste', 'bajos', 'tiempo']
const valor = (m, c) => (m === 'tiempo' ? c.tiempo_libre - 360 : METRICAS[m].var(c.delta, c))
const etiq = (m) => (m === 'tiempo' ? 'Tiempo libre del camión (variación, min)' : `${METRICAS[m].nombre} (variación${METRICAS[m].unidadVar ? ', pp' : METRICAS[m].unidad ? ', ' + METRICAS[m].unidad : ''})`)

export default function Dispersion({ candidatas, ejes, setEjes, activa, onSelect, onHover, alto = 300 }) {
  const puntos = useMemo(() => candidatas.map((c) => ({ x: valor(ejes.x, c), y: valor(ejes.y, c), id: claveTarea(c.camion, c.tarea), c })), [candidatas, ejes])
  const act = puntos.find((p) => p.id === activa)
  const opciones = EJES.map((m) => ({ valor: m, texto: METRICAS[m].nombre.replace(' 3 días', '').replace(' del camión', '') }))
  // Como en el wireframe, el eje de viajes perdidos va con los valores negativos arriba
  const invY = ejes.y === 'perdidos'
  return (
    <Tarjeta className="p-6">
      <h3 className="text-[17px] font-semibold mb-3">Cada punto es una tarea posible</h3>
      <div className="flex gap-2 mb-2 flex-wrap">
        <Selector plano etiqueta="Eje X" valor={ejes.x} opciones={opciones} onChange={(v) => setEjes({ ...ejes, x: v })} />
        <Selector plano etiqueta="Eje Y" valor={ejes.y} opciones={opciones} onChange={(v) => setEjes({ ...ejes, y: v })} />
      </div>
      <div style={{ height: alto }} role="img" aria-label="Gráfico de dispersión de las tareas posibles">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 14, right: 60, bottom: 22, left: 14 }}>
            <CartesianGrid stroke="#EEEEEE" />
            <XAxis type="number" dataKey="x" name={etiq(ejes.x)} tick={{ fontSize: 11, fill: '#AFAFAF' }} stroke="#AFAFAF" label={{ value: etiq(ejes.x) + ' →', position: 'insideBottom', offset: -14, fontSize: 12, fill: '#000' }} domain={['auto', 'auto']} />
            <YAxis type="number" dataKey="y" name={etiq(ejes.y)} reversed={invY} tick={{ fontSize: 11, fill: '#AFAFAF' }} stroke="#AFAFAF" width={50} label={{ value: etiq(ejes.y).replace(' 3 días', '').replace(/\(variación.*\)/, '(variación)'), angle: -90, position: 'insideLeft', fontSize: 12, fill: '#000', dx: -4, style: { textAnchor: 'middle' } }} domain={['auto', 'auto']} />
            <ReferenceLine x={0} stroke="#CBCBCB" strokeDasharray="3 3" />
            <ReferenceLine y={0} stroke="#CBCBCB" strokeDasharray="3 3" />
            <ReferenceDot x={0} y={0} r={5} fill="#AFAFAF" stroke="none" label={{ value: 'ruta actual (no hacer nada)', position: 'right', fontSize: 11, fill: '#6B6B6B' }} />
            <Tooltip cursor={false} content={({ payload }) => (payload?.length ? (
              <div className="bg-white shadow-float rounded-lg px-3 py-2 text-[12px]">
                <div className="font-semibold">Camión {payload[0].payload.c.camion}: {textoTarea(payload[0].payload.c.tarea)}</div>
              </div>) : null)} />
            <Scatter data={puntos} isAnimationActive={false}
              shape={(p) => (
                <circle cx={p.cx} cy={p.cy} r={p.payload.id === activa ? 0 : 6} fill="#fff" stroke="#6B6B6B" strokeWidth="1.5" style={{ cursor: 'pointer' }}
                  onClick={() => onSelect(p.payload.c)} onMouseEnter={() => onHover(p.payload.c)} onMouseLeave={() => onHover(null)} />
              )} />
            {act && <ReferenceDot x={act.x} y={act.y} r={8} fill="#11A5A5" stroke="#fff" strokeWidth={2} label={{ value: 'fila marcada', position: 'top', fontSize: 11, fill: '#0A6B6B', fontWeight: 600 }} />}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[12px] text-muted mt-1">Al pasar el ratón por un punto se ve la tarea; un clic en el punto la selecciona en la tabla. No hay zona "buena" marcada.</p>
    </Tarjeta>
  )
}
