import React, { useEffect, useState } from 'react'
import { postComparar, postConfirmar } from './api.js'
import { useSesion } from './store.jsx'
import { Boton, Camion, Cabecera, Tarjeta, IconAtras, IconOk, Recalculando, useLento } from './components/ui.jsx'
import { MinimapaPlan } from './components/MapView.jsx'
import { LETRAS, COLOR_PLAN, ZONAS, claseVar, nombrePlan, num, sgn, pasosTarea } from './utils.js'

const FILAS = [
  { nombre: 'Beneficio 3 días', met: 'beneficio', d: 0, u: 'USD', get: (b, m) => b[m].beneficio3 },
  { nombre: 'Beneficio día 1', met: 'beneficio', d: 0, u: 'USD', get: (b, m) => b[m].beneficio1 },
  { nombre: 'Coste de camiones', met: 'coste', d: 0, u: 'USD', get: (b, m) => b[m].coste },
  { nombre: 'Demanda atendida 3 días', met: 'demanda', d: 1, u: '%', du: 'pp', get: (b, m) => b[m].demanda * 100 },
  { nombre: 'Viajes perdidos 3 días', met: 'perdidos', d: 0, u: '', get: (b, m) => b[m].perdidos },
]

const horaDe = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

// Hojas de ruta de los 4 camiones ({camion: {minutos, tareas: [{tarea}]}})
function HojasDeRuta({ hoja }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((c) => {
        const p = hoja[String(c)] || { minutos: 0, tareas: [] }
        const pasos_ = p.tareas.flatMap((t) => pasosTarea(t.tarea))
        return (
          <Tarjeta key={c} className="px-4 py-3.5 min-h-[200px]">
            <div className="flex items-center gap-2"><Camion n={c} size={22} /><b className="text-[15px]">Camión {c}</b><span className="ml-auto text-[13px] text-muted">{num(p.minutos)} min</span></div>
            {pasos_.length ? (
              <ol className="mt-2.5 space-y-1.5 text-[13px] list-decimal pl-5 marker:text-muted">{pasos_.map((x, i) => <li key={i}>{x}</li>)}</ol>
            ) : <div className="text-muted-2 text-[13px] mt-2.5">sin tareas · 360 min libres</div>}
          </Tarjeta>
        )
      })}
    </div>
  )
}

// La noche ya está cerrada: pantalla de confirmación con la ruta enviada (no se puede cambiar)
function RutaEnviada({ enviado, etiqueta, pasos, ir }) {
  const k = enviado.kpis.esperado
  const miga = [{ texto: 'Planificación', onClick: () => ir('/opciones') }, { texto: `Noche del ${etiqueta.split(' · ')[0]}` }, { texto: 'Ruta enviada' }]
  const dato = (t, v) => <div><dt className="text-[13px] text-muted">{t}</dt><dd className="text-[22px] font-semibold mt-0.5">{v}</dd></div>
  return (
    <div className="pb-6">
      <Cabecera titulo="Ruta enviada" etiqueta={etiqueta} pasos={pasos} miga={miga}
        extra={<span className="bg-white/15 text-white rounded-full px-3.5 py-1.5 text-[13px] font-semibold">{enviado.etiqueta}</span>} />
      <section className="rounded-2xl border border-border bg-white px-10 py-12 mb-6 flex items-center gap-8" role="status">
        <span className="w-24 h-24 rounded-full bg-cta text-white flex items-center justify-center shrink-0" aria-hidden="true"><IconOk size={54} strokeWidth={2.4} /></span>
        <div>
          <h2 className="text-[48px] font-bold leading-[1.05] tracking-[-0.02em]">La ruta ha sido enviada al equipo</h2>
          <p className="mt-3 text-[18px] text-muted">{enviado.etiqueta} · noche del {etiqueta.split(' · ')[0]} · enviada a las {horaDe(enviado.confirmado_el)} por {enviado.confirmado_por}. La ruta de esta noche ya no se puede cambiar.</p>
        </div>
      </section>
      <Tarjeta className="px-6 py-5 mb-6">
        <h2 className="text-[17px] font-bold mb-3">Resultado esperado de la ruta</h2>
        <dl className="grid grid-cols-4 gap-6">
          {dato('Beneficio 3 días', `${num(k.beneficio3)} USD`)}
          {dato('Coste de camiones', `${num(k.coste)} USD`)}
          {dato('Demanda atendida 3 días', `${num(k.demanda * 100, 1)} %`)}
          {dato('Viajes perdidos 3 días', num(k.perdidos))}
        </dl>
      </Tarjeta>
      <h2 className="text-[22px] font-bold mb-3">Hoja de ruta de cada camión</h2>
      <HojasDeRuta hoja={enviado.hoja_de_ruta} />
      <div className="mt-6"><Boton onClick={() => ir('/perfil')}>Ver las noches anteriores</Boton></div>
    </div>
  )
}

