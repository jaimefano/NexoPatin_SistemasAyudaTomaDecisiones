import React, { useId, useMemo } from 'react'
import { ZONAS, COLOR_CAMION, efectoTarea, num } from '../utils.js'

// Mapas con el estilo de una capa de transporte: base clara con la trama de calles de Chicago y el lago,
// las zonas y el taller como estaciones, y las tareas de cada camión como líneas de color que van por la cuadrícula.

const W = 880, H = 800, PAD = 24

// Posición de cada tarjeta respecto a su punto (px del viewBox)
const OFFSET = {
  Norte: [50, -30], 'Norte-Centro': [48, -34], Oeste: [-250, -20], Centro: [50, 6], Sur: [36, -30], Taller: [-225, 12],
}
const LW = 196

// Paleta del mapa (neutros cálidos; el agua, apagada)
const C = {
  suburbio: '#E7E5E0', ciudad: '#EEECE7', sinServicio: '#E2DFD9', calle: '#FFFFFF', bordeCalle: '#D6D2CA',
  agua: '#D7E1E3', textoAgua: '#7B9296', limite: '#ABA59C', estacion: '#2A2A2A', texto: '#2F2C29',
}

// Cuadrícula de Chicago: el 0 este-oeste es State St y el 0 norte-sur, Madison St; hay una avenida principal cada milla.
const STATE = -87.6278, MADISON = 41.8820
const MILLA_LAT = 1 / 69.05, MILLA_LON = 1 / (69.17 * Math.cos((41.88 * Math.PI) / 180))
// Avenidas en diagonal principales (trazado aproximado, solo como textura del mapa)
const DIAGONALES = [
  [[-87.645, 41.8857], [-87.687, 41.9105], [-87.73, 41.9465], [-87.788, 41.993]],    // Milwaukee
  [[-87.66, 41.9], [-87.71, 41.94], [-87.755, 41.976]],                                 // Elston
  [[-87.634, 41.912], [-87.68, 41.953], [-87.714, 41.983]],                             // Lincoln
  [[-87.631, 41.89], [-87.638, 41.925], [-87.668, 41.97], [-87.675, 42.01]],            // Clark
  [[-87.656, 41.889], [-87.69, 41.865], [-87.73, 41.846]],                              // Ogden
  [[-87.634, 41.856], [-87.675, 41.835], [-87.74, 41.795]],                             // Archer
  [[-87.615, 41.82], [-87.62, 41.77], [-87.64, 41.73], [-87.646, 41.695]],              // Vincennes / South Chicago
]

const f1 = (v) => v.toFixed(1)
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])

function useProyeccion(geojson, puntos) {
  return useMemo(() => {
    if (!geojson) return null
    const feats = geojson.features
    let minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9
    const anillos = (g) => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]).flat()
    feats.forEach((f) => anillos(f.geometry).forEach((r) => r.forEach(([lon, lat]) => {
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
    })))
    const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180)
    const ancho = (maxLon - minLon) * k, alto = maxLat - minLat
    const esc = Math.min((W - 2 * PAD) / ancho, (H - 2 * PAD) / alto)
    const ox = (W - ancho * esc) / 2, oy = (H - alto * esc) / 2
    const proj = (lon, lat) => [ox + (lon - minLon) * k * esc, oy + (maxLat - lat) * esc]

    // Barrios (con su zona) y la silueta de la ciudad
    const FILA = 4, filas = Math.ceil(H / FILA) + 1, costa = new Array(filas).fill(-Infinity)
    const caminos = feats.map((f) => {
      let d = ''
      anillos(f.geometry).forEach((ring) => {
        let prev = null
        ring.forEach(([lon, lat], i) => {
          const p = proj(lon, lat)
          d += (i ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1])
          if (prev) {   // borde del lago: el punto más al este de la ciudad en cada fila
            const [ax, ay] = prev, [bx, by] = p
            for (let r = Math.ceil(Math.min(ay, by) / FILA); r * FILA <= Math.max(ay, by); r++) {
              const x = ay === by ? Math.max(ax, bx) : ax + ((bx - ax) * (r * FILA - ay)) / (by - ay)
              if (x > costa[r]) costa[r] = x
            }
          }
          prev = p
        })
        d += 'Z'
      })
      return { d, zona: f.properties.zona, area: f.properties.area }
    })
    // Lago Michigan: al este de la costa (por encima y por debajo de la ciudad se prolonga la orilla)
    const validas = costa.map((x, r) => (Number.isFinite(x) ? r : -1)).filter((r) => r >= 0)
    const r0 = validas[0], r1 = validas[validas.length - 1]
    let lago = `M${W + 2000} -2000L${f1(costa[r0] + 2)} -2000`
    for (let r = r0; r <= r1; r++) if (Number.isFinite(costa[r])) lago += `L${f1(costa[r] + 1)} ${r * FILA}`
    lago += `L${f1(costa[r1] + 300)} ${H + 2000}L${W + 2000} ${H + 2000}Z`

    // Trama de calles: avenidas cada milla, calles cada media y cada cuarto de milla, y las diagonales
    const lon0 = minLon - 0.7, lon1 = maxLon + 0.7, lat0 = minLat - 0.3, lat1 = maxLat + 0.3   // de sobra: el recuadro puede ser más ancho que el mapa
    const lineas = (fr, excluir) => {
      let d = ''
      const salta = (v) => excluir && Math.abs(v / excluir - Math.round(v / excluir)) < 1e-6
      for (let i = Math.ceil((lon0 - STATE) / (MILLA_LON * fr)); STATE + i * MILLA_LON * fr <= lon1; i++) {
        if (salta(i * fr)) continue
        const a = proj(STATE + i * MILLA_LON * fr, lat1), b = proj(STATE + i * MILLA_LON * fr, lat0)
        d += `M${f1(a[0])} ${f1(a[1])}V${f1(b[1])}`
      }
      for (let j = Math.ceil((lat0 - MADISON) / (MILLA_LAT * fr)); MADISON + j * MILLA_LAT * fr <= lat1; j++) {
        if (salta(j * fr)) continue
        const a = proj(lon0, MADISON + j * MILLA_LAT * fr), b = proj(lon1, MADISON + j * MILLA_LAT * fr)
        d += `M${f1(a[0])} ${f1(a[1])}H${f1(b[0])}`
      }
      return d
    }
    const diagonales = DIAGONALES.map((l) => l.map(([lon, lat], i) => { const p = proj(lon, lat); return (i ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1]) }).join('')).join('')
    const calles = { mayores: lineas(1) + diagonales, medias: lineas(0.5, 1), menores: lineas(0.25, 0.5) }

    const pts = {}
    Object.entries(puntos).forEach(([n, p]) => { pts[n] = proj(p.lon, p.lat) })
    return { caminos, pts, lago, calles, ciudad: caminos.map((c) => c.d).join(''), caja: { x: ox, y: oy, w: ancho * esc, h: alto * esc } }
  }, [geojson, puntos])
}

