import React from 'react'
import { Boton, Camion, Tarjeta, IconCerrar, IconAviso } from './ui.jsx'
import { METRICAS, ZONAS, claseVar, textoVar, num } from '../utils.js'

function Deslizador({ etiqueta, valor, max, onChange, nota }) {
  return (
    <div className="mb-4">
      <div className="text-[13px] font-semibold mb-2">{etiqueta}</div>
      <div className="flex items-center gap-4">
        <input type="range" className="rango-pres" style={{ "--p": (max > 0 ? (valor / max) * 100 : 0) + "%" }} min="0" max={Math.max(max, 0)} step="1" value={valor} onChange={(e) => onChange(Number(e.target.value))} aria-label={etiqueta} />
        <span className="bg-surface rounded-lg w-14 h-10 flex items-center justify-center font-semibold shrink-0">{valor}</span>
      </div>
      <div className="text-[12px] text-muted mt-1.5">{nota}</div>
    </div>
  )
}

function Efecto({ titulo, ev }) {
  const d = ev?.delta
  const fila = (etiqueta, texto, cls = 'text-muted') => (
    <div key={etiqueta} className="flex items-baseline justify-between gap-4 py-2.5 border-b border-border last:border-0">
      <span className="text-[13.5px] text-muted">{etiqueta}</span>
      <span className={`font-bold text-[16px] whitespace-nowrap ${cls}`}>{texto}</span>
    </div>
  )
  const m = (k, etiqueta) => fila(etiqueta, d ? textoVar(k, METRICAS[k].var(d, ev)) : '—', d ? claseVar(k, METRICAS[k].var(d, ev)) : 'text-muted')
  return (
    <div className="bg-surface rounded-xl px-4 pt-4 pb-2 mb-3">
      <div className="text-[13px] font-semibold mb-1">{titulo}</div>
      {m('beneficio', 'Beneficio a 3 días')}
      {m('coste', 'Coste de camiones')}
      {m('perdidos', 'Viajes perdidos')}
      {m('demanda', 'Demanda atendida')}
      {m('bajos', 'Bajos sin cambiar')}
      {fila('Tiempo de camión', ev ? `${num(ev.tiempo_tarea)} min` : '—', 'text-ink')}
    </div>
  )
}