// Paso 4: Decidir. El jefe ve el resultado del plan elegido, su hoja de ruta por camión, el estado al terminar la noche y confirma.
export default function Decidir({ mapa, estado, etiqueta, pasos, ir, enviado, refrescarEnviado }) {
  const { s } = useSesion()
  const plan = s.elegido != null ? s.bandeja[s.elegido] : null
  const [R, setR] = useState(null)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [intento, setIntento] = useState(0)
  const clave = plan ? JSON.stringify(plan.ruta) : null

  const lento = useLento(cargando)
  useEffect(() => {
    if (!plan) return
    let vivo = true
    setError(null); setCargando(true)          // el resultado anterior queda atenuado mientras se recalcula
    postComparar([plan.ruta], s.limites).then((r) => { if (vivo) { setR(r); setCargando(false) } }).catch((e) => { if (vivo) { setError(e.message || "Error de red"); setCargando(false) } })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, intento])

  const miga = [{ texto: 'Planificación', onClick: () => ir('/opciones') }, { texto: `Noche del ${etiqueta.split(' · ')[0]}` }, { texto: 'Decidir' }]
  if (enviado) return <RutaEnviada enviado={enviado} etiqueta={etiqueta} pasos={pasos} ir={ir} />
  if (!plan) {
    return (
      <div>
        <Cabecera titulo="Plan elegido" etiqueta={etiqueta} pasos={pasos} miga={miga} />
        <Tarjeta className="p-10 text-center max-w-[640px] mt-8 mx-auto">
          <div className="text-[18px] font-semibold mb-1">Todavía no has elegido plan</div>
          <p className="text-muted mb-5">Elige uno de los planes de la bandeja en la pantalla Comparar.</p>
          <Boton variante="primario" onClick={() => ir('/comparar')}>Ir a Comparar</Boton>
        </Tarjeta>
      </div>
    )
  }
  if (error) return <div className="p-10" role="alert"><h1 className="text-2xl font-bold">{R ? "No se puede confirmar el plan" : "No se puede calcular el plan"}</h1><p className="mt-2 mb-4 text-muted">{error}</p><Boton variante="primario" onClick={() => { setError(null); if (!R) setIntento((n) => n + 1) }}>Reintentar</Boton></div>

  const nombre = nombrePlan(plan, s.elegido)
  const color = COLOR_PLAN[LETRAS[s.elegido]]
  const r = R?.rutas[0]
  const sinFlota = !estado.flota_de_hoy
  const confirmar = async () => {
    setEnviando(true)
    try {
      await postConfirmar(plan.ruta, nombre)
    } catch (e) { setError(e.message) } finally { setEnviando(false); refrescarEnviado() }   // si ya estaba enviada, se muestra
  }

  return (
    <div className="pb-6">
      <Cabecera titulo="Plan elegido" etiqueta={etiqueta} pasos={pasos} miga={miga}
        extra={<><span className="bg-white/15 text-white rounded-full px-3.5 py-1.5 text-[13px] font-semibold">{nombre}</span><Recalculando activo={lento} /></>} />

      {/* Barra de confirmación: debajo de la cabecera y encima del contenido */}
      <div className="bg-white border border-border rounded-2xl px-6 py-3 mb-4 flex items-center gap-4">
        <div className="mr-auto">
          <div className="font-semibold text-[15px]">Vas a ejecutar el {nombre} esta noche</div>
          <div className="text-[13px] text-muted">{sinFlota ? 'Aún no se puede enviar: falta que el administrador cargue la flota de esta noche.' : 'Al confirmar, la ruta se envía al equipo y la noche queda cerrada: ya no se podrá cambiar.'}</div>
        </div>
        <Boton onClick={() => ir('/comparar')}><IconAtras size={18} /> Volver a comparar</Boton>
        <Boton variante="primario" disabled={!R || enviando || sinFlota || r?.problemas.length > 0} onClick={confirmar}>{enviando ? 'Enviando…' : 'Confirmar y enviar'} <IconOk size={18} /></Boton>
      </div>
      {!R ? <div className="text-muted p-6" role="status">Calculando…</div> : (
        <div className={`grid gap-4 items-start ${cargando ? 'dim' : ''}`} aria-busy={cargando} style={{ gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
          <div>
            <h2 className="text-[22px] font-bold mb-3">Resultado frente a no hacer nada</h2>
            <Tarjeta className="px-4 py-3 mb-6">
              <table className="w-full text-[13px] border-collapse" aria-label="Resultado del plan frente a no hacer nada">
                <thead className="bg-surface">
                  <tr>
                    <th rowSpan={2} className="text-left font-semibold px-3 py-2 align-bottom">Indicador</th>
                    <th colSpan={3} className="text-center font-semibold px-3 pt-2">Escenario esperado</th>
                    <th colSpan={3} className="text-center font-semibold px-3 pt-2">Peor escenario</th>
                  </tr>
                  <tr className="text-[12px]">{['No hacer nada', nombre, 'Variación', 'No hacer nada', nombre, 'Variación'].map((h, i) => <th key={i} className="text-right font-semibold px-3 pb-2 whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {FILAS.map((f) => (
                    <tr key={f.nombre} className="border-b border-border">
                      <th scope="row" className="text-left px-3 py-2 font-semibold">{f.nombre}</th>
                      {['esperado', 'peor'].map((m) => {
                        const a = f.get(R.nada, m), b = f.get(r, m), dif = b - a
                        return (
                          <React.Fragment key={m}>
                            <td className="text-right px-3 text-muted whitespace-nowrap">{num(a, f.d)}{f.u ? ' ' + f.u : ''}</td>
                            <td className="text-right px-3 font-bold whitespace-nowrap">{num(b, f.d)}{f.u ? ' ' + f.u : ''}</td>
                            <td className={`text-right px-3 font-semibold whitespace-nowrap ${claseVar(f.met, dif)}`}>{sgn(dif, f.d)}{f.du ? ' ' + f.du : ''}</td>
                          </React.Fragment>
                        )
                      })}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="text-left px-3 py-2 font-semibold">Bajos sin cambiar / reserva</th>
                    <td className="text-right px-3 text-muted whitespace-nowrap">{num(R.nada.bajos_sin_cambiar)} / {num(R.nada.reserva_taller)}</td>
                    <td className="text-right px-3 font-bold whitespace-nowrap">{num(r.bajos_sin_cambiar)} / {num(r.reserva_taller)}</td>
                    <td className="text-right px-3 font-semibold whitespace-nowrap text-muted">{sgn(r.bajos_sin_cambiar - R.nada.bajos_sin_cambiar)} / {sgn(r.reserva_taller - R.nada.reserva_taller)}</td>
                    <td colSpan={3} className="text-left px-3 text-[12px] text-muted">No depende del escenario</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-[12px] text-muted mt-2">El día 1 sale peor porque los camiones cuestan dinero y todavía no se pierden viajes; el beneficio llega los días 2 y 3. El peor escenario es el de demanda más desfavorable.</p>
              {r.avisos.length > 0 && <p className="text-warning-ink text-[13px] font-medium mt-1">⚠ Incumple un límite: {r.avisos.join(' · ')}</p>}
              {r.problemas.length > 0 && <p role="alert" className="text-negative text-[13px] mt-1">{r.problemas.join(' · ')}</p>}
            </Tarjeta>

            <h2 className="text-[22px] font-bold mb-3">Hoja de ruta de cada camión</h2>
            <HojasDeRuta hoja={r.plan} />
          </div>

          <Tarjeta className="px-5 py-4">
            <h2 className="text-[17px] font-bold mb-3">Estado al terminar la noche</h2>
            <MinimapaPlan mapa={mapa} ruta={plan.ruta} color={color} className="w-full h-[300px]" />
            <table className="w-full text-[13px] mt-4 border-collapse">
              <thead className="bg-surface"><tr><th className="text-left font-semibold px-2.5 py-2">Zona</th><th className="text-right font-semibold px-2.5">Cargados</th><th className="text-right font-semibold px-2.5">Bajos</th></tr></thead>
              <tbody>
                {ZONAS.map((z) => (
                  <tr key={z} className="border-b border-border"><td className="px-2.5 py-2 font-semibold">{z}</td><td className="text-right px-2.5">{num(r.flota.zonas[z].cargados)}</td><td className="text-right px-2.5">{num(r.flota.zonas[z].bajos)}</td></tr>
                ))}
                <tr className="bg-surface font-bold"><td className="px-2.5 py-2">Taller</td><td className="text-right px-2.5">{num(r.flota.taller)}</td><td className="text-right px-2.5 text-muted">—</td></tr>
              </tbody>
            </table>
          </Tarjeta>
        </div>
      )}
    </div>
  )
}
