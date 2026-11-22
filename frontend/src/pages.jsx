import React, { useState } from 'react'
import { useEvaluacion } from './hooks.js'
import MapView from './components/MapView.jsx'
import { Boton, Camion, Cabecera, Tarjeta, IconAtras, IconFlecha } from './components/ui.jsx'
import { ZONAS, claseVar, textoTarea, num, sgn } from './utils.js'


// ------------------------------------------------------------------ Límites
export function Limites({ limites, setLimites, reserva, onVolver }) {
  const campo = (clave, etiqueta, unidad, ayuda, conv = (v) => v, inv = (v) => v) => (
    <Tarjeta className="p-6">
      <label className="font-semibold block mb-1" htmlFor={clave}>{etiqueta}</label>
      <p className="text-[13px] text-muted mb-3">{ayuda}</p>
      <div className="flex items-center gap-3">
        <input id={clave} type="number" min="0" className="bg-surface rounded-[10px] h-12 px-3 w-40 outline-none" placeholder="Sin límite"
          value={limites[clave] == null ? '' : conv(limites[clave])} onChange={(e) => setLimites({ ...limites, [clave]: e.target.value === '' ? null : inv(Number(e.target.value)) })} />
        <span className="text-muted">{unidad}</span>
        {limites[clave] != null && <Boton className="ml-auto !h-10" onClick={() => setLimites({ ...limites, [clave]: null })}>Quitar límite</Boton>}
      </div>
    </Tarjeta>
  )
  return (
    <div className="pt-9 max-w-[760px]">
      <Cabecera titulo="Límites" miga={[{ texto: 'Planificación', onClick: onVolver }, { texto: 'Límites' }]}
        extra={<Boton className="ml-4" onClick={onVolver}><IconAtras size={18} /> Volver</Boton>} />
      <p className="text-muted mb-6">Al cambiar un límite, la lista de <b className="text-ink">Seleccionar</b> se regenera: los planes que lo incumplen salen de la lista. Tus planes propios <b className="text-ink">avisan, no bloquean</b>: salen marcados con ⚠ y se pueden usar igualmente. Solo las reglas físicas (360 min, 20 por viaje, stock del taller, bajos disponibles) bloquean.</p>
      <div className="space-y-4">
        {campo('coste_max', 'Coste máximo de camiones', 'USD', 'Aviso si el coste de los camiones de esta noche supera este valor.')}
        {campo('demanda_min', 'Demanda atendida mínima', '%', 'Aviso si la demanda atendida esperada a 3 días baja de este porcentaje.', (v) => +(v * 100).toFixed(1), (v) => v / 100)}
        {campo('reserva_min', 'Reserva mínima en el taller', 'cargados', `Patinetes cargados que deben quedar en el taller (en el taller hay ${num(reserva)} ahora).`)}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Añadir tarea paso a paso
export function Anadir({ estado, mapa, base, ruta, limites, capa, setCapa, fecha, etiqueta, pasos, onCancelar, onAnadir }) {
  const [paso, setPaso] = useState(1)
  const [f, setF] = useState({ modo: 'CAMBIO', camion: 1, zona: null, rep: 0, rec: 0, mov: 0, destino: null })
  const flotaZ = f.zona ? base.flota.zonas[f.zona] : null
  const maxRep = Math.min(20, base.reserva), maxRec = flotaZ ? Math.min(20, flotaZ.bajos) : 0, maxMov = flotaZ ? Math.min(20, flotaZ.cargados) : 0
  const elegirZona = (z) => {
    if (!z) return
    const fz = base.flota.zonas[z]
    setF((o) => ({ ...o, zona: z, rep: Math.min(20, base.reserva), rec: Math.min(20, fz.bajos), mov: Math.min(20, fz.cargados), destino: ZONAS.find((x) => x !== z) }))
  }
  const tarea = f.zona ? (f.modo === 'CAMBIO' ? ['CAMBIO', f.zona, f.rep, f.rec] : ['REUBICAR', f.zona, f.destino, f.mov]) : null
  const { ev, cargando } = useEvaluacion({ ruta, limites, camion: f.camion, tarea, comparar: false, activo: paso >= 2 || !!tarea })
  const libres = (c) => 360 - (base.tiempos[String(c)] || 0)
  const problemas = ev?.problemas || []
  const sel = 'bg-surface-2 rounded-[10px] h-12 px-3 w-full outline-none'
  const tipo = (id, titulo, texto) => (
    <button key={id} onClick={() => setF({ ...f, modo: id })} aria-pressed={f.modo === id}
      className={`text-left rounded-2xl p-5 bg-white ${f.modo === id ? 'border-2 border-accent' : 'border border-border'}`}>
      <div className="text-[20px] font-bold mb-2">{titulo}</div><div className="text-muted text-[14px]">{texto}</div>
    </button>
  )
  const desliz = (etiqueta, v, max, k) => (
    <div className="mb-5" key={k}>
      <div className="font-semibold mb-2">{etiqueta}</div>
      <div className="flex items-center gap-4 max-w-[520px]"><input type="range" className="rango-pres" style={{ "--p": (max > 0 ? (v / max) * 100 : 0) + "%" }} min="0" max={max} value={v} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} aria-label={etiqueta} /><span className="bg-surface rounded-lg w-14 h-10 flex items-center justify-center font-semibold">{v}</span></div>
      <div className="text-[12px] text-muted mt-1">0 a {max}</div>
    </div>
  )
  const metrica = (t, v, cls = '') => <div className="min-w-[110px]"><div className="text-[13px] text-muted">{t}</div><div className={`font-semibold ${cls}`}>{v}</div></div>
  const d = ev?.delta

  return (
    <div className="pt-9 pb-28">
      <Cabecera titulo="Añadir una tarea" etiqueta={etiqueta} pasos={pasos}
        miga={[{ texto: 'Planificación', onClick: onCancelar }, { texto: `Noche del ${fecha}`, onClick: onCancelar }, { texto: 'Plan propio', onClick: onCancelar }, { texto: 'Añadir tarea' }]} />

      <div className="grid gap-8 mt-8" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)' }}>
        <div>
          {paso === 1 && (
            <>
              <h2 className="text-[24px] font-bold mb-4">Elige el tipo de tarea</h2>
              <div className="grid grid-cols-2 gap-4 mb-9">
                {tipo('CAMBIO', 'Cambio de patinetes', 'El camión lleva cargados desde el taller a una zona, recoge los bajos y los devuelve al taller.')}
                {tipo('REUBICAR', 'Reubicación', 'El camión mueve cargados de una zona a otra y se queda en la zona de destino.')}
              </div>
              <h2 className="text-[24px] font-bold mb-4">Camión y zona</h2>
              <label className="block font-semibold text-[13px] mb-1.5">Camión</label>
              <select aria-label="Camión" className={sel + ' mb-5'} value={f.camion} onChange={(e) => setF({ ...f, camion: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((c) => <option key={c} value={c}>Camión {c} · {num(libres(c))} min libres</option>)}
              </select>
              <label className="block font-semibold text-[13px] mb-1.5">{f.modo === 'CAMBIO' ? 'Zona del cambio' : 'Zona de origen'}</label>
              <select aria-label="Zona" className={sel} value={f.zona || ''} onChange={(e) => elegirZona(e.target.value)}>
                <option value="">Elige una zona o hazlo en el mapa</option>
                {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
              <p className="text-[12.5px] text-muted mt-4">Esta vista es para añadir una tarea propia sin pasar por la tabla de alternativas. Los límites avisan pero no bloquean tu tarea.</p>
            </>
          )}
          {paso === 2 && (
            <>
              <h2 className="text-[24px] font-bold mb-4">Cantidades</h2>
              <p className="text-muted mb-5">{f.modo === 'CAMBIO' ? `Cambio en ${f.zona} con el camión ${f.camion}` : `Reubicar desde ${f.zona} con el camión ${f.camion}`}</p>
              {f.modo === 'CAMBIO' ? (<>{desliz('Repone (cargados que deja)', f.rep, maxRep, 'rep')}{desliz('Recoge (bajos que se lleva)', f.rec, maxRec, 'rec')}</>) : (
                <>
                  {desliz(`Patinetes cargados a mover desde ${f.zona}`, f.mov, maxMov, 'mov')}
                  <label className="block font-semibold text-[13px] mb-1.5">Zona de destino</label>
                  <select aria-label="Zona de destino" className={sel + ' max-w-[520px]'} value={f.destino} onChange={(e) => setF({ ...f, destino: e.target.value })}>{ZONAS.filter((z) => z !== f.zona).map((z) => <option key={z}>{z}</option>)}</select>
                </>
              )}
            </>
          )}
          {paso === 3 && (
            <>
              <h2 className="text-[24px] font-bold mb-4">Confirmar</h2>
              <Tarjeta className="p-5">
                <div className="flex items-center gap-2 mb-2"><Camion n={f.camion} /><b>Camión {f.camion}</b></div>
                <div className="font-semibold">{textoTarea(tarea)}</div>
                {f.modo === 'CAMBIO' && <div className="text-muted text-[13px]">repone {f.rep} · recoge {f.rec}</div>}
                {ev && <div className="text-[13px] text-muted mt-2">Dura {num(ev.tiempo_tarea)} min; al camión le quedarían {num(ev.tiempo_libre)} min.</div>}
              </Tarjeta>
              {ev?.avisos?.length > 0 && <p className="mt-3 text-warning-ink text-[13px]">⚠ Incumple un límite: {ev.avisos.join(' · ')}. Puedes añadirla igualmente.</p>}
            </>
          )}
          {problemas.length > 0 && paso >= 2 && <div role="alert" className="mt-4 bg-[#FDECEA] text-negative rounded-xl p-3 text-[13px]">{problemas.map((p, i) => <div key={i}>{p}</div>)}</div>}
        </div>
        <MapView mapa={mapa} flota={base.flota} preview={ev && tarea ? { ...ev, tarea } : null} ruta={ruta} capa={capa} setCapa={setCapa} zonaSel={f.zona}
          demandaZona={estado.demanda_zona} perdidosZona={base.perdidos_zona} onZona={(z) => paso === 1 && elegirZona(z)} altura={600} interactivo={paso === 1} />
      </div>

      <div className="fixed left-[92px] right-0 bottom-0 bg-white border-t border-border h-[84px] px-8 flex items-center gap-8 z-30">
        <div className="w-[220px]">
          <div className="font-semibold mb-2">Paso {paso} de 3</div>
          <div className="h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-all" style={{ width: (paso / 3) * 100 + '%' }} /></div>
        </div>
        {metrica('Tiempo del camión', ev && tarea ? `${num(ev.tiempo_tarea)} min` : '—')}
        {metrica('Beneficio 3 días', d && tarea ? `${sgn(d.beneficio)} USD` : '—', d ? claseVar('beneficio', d.beneficio) : '')}
        {metrica('Viajes perdidos 3 días', d && tarea ? sgn(d.perdidos) : '—', d ? claseVar('perdidos', d.perdidos) : '')}
        {metrica('Coste', d && tarea ? `${sgn(d.coste)} USD` : '—', d ? claseVar('coste', d.coste) : '')}
        <div className="ml-auto flex gap-3">
          {paso > 1 && <Boton onClick={() => setPaso(paso - 1)}><IconAtras size={18} /> Atrás</Boton>}
          <Boton onClick={onCancelar}>Cancelar</Boton>
          {paso < 3 ? (
            <Boton variante="primario" disabled={!f.zona || (paso === 2 && (problemas.length > 0 || cargando))} onClick={() => setPaso(paso + 1)}>{paso === 1 ? 'Ver cantidades' : 'Revisar'} <IconFlecha size={18} /></Boton>
          ) : (
            <Boton variante="primario" disabled={!ev || cargando || problemas.length > 0} onClick={() => onAnadir(f.camion, tarea)}>Añadir a la ruta</Boton>
          )}
        </div>
      </div>
    </div>
  )
}
