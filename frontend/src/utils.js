export const ZONAS = ['Centro', 'Norte-Centro', 'Norte', 'Oeste', 'Sur']
export const COLOR_CAMION = { 1: '#E8590C', 2: '#000000', 3: '#11A5A5', 4: '#7356BF' }

const nf = (d) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' })
export const num = (v, d = 0) => nf(d).format(v)
export const sgn = (v, d = 0) => {
  const r = Number(v.toFixed(d))
  if (r === 0) return '±' + nf(d).format(0)
  return (r > 0 ? '+' : '−') + nf(d).format(Math.abs(r))
}

// Definición de cada indicador: cómo se lee en la candidata (kpis / delta) y cómo se muestra.
// mejora: 'sube' | 'baja' | null (neutro)
export const METRICAS = {
  beneficio: { nombre: 'Beneficio 3 días', unidad: 'USD', d: 0, mejora: 'sube', abs: (k) => k.beneficio, var: (x) => x.beneficio },
  perdidos: { nombre: 'Viajes perdidos 3 días', unidad: '', d: 0, mejora: 'baja', abs: (k) => k.perdidos, var: (x) => x.perdidos },
  demanda: { nombre: 'Demanda atendida', unidad: '%', unidadVar: 'pp', d: 1, mejora: 'sube', abs: (k) => k.demanda_atendida * 100, var: (x) => x.demanda_atendida * 100 },
  coste: { nombre: 'Coste de camiones', unidad: 'USD', d: 0, mejora: 'baja', abs: (k) => k.coste, var: (x) => x.coste },
  bajos: { nombre: 'Bajos sin cambiar', unidad: '', d: 0, mejora: 'baja', abs: (k) => k.bajos_sin_cambiar, var: (x) => x.bajos_sin_cambiar },
  reserva: { nombre: 'Reserva taller', unidad: '', d: 0, mejora: 'sube', abs: (k) => k.reserva, var: (x) => x.reserva },
  tiempo: { nombre: 'Tiempo libre del camión', unidad: 'min', d: 0, mejora: null, abs: (k, c) => c.tiempo_libre, var: (x, c) => c.tiempo_libre },
}

export function claseVar(metrica, v) {
  const m = METRICAS[metrica]
  const r = Number(v.toFixed(m.d))
  if (!m.mejora || r === 0) return 'text-muted'
  const bien = m.mejora === 'sube' ? r > 0 : r < 0
  return bien ? 'text-positive' : 'text-negative'
}

export const textoVar = (metrica, v) => {
  const m = METRICAS[metrica]
  return sgn(v, m.d) + (m.unidadVar ? ' ' + m.unidadVar : m.unidad ? ' ' + m.unidad : '')
}

export function textoTarea(t) {
  return t[0] === 'CAMBIO' ? `Cambio en ${t[1]}` : `Reubicar ${t[3]} de ${t[1]} a ${t[2]}`
}
export const detalleTarea = (t) => (t[0] === 'CAMBIO' ? `repone ${t[2]} · recoge ${t[3]}` : null)
export const zonaDeTarea = (t) => t[1]
export const claveTarea = (c, t) => `${c}|${t.join('|')}`

export function aRutaApi(ruta) {
  const o = {}
  for (const c of Object.keys(ruta)) o[c] = ruta[c]
  return o
}

// Efecto de una tarea sobre el estado de las zonas: { zona: {cargados:+n, bajos:-n} }
export function efectoTarea(t) {
  const e = {}
  if (!t) return e
  if (t[0] === 'CAMBIO') e[t[1]] = { cargados: t[2], bajos: -t[3] }
  else {
    e[t[1]] = { cargados: -t[3], bajos: 0 }
    e[t[2]] = { cargados: t[3], bajos: 0 }
  }
  return e
}

// ---------------- Planes completos (flujo v2) ----------------
export const LETRAS = ['A', 'B', 'C']
export const COLOR_PLAN = { A: '#6F4FA8', B: '#A35F17', C: '#B03A78' }   // violeta, bronce, frambuesa
// Color de la letra sobre el color del plan (la C es clara: letra negra)
export const TEXTO_PLAN = { A: '#FFFFFF', B: '#FFFFFF', C: '#FFFFFF' }
// nombrePlan(p, indice): con el índice del hueco, los planes propios son "Plan propio A/B/C"
export const nombrePlan = (p, indice) => (p.origen === 'propio' ? (indice != null && LETRAS[indice] ? `Plan propio ${LETRAS[indice]}` : 'Plan propio') : `Plan ${p.id}`)
export const RUTA_VACIA = { 1: [], 2: [], 3: [], 4: [] }
// Tareas de una ruta (todas las de todos los camiones)
export const tareasDe = (ruta) => Object.keys(ruta).sort().flatMap((c) => ruta[c])
export const nTareasRuta = (ruta) => tareasDe(ruta).length
export const textoTareaCorto = (t) => (t[0] === 'CAMBIO' ? `Cambio en ${t[1]} (${t[2]}/${t[3]})` : `Reubicar ${t[3]} de ${t[1]} a ${t[2]}`)

export const resumenTarea = (t) => (t[0] === 'CAMBIO' ? `Cambio ${t[1]}` : `Reubicar ${t[1]}→${t[2]}`)
export const resumenRuta = (ruta) => tareasDe(ruta).map(resumenTarea)
// Texto de un valor absoluto de una métrica ("10.990 USD", "92,0 %", "171")
export const textoAbs = (m, v) => `${num(v, METRICAS[m].d)}${METRICAS[m].unidad ? ' ' + METRICAS[m].unidad : ''}`

// Pasos en texto de la hoja de ruta de un camión (apartado 5.4 del diseño)
export function pasosTarea(t) {
  if (t[0] === 'CAMBIO') {
    const [, z, rep, rec] = t
    return [`Taller: cargar ${rep} patinetes cargados.`, `${z}: dejar ${rep} cargados y recoger ${rec} bajos.`, `Taller: descargar los ${rec} bajos.`]
  }
  const [, o, w, mov] = t
  return [`Ir a ${o} y cargar ${mov} patinetes cargados.`, `Llevarlos a ${w} y descargarlos. El camión queda libre en ${w}.`]
}

// Patinetes cargados que quedan en cada zona al acabar la noche con esta ruta ({zona: n}); base = estado.cargados
export function cargadosFinales(base, ruta) {
  const o = { ...base }
  for (const t of tareasDe(ruta || {})) {
    const e = efectoTarea(t)
    for (const z in e) o[z] = (o[z] ?? 0) + e[z].cargados
  }
  return o
}