// Base del mapa: alrededores, ciudad, calles y lago. 'detalle' añade las calles menores y bordes más marcados.
function MapaBase({ P, detalle = false, grosor = 1 }) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      <rect x={-2000} y={-2000} width={W + 4000} height={H + 4000} fill={C.suburbio} />
      <path d={P.ciudad} fill={C.ciudad} stroke={C.ciudad} strokeWidth="1.5" />
      <g fill="none" stroke={C.calle} strokeLinecap="round" strokeLinejoin="round">
        {detalle && <path d={P.calles.menores} strokeWidth={1.1 * grosor} opacity=".75" />}
        <path d={P.calles.medias} strokeWidth={(detalle ? 2.2 : 1.8) * grosor} />
        <path d={P.calles.mayores} stroke={C.bordeCalle} strokeWidth={(detalle ? 5.6 : 5) * grosor} />
        <path d={P.calles.mayores} strokeWidth={(detalle ? 3.6 : 3.2) * grosor} />
      </g>
      <path d={P.lago} fill={C.agua} />
    </g>
  )
}

// Contorno exterior de cada zona (sin las líneas entre sus barrios): el trazo se enmascara con la propia zona
function Contornos({ P, uid, sel, grosor = 1 }) {
  const zonas = [...ZONAS, 'Sin servicio']
  return (
    <g pointerEvents="none">
      <defs>
        {zonas.map((z, i) => (
          <mask key={z} id={`${uid}-zm${i}`} maskUnits="userSpaceOnUse" x={-2000} y={-2000} width={W + 4000} height={H + 4000}>
            <rect x={-2000} y={-2000} width={W + 4000} height={H + 4000} fill="#fff" />
            <g fill="#000">{P.caminos.filter((c) => c.zona === z).map((c, j) => <path key={j} d={c.d} fillRule="evenodd" />)}</g>
          </mask>
        ))}
      </defs>
      {zonas.map((z, i) => (
        <g key={z} mask={`url(#${uid}-zm${i})`} fill="none" stroke={sel === z ? '#000' : C.limite} strokeWidth={(sel === z ? 6 : 3) * grosor} strokeLinejoin="round" opacity={z === 'Sin servicio' ? 0.5 : 1}>
          {P.caminos.filter((c) => c.zona === z).map((c, j) => <path key={j} d={c.d} fillRule="evenodd" />)}
        </g>
      ))}
    </g>
  )
}

// Relleno de las zonas (capas de calor y comparación): cada zona como una sola mancha translúcida
function RellenoZonas({ P, color, alfa = () => 1 }) {
  return (
    <g pointerEvents="none">
      {[...ZONAS, 'Sin servicio'].map((z) => {
        const c = color(z)
        if (!c) return null
        return (
          <g key={z} opacity={alfa(z)} fill={c} stroke={c} strokeWidth="1" strokeLinejoin="round">
            {P.caminos.filter((k) => k.zona === z).map((k, j) => <path key={j} d={k.d} fillRule="evenodd" />)}
          </g>
        )
      })}
    </g>
  )
}

