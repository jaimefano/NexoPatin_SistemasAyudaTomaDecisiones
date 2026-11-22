import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { RUTA_VACIA } from './utils.js'

// Estado global del jefe (apartado 4 del diseño). Se guarda en sessionStorage para no perderlo al recargar.
const CLAVE = 'satd-sesion-v2'
const INICIAL = {
  limites: { reserva_min: null, demanda_min: null, coste_max: null },
  bandeja: [null, null, null],          // huecos A, B, C: null | { origen: 'pool'|'propio', id, ruta }
  filtros: { q: '', rangos: {}, tareas: [] },
  orden: null,                          // { id, desc } | null (orden neutro por identificador)
  ejes: { x: 'coste', y: 'perdidos' },
  propio: { ruta: RUTA_VACIA, historial: [], hueco: null, partir: 'cero' },
  elegido: null,                        // índice del hueco del plan elegido en Comparar
  confirmado: null,                     // { etiqueta, confirmado_el }
  firma: null,                          // firma del estado de la flota (si cambia, se vacía todo)
}

function leer() {
  try { return { ...INICIAL, ...JSON.parse(sessionStorage.getItem(CLAVE)) } } catch { return INICIAL }
}

const Ctx = createContext(null)
export const useSesion = () => useContext(Ctx)

export function SesionProvider({ children }) {
  const [s, setS] = useState(leer)
  useEffect(() => { try { sessionStorage.setItem(CLAVE, JSON.stringify(s)) } catch { /* sin almacenamiento */ } }, [s])
  const set = useCallback((v) => setS((o) => ({ ...o, ...(typeof v === 'function' ? v(o) : v) })), [])

  // Bandeja: máximo 3 huecos; un plan solo puede estar una vez
  const enBandeja = useCallback((origen, id) => s.bandeja.findIndex((p) => p && p.origen === origen && p.id === id), [s.bandeja])
  // Si cambia la ruta del hueco elegido (o se vacía), ni la elección ni la confirmación siguen siendo válidas
  const sinElegido = (o, i) => (o.elegido === i ? { elegido: null, confirmado: null } : { elegido: o.elegido, confirmado: o.elegido == null ? null : o.confirmado })
  const alternar = useCallback((plan) => {
    const i = s.bandeja.findIndex((p) => p && p.origen === 'pool' && p.id === plan.id)
    if (i >= 0) {
      set((o) => ({ bandeja: o.bandeja.map((p, k) => (k === i ? null : p)), ...sinElegido(o, i) }))
      return { ok: true }
    }
    const libre = s.bandeja.findIndex((p) => !p)
    if (libre < 0) return { ok: false, msg: 'Ya tienes 3 planes. Quita uno para añadir otro.' }
    set((o) => ({ bandeja: o.bandeja.map((p, k) => (k === libre ? { origen: 'pool', id: plan.id, ruta: plan.ruta } : p)) }))
    return { ok: true }
  }, [s.bandeja, set])
  const quitar = useCallback((i) => set((o) => ({ bandeja: o.bandeja.map((p, k) => (k === i ? null : p)), ...sinElegido(o, i) })), [set])
  const guardarPropio = useCallback((hueco, ruta) => set((o) => ({
    bandeja: o.bandeja.map((p, k) => (k === hueco ? { origen: 'propio', id: 'propio', ruta } : p)),
    ...sinElegido(o, hueco), propio: { ruta: RUTA_VACIA, historial: [], hueco: null, partir: 'cero' },
  })), [set])
  // Conserva los límites; vacía bandeja, elección, confirmación y borrador
  const reiniciar = useCallback((firma) => setS((o) => ({ ...INICIAL, limites: o.limites, firma })), [])

  const v = useMemo(() => ({ s, set, alternar, quitar, guardarPropio, enBandeja, reiniciar }), [s, set, alternar, quitar, guardarPropio, enBandeja, reiniciar])
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>
}
