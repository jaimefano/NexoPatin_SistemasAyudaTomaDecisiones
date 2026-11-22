import React, { useEffect, useState } from 'react'
import { getEstado, getYo, postAdminEstado, salir } from './api.js'
import { ZONAS } from './utils.js'
import { Boton, Tarjeta, Logo } from './components/ui.jsx'

const fechaLarga = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
const TIPO = { laborable: 'laborable', fin_de_semana: 'fin de semana' }

// Pantalla del administrador (/admin): carga el estado de la flota de esta noche. La fecha es la de hoy (no se elige).
// No aparece en la barra lateral del jefe. Sin sesión, api.js lleva al acceso; con sesión de jefe, se avisa.
export default function Admin() {
  const [yo, setYo] = useState(null)
  const [e, setE] = useState(null)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    getYo().then((u) => { setYo(u); if (u.rol === 'admin') getEstado().then(setE).catch((x) => setError(x.message)) }).catch((x) => setError(x.message))
  }, [])

  const marco = (hijos) => (
    <div className="max-w-[760px] mx-auto p-10">
      <div className="flex items-center gap-3 text-[22px] mb-6"><Logo /><span className="text-muted">· Administrador</span>
        {yo && <button onClick={salir} className="ml-auto text-[14px] underline">Cerrar sesión</button>}</div>
      {hijos}
    </div>
  )
  if (error) return marco(<p role="alert" className="text-negative">{error}</p>)
  if (!yo) return marco(<p className="text-muted">Cargando…</p>)
  if (yo.rol !== 'admin') return marco(<><h1 className="text-[28px] font-bold mb-2">Esta página es solo para el administrador</h1><p className="text-muted mb-5">Has entrado como {yo.nombre}.</p><a href="/opciones" className="underline">Ir a la planificación</a></>)
  if (!e) return marco(<p className="text-muted">Cargando…</p>)

  const num = (v) => (v === '' ? '' : Number(v))
  const cambiar = (grupo, z, v) => setE({ ...e, [grupo]: { ...e[grupo], [z]: num(v) } })
  const total = ZONAS.reduce((s, z) => s + (e.cargados[z] || 0) + (e.bajos[z] || 0), 0)
  const guardar = async () => {
    try {
      const r = await postAdminEstado({ cargados: e.cargados, bajos: e.bajos, stock_taller: e.stock_taller })
      setE({ ...e, ...r }); setMsg({ ok: true, t: 'Estado de la flota guardado para esta noche.' })
    } catch (err) { setMsg({ ok: false, t: err.message }) }
  }
  const campo = 'bg-surface rounded-[10px] h-11 px-3 w-28 outline-none text-right'
  return marco(
    <>
      <h1 className="text-[34px] font-bold mb-2">Estado de la flota</h1>
      <p className="text-muted mb-6">Estado de los patinetes al empezar la noche. El jefe no ve esta pantalla.</p>
      <Tarjeta className="p-6 mb-4">
        <div className="text-[13px] text-muted">Noche de hoy (se actualiza sola cada día)</div>
        <div className="text-[22px] font-bold first-letter:uppercase">{fechaLarga(e.fecha)}</div>
        <div className="text-[13px] text-muted mt-1">Días que se simulan: {e.tipos_dias.map((t) => TIPO[t]).join(' · ')}</div>
        {!e.flota_de_hoy && <p className="mt-3 text-[14px] text-warning-ink font-medium">Todavía no has cargado la flota de hoy: el jefe está viendo la del {new Date(e.fecha_flota + 'T12:00:00').toLocaleDateString('es-ES')}. Revisa las cifras y guárdalas.</p>}
      </Tarjeta>
      <Tarjeta className="p-6 mb-4">
        <table className="w-full text-[14px]">
          <thead className="bg-surface"><tr><th className="text-left px-3 py-2">Zona</th><th className="text-right px-3">Con batería</th><th className="text-right px-3">Bajos</th></tr></thead>
          <tbody>
            {ZONAS.map((z) => (
              <tr key={z} className="border-b border-border"><td className="px-3 py-2 font-medium">{z}</td>
                <td className="text-right px-3"><input type="number" min="0" className={campo} value={e.cargados[z]} onChange={(x) => cambiar('cargados', z, x.target.value)} aria-label={`${z}: con batería`} /></td>
                <td className="text-right px-3"><input type="number" min="0" className={campo} value={e.bajos[z]} onChange={(x) => cambiar('bajos', z, x.target.value)} aria-label={`${z}: bajos`} /></td></tr>
            ))}
            <tr><td className="px-3 py-3 font-medium">Taller (stock de cargados)</td><td className="text-right px-3"><input type="number" min="0" className={campo} value={e.stock_taller} onChange={(x) => setE({ ...e, stock_taller: num(x.target.value) })} aria-label="Stock del taller" /></td><td /></tr>
          </tbody>
        </table>
        <p className="text-[13px] text-muted mt-3">Flota en zonas: {total} patinetes · stock del taller: {e.stock_taller}</p>
      </Tarjeta>
      <div className="flex items-center gap-4">
        <Boton variante="primario" onClick={guardar}>Guardar estado de hoy</Boton>
        {msg && <span role="status" className={msg.ok ? 'text-positive' : 'text-negative'}>{msg.t}</span>}
        <a href="/opciones" className="ml-auto underline text-[14px]">Ir a la planificación</a>
      </div>
    </>
  )
}
