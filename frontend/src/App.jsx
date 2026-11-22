import React, { useEffect, useState } from 'react'
import { getEstado, getMapa, getYo, getConfirmado, salir } from './api.js'
import { SesionProvider, useSesion } from './store.jsx'
import { useRuta } from './router.js'
import { IconLista, IconLimites, IconPerfil, IconSalir, Stepper } from './components/ui.jsx'
import Portada from './Portada.jsx'
import Acceso from './Acceso.jsx'
import Perfil from './Perfil.jsx'
import Opciones from './Opciones.jsx'
import PlanPropio from './PlanPropio.jsx'
import Comparar from './Comparar.jsx'
import Decidir from './Decidir.jsx'
import { Limites } from './pages.jsx'

// Barra lateral: volver a Seleccionar, Límites y Perfil (los pasos del proceso se navegan desde la barra de pasos de la cabecera)
const LATERAL = [['/opciones', 'Seleccionar', IconLista], ['/limites', 'Límites', IconLimites], ['/perfil', 'Perfil', IconPerfil]]

// Firma del estado de la flota: si el administrador lo cambia, se vacía la bandeja y se regeneran los planes
const firmaDe = (e) => JSON.stringify([e.fecha, e.tipo_dia, e.cargados, e.bajos, e.stock_taller])