// Estaciones: las zonas (círculo) y el taller (cuadrado)
function Estaciones({ P, r = 9, borde = 4 }) {
  const t = P.pts.Taller
  return (
    <g pointerEvents="none">
      {ZONAS.map((z) => <circle key={z} cx={P.pts[z][0]} cy={P.pts[z][1]} r={r} fill="#fff" stroke={C.estacion} strokeWidth={borde} />)}
      <rect x={t[0] - r * 1.45} y={t[1] - r * 1.45} width={r * 2.9} height={r * 2.9} rx={r * 0.55} fill={C.estacion} />
      <rect x={t[0] - r * 0.7} y={t[1] - r * 0.7} width={r * 1.4} height={r * 1.4} rx={r * 0.25} fill="#fff" />
    </g>
  )
}

// ---------- Red de vías y líneas de las rutas ----------
// Red fija entre los puntos (grafo de Gabriel: une dos puntos si ningún otro cae en el círculo que los tiene por diámetro)
function construirRed(pts) {
  const nom = [...ZONAS, 'Taller'].filter((n) => pts[n])
  const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
  const red = []
  for (let i = 0; i < nom.length; i++) for (let j = i + 1; j < nom.length; j++) {
    const a = pts[nom[i]], b = pts[nom[j]]
    if (nom.every((k) => k === nom[i] || k === nom[j] || d2(a, pts[k]) + d2(b, pts[k]) >= d2(a, b))) red.push([nom[i], nom[j]])
  }
  return red
}

// Camino más corto por la red de un punto a otro
function caminoPorRed(red, pts, o, d) {
  const ady = {}
  red.forEach(([a, b]) => { (ady[a] = ady[a] || []).push([b, dist(pts[a], pts[b])]); (ady[b] = ady[b] || []).push([a, dist(pts[a], pts[b])]) })
  const dd = { [o]: 0 }, prev = {}, hechos = new Set()
  for (;;) {
    let u = null
    Object.keys(dd).forEach((n) => { if (!hechos.has(n) && (u === null || dd[n] < dd[u])) u = n })
    if (u === null || u === d) break
    hechos.add(u)
    ;(ady[u] || []).forEach(([v, l]) => { if (dd[v] === undefined || dd[u] + l < dd[v]) { dd[v] = dd[u] + l; prev[v] = u } })
  }
  if (o === d || dd[d] === undefined) return [o, d]
  const cam = [d]
  while (cam[0] !== o) cam.unshift(prev[cam[0]])
  return cam
}

// Trazado de una vía siguiendo la cuadrícula: en L, con el codo hacia el oeste (lejos del lago)
function geometriaVia(a, b) {
  const c = a[0] <= b[0] ? [a[0], b[1]] : [b[0], a[1]]
  return dist(a, c) < 2 || dist(c, b) < 2 ? [a, b] : [a, c, b]
}

// Desplaza una polilínea en paralelo (carril) una distancia 'off' a su izquierda
function desplazar(pl, off) {
  if (!off) return pl.map((p) => [...p])
  const n = []
  for (let i = 0; i + 1 < pl.length; i++) { const l = dist(pl[i], pl[i + 1]) || 1; n.push([-(pl[i + 1][1] - pl[i][1]) / l, (pl[i + 1][0] - pl[i][0]) / l]) }
  return pl.map((p, i) => {
    if (i === 0) return [p[0] + n[0][0] * off, p[1] + n[0][1] * off]
    if (i === pl.length - 1) { const m = n[n.length - 1]; return [p[0] + m[0] * off, p[1] + m[1] * off] }
    const a = n[i - 1], b = n[i], s = 1 + a[0] * b[0] + a[1] * b[1]
    return [p[0] + ((a[0] + b[0]) / s) * off, p[1] + ((a[1] + b[1]) / s) * off]
  })
}

// Lleva cada ruta por la red y reparte en carriles paralelos las que comparten vía. Devuelve la polilínea de cada ruta.
function trazarLineas(tramos, pts, red) {
  const caminos = tramos.map((t) => caminoPorRed(red, pts, t.o, t.d))
  const clave = (a, b) => (a < b ? a + '|' + b : b + '|' + a)
  const usos = {}
  caminos.forEach((c, i) => { for (let j = 0; j + 1 < c.length; j++) { const k = clave(c[j], c[j + 1]); (usos[k] = usos[k] || []).push(i) } })
  return caminos.map((c, i) => {
    const pl = []
    for (let j = 0; j + 1 < c.length; j++) {
      if (c[j] === c[j + 1]) continue
      const [n0, n1] = c[j] < c[j + 1] ? [c[j], c[j + 1]] : [c[j + 1], c[j]]   // orientación fija por vía: los carriles coinciden en ambos sentidos
      const lista = usos[clave(c[j], c[j + 1])]
      const gap = Math.max(...lista.map((t) => tramos[t].w)) * 1.45
      const off = (lista.indexOf(i) - (lista.length - 1) / 2) * gap
      let g = desplazar(geometriaVia(pts[n0], pts[n1]), off)
      if (n0 !== c[j]) g = g.reverse()
      g.forEach((p) => { if (!pl.length || dist(pl[pl.length - 1], p) > 0.5) pl.push(p) })
    }
    return pl
  })
}

