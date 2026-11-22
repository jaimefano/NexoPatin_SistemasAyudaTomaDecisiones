import React, { useEffect, useState } from 'react'
import { useSesion } from './store.jsx'
import { getHistorial } from './api.js'
import { Boton, Cabecera, Tarjeta, IconAtras } from './components/ui.jsx'
import { num } from './utils.js'

const ROLES = { admin: 'Administrador', jefe: 'Jefe' }
const fechaLarga = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
const horaDe = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

// Perfil del usuario: sus datos, cerrar sesión, las rutas enviadas en noches anteriores, los datos de la noche y empezar de nuevo.
// (El estado de la flota lo fija el administrador en otra página; aquí no aparece.)
export default function Perfil({ estado, etiqueta, ir, usuario, salir }) {
  const { s, reiniciar } = useSesion()
  const [hecho, setHecho] = useState(false)
  const [historial, setHistorial] = useState(null)
  const [errorHist, setErrorHist] = useState(null)
  useEffect(() => { getHistorial().then((r) => setHistorial(r.planes)).catch((e) => setErrorHist(e.message)) }, [])

  const nBandeja = s.bandeja.filter(Boolean).length
  const hayAlgo = nBandeja > 0 || s.elegido != null || s.orden != null || Object.keys(s.filtros.rangos).length > 0 || s.filtros.q !== '' || s.filtros.tareas.length > 0 || s.propio.historial.length > 0

  const empezarDeNuevo = () => { reiniciar(s.firma); setHecho(true) }
  const fila = (t, v) => <div className="flex justify-between gap-4 py-2.5 border-b border-border last:border-0"><span className="text-muted">{t}</span><span className="font-semibold">{v}</span></div>
  const iniciales = usuario.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('')

  return (
    <div className="max-w-[900px]">
      <Cabecera titulo="Perfil" miga={[{ texto: 'Planificación', onClick: () => ir('/opciones') }, { texto: 'Perfil' }]}
        extra={<Boton onClick={() => ir('/opciones')}><IconAtras size={18} /> Volver</Boton>} />
      <Tarjeta className="p-6 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <span className="w-16 h-16 rounded-full bg-ink text-white inline-flex items-center justify-center text-[22px] font-bold shrink-0" aria-hidden="true">{iniciales}</span>
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold leading-tight truncate">{usuario.nombre}</h2>
            <p className="text-[14px] text-muted truncate">{ROLES[usuario.rol] || usuario.rol}</p>
          </div>
          <Boton className="ml-auto" onClick={salir}>Cerrar sesión</Boton>
        </div>
        {fila('Nombre de usuario', usuario.nombre)}
        {fila('Correo', usuario.usuario.includes('@') ? usuario.usuario : '—')}
        {fila('Rol', ROLES[usuario.rol] || usuario.rol)}
      </Tarjeta>

      <Tarjeta className="p-6 mb-4">
        <h2 className="text-[17px] font-bold mb-1">Rutas enviadas</h2>
        <p className="text-[13px] text-muted mb-3">La ruta que se envió al equipo cada noche, de la más reciente a la más antigua.</p>
        {errorHist ? <p role="alert" className="text-negative text-[14px]">{errorHist}</p>
          : !historial ? <p className="text-muted text-[14px]">Cargando…</p>
          : historial.length === 0 ? <p className="text-muted text-[14px]">Todavía no se ha enviado ninguna ruta.</p>
          : (
            <table className="w-full text-[14px] border-collapse">
              <thead className="bg-surface text-[13px]"><tr>
                <th className="text-left font-semibold px-3 py-2">Noche</th><th className="text-left font-semibold px-3">Plan</th>
                <th className="text-left font-semibold px-3">Enviada</th><th className="text-right font-semibold px-3">Beneficio 3 días</th><th className="text-right font-semibold px-3">Coste</th>
              </tr></thead>
              <tbody>
                {historial.map((p) => (
                  <tr key={p.fecha_noche} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{fechaLarga(p.fecha_noche)}{p.fecha_noche === estado.fecha && <span className="ml-2 text-[12px] font-semibold text-cta-ink">hoy</span>}</td>
                    <td className="px-3">{p.etiqueta}</td>
                    <td className="px-3 text-muted whitespace-nowrap">{horaDe(p.confirmado_el)} · {p.confirmado_por}</td>
                    <td className="px-3 text-right whitespace-nowrap">{num(p.kpis.esperado.beneficio3)} USD</td>
                    <td className="px-3 text-right whitespace-nowrap">{num(p.kpis.esperado.coste)} USD</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Tarjeta>

      <Tarjeta className="p-6 mb-4">
        <h2 className="text-[17px] font-bold mb-1">Esta noche</h2>
        <p className="text-[13px] text-muted mb-3">Datos de la noche que estás planificando. La fecha es la de hoy y cambia sola cada día.</p>
        {fila('Noche del', etiqueta.split(' · ')[0])}
        {fila('Días que se simulan', estado.tipos_dias.map((t) => (t === 'laborable' ? 'laborable' : 'fin de semana')).join(' · '))}
        {fila('Camiones', `${estado.n_camiones} · ${estado.jornada_min} min cada uno`)}
      </Tarjeta>
      <Tarjeta className="p-6">
        <h2 className="text-[17px] font-bold mb-1">Empezar de nuevo</h2>
        <p className="text-[13px] text-muted mb-4">Vacía la bandeja, tus planes propios, los filtros y el plan elegido. Los límites se conservan.</p>
        <div className="flex items-center gap-4">
          <Boton onClick={empezarDeNuevo} disabled={!hayAlgo}>Empezar de nuevo</Boton>
          <span role="status" className="text-[13px] text-muted">{hecho && !hayAlgo ? 'Listo: la planificación está vacía.' : !hayAlgo ? 'No hay nada que vaciar.' : ''}</span>
        </div>
      </Tarjeta>
    </div>
  )
}