export default function ZonePanel({ zona, estadoZona, sel, ev, base, ruta, maxRep, maxRec, maxMov, cargando, onCambio, onCerrar, onAnadir }) {
  const libres = (c) => 360 - (base.tiempos[String(c)] || 0)
  const problemas = ev?.problemas || []
  const modo = sel.modo

  return (
    <Tarjeta className="p-6 h-full overflow-y-auto">
      <div className="flex items-start justify-between">
        <span className="bg-accent-bg text-accent-ink rounded-full px-3 py-1 text-[12.5px] font-medium">Nueva tarea</span>
        <button onClick={onCerrar} aria-label="Cerrar panel" className="bg-surface-2 rounded-full w-9 h-9 flex items-center justify-center"><IconCerrar size={16} /></button>
      </div>
      <h3 className="text-[30px] font-bold mt-2 leading-tight">{zona}</h3>
      <div className="text-muted mb-4">{num(estadoZona.cargados)} cargados · {num(estadoZona.bajos)} bajos</div>

      <div className="grid grid-cols-2 bg-surface-2 rounded-full p-1 mb-4" role="tablist">
        {[['CAMBIO', 'Cambiar'], ['REUBICAR', 'Reubicar']].map(([k, t]) => (
          <button key={k} role="tab" aria-selected={modo === k} onClick={() => onCambio({ modo: k })}
            className={`h-10 rounded-full font-semibold ${modo === k ? 'bg-accent text-white' : 'text-muted hover:text-accent-ink'}`}>{t}</button>
        ))}
      </div>

      <label className="block text-[13px] font-semibold mb-1.5">Camión</label>
      <div className="relative mb-4">
        <div className="bg-surface rounded-[10px] h-12 px-3 flex items-center gap-2 pointer-events-none"><Camion n={sel.camion} /> <span>Camión {sel.camion} · {num(libres(sel.camion))} min libres</span><span className="ml-auto text-[11px]">▾</span></div>
        <select className="absolute inset-0 opacity-0 cursor-pointer" value={sel.camion} onChange={(e) => onCambio({ camion: Number(e.target.value) })} aria-label="Camión">
          {[1, 2, 3, 4].map((c) => <option key={c} value={c}>Camión {c} · {num(libres(c))} min libres</option>)}
        </select>
      </div>

      {modo === 'CAMBIO' ? (
        <>
          <Deslizador etiqueta="Repone (cargados que deja)" valor={sel.rep} max={maxRep} onChange={(v) => onCambio({ rep: v })} nota={`0 a ${maxRep} (máx. 20 por viaje y stock del taller: ${num(base.reserva)})`} />
          <Deslizador etiqueta="Recoge (bajos que se lleva)" valor={sel.rec} max={maxRec} onChange={(v) => onCambio({ rec: v })} nota={`0 a ${maxRec} (máx. 20 y bajos de la zona: ${num(estadoZona.bajos)})`} />
        </>
      ) : (
        <>
          <Deslizador etiqueta={`Patinetes cargados a mover desde ${zona}`} valor={sel.mov} max={maxMov} onChange={(v) => onCambio({ mov: v })} nota={`0 a ${maxMov} (máx. 20 por viaje y cargados en ${zona} en ese momento: ${num(estadoZona.cargados)})`} />
          <div className="text-[13px] font-semibold mb-2">Compara los destinos</div>
          <table className="w-full text-[12.5px] mb-4">
            <thead className="bg-surface"><tr><th className="text-left px-2 py-1.5">Destino</th><th className="text-right px-1">Beneficio 3 d.</th><th className="text-right px-1">Viajes perd.</th><th className="text-right px-1">Tiempo</th></tr></thead>
            <tbody>
              {(ev?.destinos || ZONAS.filter((z) => z !== zona).map((d) => ({ destino: d }))).map((d) => (
                <tr key={d.destino} tabIndex={0} onClick={() => onCambio({ destino: d.destino })} onKeyDown={(e) => e.key === 'Enter' && onCambio({ destino: d.destino })}
                  className={`border-b border-border cursor-pointer ${sel.destino === d.destino ? 'bg-accent-bg outline outline-2 outline-accent -outline-offset-2' : 'hover:bg-surface'} ${d.problemas?.length ? 'text-muted-2 italic' : ''}`}>
                  <td className="px-2 py-2 font-medium">{d.destino}</td>
                  {d.delta ? (
                    <>
                      <td className={`text-right px-1 font-semibold ${d.problemas.length ? '' : claseVar('beneficio', d.delta.beneficio)}`}>{textoVar('beneficio', d.delta.beneficio)}</td>
                      <td className={`text-right px-1 font-semibold ${d.problemas.length ? '' : claseVar('perdidos', d.delta.perdidos)}`}>{sgnPlano(d.delta.perdidos)}</td>
                      <td className="text-right px-1 text-muted">{num(d.tiempo_tarea)} min</td>
                    </>
                  ) : <td colSpan={3} className="text-muted text-right">…</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {problemas.length > 0 && (
        <div role="alert" className="bg-[#FDECEA] text-negative rounded-xl p-3 mb-3 text-[12.5px] flex gap-2"><IconAviso size={16} className="shrink-0 mt-0.5" /><div>{problemas.map((p, i) => <div key={i}>{p}</div>)}</div></div>
      )}
      {ev?.avisos?.length > 0 && (
        <div className="bg-[#FFF3D6] text-warning-ink rounded-xl p-3 mb-3 text-[12.5px] flex gap-2"><IconAviso size={16} className="shrink-0 mt-0.5" /><div>Incumple un límite: {ev.avisos.join(' · ')}. Puedes añadirla igualmente.</div></div>
      )}

      <div className={cargando ? 'dim' : ''}>
        <Efecto titulo={modo === 'CAMBIO' ? 'Efecto de la tarea (en vivo al mover los deslizadores)' : `Efecto de la tarea: ${zona} → ${sel.destino}`} ev={ev} />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-2 sticky bottom-0 bg-white pt-3 pb-1">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={!ev || cargando || problemas.length > 0} onClick={onAnadir}>Añadir a la ruta</Boton>
      </div>
    </Tarjeta>
  )
}

const sgnPlano = (v) => textoVar('perdidos', v)