// Recorta los extremos (para que la línea nazca y termine en el borde de las estaciones)
function recortar(pl, ini, fin) {
  if (pl.length < 2) return pl
  const out = pl.map((p) => [...p])
  const mueve = (p, q, d) => { const l = dist(p, q); return l > d + 1 ? [p[0] + ((q[0] - p[0]) * d) / l, p[1] + ((q[1] - p[1]) * d) / l] : p }
  out[0] = mueve(out[0], out[1], ini)
  out[out.length - 1] = mueve(out[out.length - 1], out[out.length - 2], fin)
  return out
}

// Trazo con las esquinas redondeadas
function trazoSuave(pl, r) {
  let d = `M${f1(pl[0][0])} ${f1(pl[0][1])}`
  for (let i = 1; i + 1 < pl.length; i++) {
    const p = pl[i - 1], q = pl[i], s = pl[i + 1], l1 = dist(p, q) || 1, l2 = dist(q, s) || 1, rr = Math.min(r, l1 / 2, l2 / 2)
    const a = [q[0] + ((p[0] - q[0]) * rr) / l1, q[1] + ((p[1] - q[1]) * rr) / l1], b = [q[0] + ((s[0] - q[0]) * rr) / l2, q[1] + ((s[1] - q[1]) * rr) / l2]
    d += `L${f1(a[0])} ${f1(a[1])}Q${f1(q[0])} ${f1(q[1])} ${f1(b[0])} ${f1(b[1])}`
  }
  return d + `L${f1(pl[pl.length - 1][0])} ${f1(pl[pl.length - 1][1])}`
}

// Una línea de ruta: borde blanco, color, flecha al final y la insignia (número de camión o cantidad) en su tramo más largo
// Sitio de la insignia de cada línea: a lo largo de su recorrido (mejor en tramos largos), sin tapar otras insignias ni estaciones
function colocarInsignias(pls, tam, estaciones) {
  const puestas = []
  return pls.map((pl) => {
    if (!pl || pl.length < 2) return null
    let mejor = null
    for (let i = 0; i + 1 < pl.length; i++) {
      const L = dist(pl[i], pl[i + 1])
      ;[0.5, 0.32, 0.68, 0.18, 0.82].forEach((t, k) => {
        const p = [pl[i][0] + (pl[i + 1][0] - pl[i][0]) * t, pl[i][1] + (pl[i + 1][1] - pl[i][1]) * t]
        let coste = k * 0.6 - L / tam
        puestas.forEach((q) => { const d = dist(p, q); if (d < tam * 1.5) coste += (tam * 1.5 - d) * 2 })
        estaciones.forEach((q) => { const d = dist(p, q); if (d < tam * 1.7) coste += (tam * 1.7 - d) * 1.5 })
        if (!mejor || coste < mejor.coste) mejor = { p, coste }
      })
    }
    puestas.push(mejor.p)
    return mejor.p
  })
}

function LineaRuta({ pl, color, ancho, discontinua, insignia, insigniaClara, tam, r = 14, posInsignia }) {
  if (!pl || pl.length < 2) return null
  const L = ancho * 2.5
  const n = pl.length, u = [pl[n - 1][0] - pl[n - 2][0], pl[n - 1][1] - pl[n - 2][1]], lu = Math.hypot(u[0], u[1]) || 1
  const ux = u[0] / lu, uy = u[1] / lu
  const T = pl[n - 1], cuerpo = pl.map((p) => [...p])
  cuerpo[n - 1] = [T[0] - ux * L * 0.55, T[1] - uy * L * 0.55]
  const ang = Math.atan2(uy, ux)
  const pt = (da) => `${f1(T[0] + L * Math.cos(ang + Math.PI - da))},${f1(T[1] + L * Math.sin(ang + Math.PI - da))}`
  const d = trazoSuave(cuerpo, r)
  // insignia: donde la haya colocado colocarInsignias o, si no, en el centro del tramo más largo
  let mejor = 0
  for (let i = 1; i + 1 < n; i++) if (dist(pl[i], pl[i + 1]) > dist(pl[mejor], pl[mejor + 1])) mejor = i
  const [mx, my] = posInsignia || [(pl[mejor][0] + pl[mejor + 1][0]) / 2, (pl[mejor][1] + pl[mejor + 1][1]) / 2]
  const texto = insignia != null ? String(insignia) : null
  const bw = texto ? Math.max(tam, tam * 0.62 * texto.length + tam * 0.45) : 0
  return (
    <g>
      <path d={d} fill="none" stroke="#fff" strokeWidth={ancho * 1.7} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={ancho} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={discontinua ? `${ancho * 1.6} ${ancho * 1.2}` : undefined} />
      <polygon points={`${f1(T[0])},${f1(T[1])} ${pt(0.42)} ${pt(-0.42)}`} fill={color} stroke="#fff" strokeWidth={ancho * 0.35} strokeLinejoin="round" paintOrder="stroke" />
      {texto && (
        <g>
          <rect x={mx - bw / 2} y={my - tam / 2} width={bw} height={tam} rx={tam * 0.22} fill={insigniaClara ? '#fff' : color} stroke={insigniaClara ? color : '#fff'} strokeWidth={tam * (insigniaClara ? 0.11 : 0.1)} />
          <text x={mx} y={my + tam * 0.33} textAnchor="middle" fontSize={tam * 0.68} fontWeight="800" fill={insigniaClara ? '#000' : '#fff'}>{texto}</text>
        </g>
      )}
    </g>
  )
}

