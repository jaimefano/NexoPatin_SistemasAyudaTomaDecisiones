// Páginas que se ven sin sesión: en ellas un 401 no redirige
const PUBLICAS = ['/', '/acceso']

async function llamar(url, cuerpo) {
  let r
  try {
    r = await fetch(url, cuerpo === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    })
  } catch {
    throw new Error('No se puede conectar con el servidor. Comprueba tu conexión y vuelve a intentarlo.')
  }
  // Sesión caducada o sin iniciar: a la pantalla de acceso (el login fallido sí devuelve su mensaje)
  if (r.status === 401 && url !== '/api/login' && !PUBLICAS.includes(window.location.pathname)) {
    window.location.assign('/acceso')
    return new Promise(() => {})
  }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'El servidor no ha podido completar la operación. Vuelve a intentarlo.')
  return r.json()
}

export const postLogin = (usuario, clave) => llamar('/api/login', { usuario, clave })
export const postRegistro = (nombre, correo, clave) => llamar('/api/registro', { nombre, correo, clave })
export const postLogout = () => llamar('/api/logout', {})
export const getYo = () => llamar('/api/yo')
export const getEstado = () => llamar('/api/estado')
export const getMapa = () => llamar('/api/mapa')
export const postCandidatas = (ruta, limites) => llamar('/api/candidatas', { ruta, limites })
export const postEvaluar = (cuerpo) => llamar('/api/evaluar', cuerpo)
export const postResultado = (ruta) => llamar('/api/resultado', { ruta })
export const postAdminEstado = (cuerpo) => llamar('/api/admin/estado', cuerpo)
export const postPlanes = (limites) => llamar('/api/planes', { limites })
export const postComparar = (rutas, limites) => llamar('/api/comparar', { rutas, limites })
export const postKpisRutas = (rutas) => llamar('/api/kpis_rutas', { rutas })
export const postConfirmar = (ruta, etiqueta) => llamar('/api/confirmar', { ruta, etiqueta })
export const getConfirmado = () => llamar('/api/confirmado')
export const getHistorial = () => llamar('/api/historial')
export const getDemandaHoraria = () => llamar('/api/demanda_horaria')

// Cierra la sesión en el servidor y vuelve a la portada
export async function salir() {
  try { await postLogout() } catch { /* aunque falle, se sale */ }
  window.location.assign('/')
}
