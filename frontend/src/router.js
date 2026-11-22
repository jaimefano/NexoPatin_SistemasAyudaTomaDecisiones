import { useCallback, useEffect, useState } from 'react'

// Router mínimo (sin dependencias): rutas del apartado 4 del diseño
export const RUTAS = ['/', '/acceso', '/opciones', '/plan-propio', '/comparar', '/decidir', '/limites', '/perfil']
const normaliza = (p) => (RUTAS.includes(p) ? p : '/opciones')

export function useRuta() {
  const [ruta, setRuta] = useState(() => normaliza(window.location.pathname))
  useEffect(() => {
    if (window.location.pathname !== ruta) window.history.replaceState({}, '', ruta)
    const f = () => setRuta(normaliza(window.location.pathname))
    window.addEventListener('popstate', f)
    return () => window.removeEventListener('popstate', f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const ir = useCallback((a) => {
    if (window.location.pathname !== a) window.history.pushState({}, '', a)
    setRuta(a)
    window.scrollTo(0, 0)
  }, [])
  return [ruta, ir]
}