function Aplicacion() {
  const { s, set, reiniciar } = useSesion()
  const [ruta, ir] = useRuta()
  const [estado, setEstado] = useState(null)
  const [mapa, setMapa] = useState(null)
  const [usuario, setUsuario] = useState(null)
  const [enviado, setEnviado] = useState(undefined)     // plan enviado esta noche (null si aún no); undefined mientras carga
  const [error, setError] = useState(null)

  const [aviso, setAviso] = useState(false)
  const publica = ruta === '/' || ruta === '/acceso'
  const refrescarEnviado = () => getConfirmado().then((r) => setEnviado(r.plan)).catch(() => {})

  // Las páginas de la aplicación exigen sesión: sin ella, la API responde 401 y api.js lleva al acceso
  useEffect(() => {
    if (publica || estado) return
    Promise.all([getYo(), getEstado(), getMapa(), getConfirmado()])
      .then(([u, e, m, c]) => { setUsuario(u); setEstado(e); setMapa(m); setEnviado(c.plan) })
      .catch((e) => setError(e.message))
  }, [publica, estado])
  useEffect(() => {
    if (estado && s.firma !== firmaDe(estado)) {
      if (s.firma != null) setAviso(true)   // había una sesión con otro estado de flota
      reiniciar(firmaDe(estado))
    }
  }, [estado, s.firma, reiniciar])

  // Comprobación periódica ligera del estado (cada 5 s y al volver a la ventana)
  useEffect(() => {
    let vivo = true
    const comprobar = () => {
      if (document.hidden || ['/', '/acceso'].includes(window.location.pathname)) return
      getEstado().then((e) => { if (vivo) setEstado((a) => (a && firmaDe(a) === firmaDe(e) && a.flota_de_hoy === e.flota_de_hoy ? a : e)) }).catch(() => {})
      getConfirmado().then((r) => { if (vivo) setEnviado((a) => (a?.confirmado_el === r.plan?.confirmado_el ? a : r.plan)) }).catch(() => {})
    }
    const t = setInterval(comprobar, 5000)
    document.addEventListener('visibilitychange', comprobar)
    window.addEventListener('focus', comprobar)
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', comprobar); window.removeEventListener('focus', comprobar) }
  }, [])

  if (ruta === '/') return <Portada ir={ir} />
  if (ruta === '/acceso') return <Acceso ir={ir} />
  if (error) {
    return (
      <div className="p-10 max-w-[640px]" role="alert">
        <h1 className="text-2xl font-bold">No se puede cargar la planificación</h1>
        <p className="mt-2 mb-5 text-muted">{error}</p>
        <button onClick={() => window.location.reload()} className="h-11 px-5 rounded-full bg-cta text-white font-medium hover:bg-cta-hover">Volver a intentarlo</button>
      </div>
    )
  }
  if (!estado || !mapa || enviado === undefined || s.firma !== firmaDe(estado)) return <div className="p-10 text-muted">Cargando…</div>

  const dmDe = (iso) => { const f = new Date(iso + 'T12:00:00'); return `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}` }
  const dm = dmDe(estado.fecha)
  const etiqueta = `${dm} · mañana ${estado.tipo_dia === 'laborable' ? 'laborable' : 'fin de semana'}`
  const nBandeja = s.bandeja.filter(Boolean).length
  const hechos = [nBandeja > 0, s.bandeja.some((p) => p && p.origen === 'propio'), s.elegido != null || !!enviado, !!enviado]
  const pasos = <Stepper ruta={ruta} ir={ir} puedeComparar={nBandeja >= 2} puedeDecidir={s.elegido != null || !!enviado} hechos={hechos} />
  const comunes = { estado, mapa, etiqueta, pasos, ir, usuario, enviado, refrescarEnviado, salir }
  const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="min-h-screen app-escala">
      <aside className="fixed left-0 top-0 bottom-0 w-[92px] border-r border-border bg-white z-40 flex flex-col items-center pt-7 gap-5" aria-label="Navegación">
        {LATERAL.map(([id, nombre, Ico]) => (
          <button key={id} aria-label={nombre} title={nombre} aria-current={ruta === id ? 'page' : undefined} onClick={() => ir(id)}
            className={`w-[62px] h-[62px] flex items-center justify-center rounded-2xl transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta ${ruta === id ? 'bg-cta text-white' : 'text-ink hover:bg-cta/15 active:scale-95'}`}><Ico /></button>
        ))}
        <button aria-label="Cerrar sesión" title="Cerrar sesión" onClick={salir}
          className="mt-auto mb-7 w-[62px] h-[62px] flex items-center justify-center rounded-2xl text-ink transition-all duration-200 ease-out hover:bg-accent-bg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta"><IconSalir /></button>
      </aside>

      <main className="ml-[92px] px-8 pt-6 pb-6">
        <div role="status" aria-live="polite">
          {aviso && (
            <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3 text-[14px]">
              <span>El estado de la flota ha cambiado: se han regenerado los planes y se ha vaciado la bandeja.</span>
              <button onClick={() => setAviso(false)} className="font-semibold underline">Entendido</button>
            </div>
          )}
          {!estado.flota_de_hoy && (
            <div className="mb-4 rounded-xl border border-warning bg-[#FFF7E6] px-4 py-3 text-[14px] text-ink">
              <b>El administrador todavía no ha cargado la flota de esta noche.</b> Estás viendo la del {dmDe(estado.fecha_flota)}: puedes preparar los planes, pero no enviar la ruta hasta que la cargue.
            </div>
          )}
          {enviado && ruta !== '/decidir' && (
            <div className="mb-4 flex items-center justify-between gap-4 rounded-xl bg-ink text-white px-4 py-3 text-[14px]">
              <span><b>La ruta de esta noche ya se envió al equipo</b> ({enviado.etiqueta}, a las {hora(enviado.confirmado_el)}). Ya no se puede cambiar.</span>
              <button onClick={() => ir('/decidir')} className="shrink-0 font-semibold underline underline-offset-4">Ver la ruta enviada</button>
            </div>
          )}
        </div>
        {ruta === '/opciones' && <Opciones {...comunes} />}
        {ruta === '/plan-propio' && <PlanPropio {...comunes} />}
        {ruta === '/comparar' && <Comparar {...comunes} />}
        {ruta === '/decidir' && <Decidir {...comunes} />}
        {ruta === '/perfil' && <Perfil {...comunes} />}
        {ruta === '/limites' && <Limites limites={s.limites} setLimites={(l) => set({ limites: l })} reserva={estado.stock_taller} onVolver={() => ir('/opciones')} />}
      </main>
    </div>
  )
}

export default function App() {
  return <SesionProvider><Aplicacion /></SesionProvider>
}