// Mapa de calor cálido (amarillo claro → naranja → rojo) para t entre 0 y 1
function calido(t) {
  const P = [[251, 240, 214], [236, 192, 128], [196, 90, 76]]
  const x = Math.min(Math.max(t, 0), 1) * 2, i = Math.min(Math.floor(x), 1), k = x - i
  return `rgb(${P[i].map((v, j) => Math.round(v + (P[i + 1][j] - v) * k)).join(',')})`
}

const origenDe = (t) => (t[0] === 'CAMBIO' ? 'Taller' : t[1])
const destinoDe = (t) => (t[0] === 'CAMBIO' ? t[1] : t[2])

export default function MapView({ mapa, flota, preview, efectos, efectoTaller, ruta, capa, setCapa, demandaZona, perdidosZona, zonaSel, onZona, interactivo = true, mini = false, progresoCss = false, altura = 800 }) {
  const P = useProyeccion(mapa?.geojson, mapa?.puntos)
  const uid = useId().replace(/:/g, '')
  const red = useMemo(() => (P ? construirRed(P.pts) : []), [P])
  if (!P || !flota) return <div className="rounded-2xl bg-accent-bg" style={{ height: altura }} />
  const efecto = efectos || (preview ? efectoTarea(preview.tarea) : {})
  const efTaller = efectoTaller !== undefined ? efectoTaller : preview && preview.tarea[0] === 'CAMBIO' ? -preview.tarea[2] : 0
  const maxDem = Math.max(...demandaZona), maxPer = Math.max(...perdidosZona, 1)
  const idx = (z) => ZONAS.indexOf(z)

  // Capas de calor: la zona se tiñe sobre las calles (translúcida); en 'Estado de la flota' solo se marca la seleccionada
  const colorZona = (z) => {
    if (z === 'Sin servicio') return C.sinServicio
    if (capa === 'Demanda esperada') return '#000000'
    if (capa === 'Viajes perdidos') return calido(perdidosZona[idx(z)] / maxPer)
    return z === zonaSel ? '#000000' : null
  }
  const alfaZona = (z) => (z === 'Sin servicio' ? 0.85 : capa === 'Demanda esperada' ? 0.06 + 0.42 * (demandaZona[idx(z)] / maxDem) : capa === 'Viajes perdidos' ? 0.78 : 0.07)

  const segmentos = []
  Object.entries(ruta || {}).forEach(([c, ts]) => ts.forEach((t) => segmentos.push({ c, t, disc: false })))
  if (preview) segmentos.push({ c: preview.camion, t: preview.tarea, disc: true })
  const lineas = trazarLineas(segmentos.map((s) => ({ o: origenDe(s.t), d: destinoDe(s.t), w: 7 })), P.pts, red)
    .map((pl, i) => recortar(pl, origenDe(segmentos[i].t) === 'Taller' ? 18 : 13, 14))
  const posIns = colocarInsignias(lineas, 22, Object.values(P.pts))

  const etiqueta = (nombre) => {
    const [px, py] = P.pts[nombre]
    const [dx, dy] = OFFSET[nombre]
    const x = Math.min(Math.max(px + dx, 8), W - LW - 8)
    const taller = nombre === 'Taller'
    const f = taller ? { cargados: flota.taller, bajos: 0 } : flota.zonas[nombre]
    const ef = taller ? (efTaller ? { cargados: efTaller } : null) : efecto[nombre]
    const sel = zonaSel === nombre
    const tieneVista = capa === 'Estado de la flota' && !!ef && !!(ef.cargados || ef.bajos)
    const h = taller ? (tieneVista ? 62 : 38) : capa === 'Estado de la flota' ? (tieneVista ? 106 : 56) : 46
    const y = Math.min(Math.max(py + dy, 56), H - h - 8)
    const total = f.cargados + f.bajos
    const pc = total ? f.cargados / total : 1
    return (
      <g key={nombre} transform={`translate(${x} ${y})`} role={interactivo && !taller ? 'button' : undefined}
        tabIndex={interactivo && !taller ? 0 : undefined} aria-label={`Zona ${nombre}`}
        onClick={interactivo && !taller ? (e) => { e.stopPropagation(); onZona(nombre) } : undefined}
        onKeyDown={interactivo && !taller ? (e) => (e.key === 'Enter' || e.key === ' ') && onZona(nombre) : undefined}
        style={{ cursor: interactivo && !taller ? 'pointer' : 'default', outline: 'none' }}>
        <rect width={LW} height={h} rx="10" fill="#fff" stroke={sel ? '#000000' : 'none'} strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.14))' }} />
        <text x={taller ? LW - 12 : 12} y="20" fontSize="13" fontWeight="700" textAnchor={taller ? 'end' : 'start'}>{nombre}</text>
        {taller ? (
          <>
            <text x={LW - 12} y="38" fontSize="12.5" fontWeight="600" textAnchor="end">
              <tspan fill="#048848">● </tspan>{num(f.cargados)} cargados en reserva
            </text>
            {tieneVista && <text x={LW - 12} y="56" fontSize="12" fontWeight="600" textAnchor="end" fill="#0A6B6B">cargados {num(f.cargados)} → {num(f.cargados + ef.cargados)}</text>}
          </>
        ) : capa === 'Estado de la flota' ? (
          <>
            <text x="12" y="38" fontSize="12.5" fontWeight="600">
              <tspan fill="#048848">● </tspan>{num(f.cargados)} cargados
              <tspan dx="12" fill="#FFC043">● </tspan>{num(f.bajos)} bajos
            </text>
            <rect x="12" y="46" width={LW - 24} height="4" rx="2" fill="#FFC043" />
            <rect x="12" y="46" width={(LW - 24) * pc} height="4" rx="2" fill="#048848" />
            {tieneVista && (
              <>
                <line x1="12" x2={LW - 12} y1="60" y2="60" stroke="#CBCBCB" strokeDasharray="3 3" />
                <text x="12" y="78" fontSize="12" fontWeight="600" fill="#0A6B6B">cargados {num(f.cargados)} → {num(f.cargados + (ef.cargados || 0))}</text>
                <text x="12" y="94" fontSize="12" fontWeight="600" fill="#0A6B6B">bajos {num(f.bajos)} → {num(f.bajos + (ef.bajos || 0))}</text>
              </>
            )}
          </>
        ) : capa === 'Demanda esperada' ? (
          <text x="12" y="38" fontSize="12.5" fontWeight="600">≈ {num(demandaZona[idx(nombre)])} viajes/día</text>
        ) : (
          <text x="12" y="38" fontSize="12.5" fontWeight="600">{num(perdidosZona[idx(nombre)], 1)} viajes perdidos (3 días)</text>
        )}
      </g>
    )
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border" style={{ height: altura, background: C.suburbio }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de las zonas de servicio" onClick={() => interactivo && onZona(null)}>
        <MapaBase P={P} detalle />
        <RellenoZonas P={P} color={colorZona} alfa={alfaZona} />
        <Contornos P={P} uid={uid} sel={zonaSel} />
        {/* zonas pulsables (capa transparente encima de la base) */}
        {interactivo && ZONAS.map((z) => (
          <g key={z} fill="transparent" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onZona(z) }}>
            {P.caminos.filter((c) => c.zona === z).map((c, j) => <path key={j} d={c.d} fillRule="evenodd" />)}
          </g>
        ))}
        <text x={W - 24} y={H / 2} textAnchor="end" fontSize="15" fontStyle="italic" fontWeight="500" letterSpacing="1" fill={C.textoAgua} pointerEvents="none">Lago Michigan</text>
        <g pointerEvents="none">
          {segmentos.map((s, i) => (
            <LineaRuta key={i} pl={lineas[i]} posInsignia={posIns[i]} color={COLOR_CAMION[s.c]} ancho={7} discontinua={s.disc} insignia={s.c} tam={22} />
          ))}
        </g>
        <Estaciones P={P} r={9} borde={4} />
        <g style={progresoCss ? { opacity: 'clamp(0, calc((var(--p, 0) - 0.45) * 2.5), 1)' } : undefined}>
          {!mini && ZONAS.map(etiqueta)}
          {!mini && etiqueta('Taller')}
        </g>
      </svg>

      {!mini && <div className="absolute left-4 top-4 flex items-center bg-white rounded-full shadow-float pl-4 pr-1 h-11 gap-2" style={progresoCss ? { opacity: 'clamp(0, calc((var(--p, 0) - 0.45) * 2.5), 1)' } : undefined}>
        <span className="text-[12px] text-muted font-medium">Capa</span>
        {['Estado de la flota', 'Demanda esperada', 'Viajes perdidos'].map((c) => (
          <button key={c} onClick={() => setCapa(c)} aria-pressed={capa === c}
            className={`rounded-full h-9 px-3.5 text-[13px] font-medium ${capa === c ? 'bg-accent text-white' : 'text-ink hover:bg-accent-bg hover:text-accent-ink'}`}>{c}</button>
        ))}
      </div>}
      {!mini && <div className="absolute left-4 bottom-4 bg-white rounded-full shadow-float h-9 px-4 flex items-center gap-3 text-[12px]" style={progresoCss ? { opacity: 'clamp(0, calc((var(--p, 0) - 0.45) * 2.5), 1)' } : undefined}>
        <span><span className="text-positive">●</span> Cargados</span>
        <span><span className="text-warning">●</span> Bajos (no alquilables)</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-ink align-middle mr-1" />Zona</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-[3px] bg-ink align-middle mr-1" />Taller</span>
      </div>}
    </div>
  )
}

