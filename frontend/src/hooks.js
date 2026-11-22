import { useEffect, useRef, useState } from 'react'
import { postEvaluar } from './api.js'

// Evalúa UNA tarea (con debounce ~100 ms). Mientras calcula conserva el resultado anterior (valores atenuados).
export function useEvaluacion({ ruta, limites, camion, tarea, comparar, activo }) {
  const [ev, setEv] = useState(null)
  const [cargando, setCargando] = useState(false)
  const n = useRef(0)
  const clave = JSON.stringify([ruta, limites, camion, tarea, comparar, activo])
  useEffect(() => {
    if (!activo || !tarea) { setEv(null); setCargando(false); return }
    const mio = ++n.current
    setCargando(true)
    const h = setTimeout(() => {
      postEvaluar({ ruta, limites, camion, tarea, comparar })
        .then((r) => { if (mio === n.current) { setEv((prev) => (comparar && !r.destinos ? { ...r, destinos: prev?.destinos } : r)); setCargando(false) } })
        .catch(() => mio === n.current && setCargando(false))
    }, 100)
    return () => clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return { ev, cargando }
}