// Mini-mapa de la franja plegada
export function MiniMapa({ mapa }) {
  const P = useProyeccion(mapa?.geojson, mapa?.puntos)
  if (!P) return null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[58px] w-[64px]" aria-hidden="true">
      {P.caminos.map((c, i) => <path key={i} d={c.d} fill={c.zona === 'Sin servicio' ? '#F1F1F1' : '#AFAFAF'} stroke="#AFAFAF" strokeWidth="2" fillRule="evenodd" />)}
      <rect x={P.pts.Taller[0] - 22} y={P.pts.Taller[1] - 22} width="44" height="44" fill="#000" />
    </svg>
  )
}

// Minimapa de un plan: la base del mapa, las zonas y el taller como estaciones y una línea por tarea (del taller a la zona
// en un cambio; del origen al destino en una reubicación). Un solo color (el del plan) o el de cada camión si no se pasa 'color'.
// 'detalle' (mapa ampliado): calles menores, insignias con el número de camión y nombres de las zonas.
// Extras para comparar (todos opcionales):
//   relleno: { zona: color }  pinta cada zona (mapas de calor y de diferencias)
//   valores: { zona: texto }  segunda línea bajo el nombre de la zona
//   flujos:  agrupa las líneas por origen→destino, con grosor según nº de patinetes y la cantidad en la insignia
//   sinFlechas: no dibuja las tareas del plan
export function MinimapaPlan({ mapa, ruta, tarea, color, className = '', titulo = 'Minimapa de las tareas del plan', detalle = false, relleno, valores, flujos = false, sinFlechas = false }) {
  const P = useProyeccion(mapa?.geojson, mapa?.puntos)
  const uid = useId().replace(/:/g, '')
  const red = useMemo(() => (P ? construirRed(P.pts) : []), [P])
  if (!P) return <div className={`rounded-xl bg-accent-bg ${className}`} />
  let segs = []
  Object.entries(ruta || {}).forEach(([c, ts]) => ts.forEach((t) => segs.push({ t, c, color: color || COLOR_CAMION[c] })))
  if (tarea) segs.push({ t: tarea, c: null, color: color || '#000000' })
  if (sinFlechas) segs = []
  if (flujos) {
    // CAMBIO: del taller a la zona (repone t[2] cargados). REUBICAR: de origen a destino (t[3] patinetes)
    const agr = {}
    segs.forEach((s) => {
      const o = origenDe(s.t), d = destinoDe(s.t), n = s.t[0] === 'CAMBIO' ? s.t[2] : s.t[3]
      const k = o + '>' + d
      agr[k] = agr[k] || { t: s.t[0] === 'CAMBIO' ? ['CAMBIO', d] : ['REUBICAR', o, d], n: 0, color: s.color }
      agr[k].n += n
    })
    segs = Object.values(agr)
  }
  const { h } = P.caja
  const m = 18
  const nombres = [...ZONAS, 'Taller'], xs = nombres.map((n) => P.pts[n][0]), ys = nombres.map((n) => P.pts[n][1])
  const mg = detalle ? 80 : 60
  let x0 = Math.min(...xs) - mg, x1 = Math.max(...xs) + mg
  const y0 = Math.min(...ys) - mg, y1 = Math.max(...ys) + mg
  if (x1 - x0 < (y1 - y0) * 0.62) { const c = (x0 + x1) / 2, mitad = (y1 - y0) * 0.31; x0 = c - mitad; x1 = c + mitad }
  const z = Math.max(0.4, (y1 - y0) / (h + 2 * m))      // factor de escala del encuadre
  const ancho = (s) => (flujos ? Math.min(26, 6 + s.n * 0.6) : detalle ? 7 : 12) * z
  const RP = (detalle ? 9 : 12) * z
  const lineas = trazarLineas(segs.map((s) => ({ o: origenDe(s.t), d: destinoDe(s.t), w: ancho(s) })), P.pts, red)
    .map((pl, i) => recortar(pl, origenDe(segs[i].t) === 'Taller' ? RP * 2 : RP + 4, RP + 5))
  const tamIns = (flujos ? 34 : 24) * z
  const posIns = colocarInsignias(lineas, tamIns, Object.values(P.pts))
  const limites = { x0, y0, x1, y1 }
  const muestras = muestrasLineas(lineas.filter((l) => l.length > 1))
  const posEtiq = detalle ? colocarEtiquetas([...ZONAS, 'Taller'], P.pts, valores, muestras, limites, z) : {}
  const etiqueta = (nombre) => {
    const e = posEtiq[nombre]
    if (!e) return null
    return (
      <g key={nombre} pointerEvents="none">
        <text x={e.x} y={e.y} textAnchor={e.anchor} fontSize={24 * z} fontWeight="700" fill={C.texto} stroke="#fff" strokeWidth={5 * z} paintOrder="stroke" strokeLinejoin="round">{nombre}</text>
        {valores && valores[nombre] != null && <text x={e.x} y={e.y + 26 * z} textAnchor={e.anchor} fontSize={26 * z} fontWeight="800" fill="#000" stroke="#fff" strokeWidth={6 * z} paintOrder="stroke" strokeLinejoin="round">{valores[nombre]}</text>}
      </g>
    )
  }
  const colorZona = (z) => (z === 'Sin servicio' ? C.sinServicio : relleno && relleno[z] ? relleno[z] : null)
  return (
    <svg viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} className={`rounded-xl ${className}`} style={{ background: C.suburbio }} role="img" aria-label={titulo} preserveAspectRatio="xMidYMid meet" shapeRendering={detalle ? 'geometricPrecision' : undefined}>
      <MapaBase P={P} detalle={detalle} grosor={(detalle ? 1 : 1.6) * z} />
      <RellenoZonas P={P} color={colorZona} alfa={(z) => (z === 'Sin servicio' ? 0.85 : 0.82)} />
      <Contornos P={P} uid={uid} grosor={(detalle ? 1 : 1.6) * z} />
      {segs.map((s, i) => (
        <LineaRuta key={i} pl={lineas[i]} posInsignia={posIns[i]} color={s.color} ancho={ancho(s)} r={(detalle ? 14 : 22) * z}
          insignia={flujos ? s.n : detalle && s.c ? s.c : null} insigniaClara={flujos} tam={tamIns} />
      ))}
      <Estaciones P={P} r={RP} borde={(detalle ? 4 : 5.5) * z} />
      {detalle && [...ZONAS, 'Taller'].map(etiqueta)}
    </svg>
  )
}

// ---------- Legibilidad del mapa ampliado ----------
// Muestrea puntos a lo largo de varias polilíneas (para que las etiquetas no las tapen)
function muestrasLineas(listas) {
  const out = []
  listas.forEach((pl) => { for (let i = 0; i + 1 < pl.length; i++) { const a = pl[i], b = pl[i + 1], n = Math.max(1, Math.ceil(dist(a, b) / 6)); for (let k = 0; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]) } })
  return out
}

// Coloca cada nombre (y su valor) en el hueco libre más cercano a su punto: sin tapar líneas, puntos, otras etiquetas ni salirse del mapa.
function colocarEtiquetas(nombres, pts, valores, muestras, lim, e = 1) {
  const out = {}, cajas = []
  const cand = [[16, -14, 'start'], [16, 28, 'start'], [-16, -14, 'end'], [-16, 28, 'end'], [18, 8, 'start'], [-18, 8, 'end'], [0, -26, 'middle'], [0, 44, 'middle'], [30, -40, 'start'], [-30, -40, 'end'], [30, 56, 'start'], [-30, 56, 'end']]
    .map(([dx, dy, a]) => [dx * e, dy * e, a])
  nombres.forEach((n) => {
    const [px, py] = pts[n]
    const v = valores && valores[n] != null ? String(valores[n]) : null
    const ancho = Math.max(n.length * 14.5, v ? v.length * 16 : 0) * e
    const alto = (v ? 62 : 32) * e
    let mejor = null
    cand.forEach(([dx, dy, anc], k) => {
      const bx0 = (anc === 'start' ? px + dx : anc === 'end' ? px + dx - ancho : px + dx - ancho / 2) - 5 * e
      const bx1 = bx0 + ancho + 10 * e
      const by0 = py + dy - 26 * e, by1 = by0 + alto + 8 * e
      let coste = k * 2 + (k >= 8 ? 40 : 0)
      const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2   // la etiqueta debe quedar más cerca de su punto que de cualquier otro
      Object.entries(pts).forEach(([m, q]) => { if (m !== n && dist([cx, cy], q) < dist([cx, cy], [px, py])) coste += 60 })
      muestras.forEach((q) => { if (q[0] > bx0 && q[0] < bx1 && q[1] > by0 && q[1] < by1) coste += 25 })
      Object.entries(pts).forEach(([m, q]) => { if (q[0] > bx0 - 12 * e && q[0] < bx1 + 12 * e && q[1] > by0 - 12 * e && q[1] < by1 + 12 * e) coste += m === n ? 150 : 120 })
      cajas.forEach(([a0, b0, a1, b1]) => { if (bx0 < a1 && bx1 > a0 && by0 < b1 && by1 > b0) coste += 250 })
      const fuera = Math.max(lim.x0 - bx0, bx1 - lim.x1, lim.y0 - by0, by1 - lim.y1, 0)
      coste += fuera * 10
      if (!mejor || coste < mejor.coste) mejor = { coste, x: px + dx, y: py + dy, anchor: anc, caja: [bx0, by0, bx1, by1] }
    })
    out[n] = { x: mejor.x, y: mejor.y, anchor: mejor.anchor }
    cajas.push(mejor.caja)
  })
  return out
}
