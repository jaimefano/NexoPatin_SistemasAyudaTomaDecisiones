import React from 'react'
import { IconFlecha, Logo } from './components/ui.jsx'

// Portada del SATD: presenta el proyecto y lleva al paso 1 (Opciones).
// Sin barra lateral. Los datos citados son los del caso (Lyft, Chicago, oct–dic 2025) y las constantes del simulador.

const PASOS = [
  ['Seleccionar', 'El sistema genera muchos planes completos para la noche. Filtras por el rango de cada indicador y marcas hasta tres.'],
  ['Comparar', 'Los planes elegidos, lado a lado y frente a no hacer nada: escenario esperado y peor escenario, por día y por zona.'],
  ['Decidir', 'Eliges uno, ves la hoja de ruta de cada camión y lo confirmas.'],
]

// Patinete de perfil (suelo en y = 0), para reutilizar con <use>
const PATINETE = (
  <g id="patinete">
    <circle cx="-30" cy="-9" r="9" vectorEffect="non-scaling-stroke" />
    <circle cx="40" cy="-9" r="9" vectorEffect="non-scaling-stroke" />
    <path d="M-30 -14 H30 L40 -9" vectorEffect="non-scaling-stroke" />
    <path d="M40 -9 L32 -82" vectorEffect="non-scaling-stroke" />
    <path d="M24 -82 H42" vectorEffect="non-scaling-stroke" />
  </g>
)

// --- Animación de carga ---
// Un operario sube los patinetes por la rampa y los deja uno a uno dentro de la caja. Con los tres dentro cierra,
// se sube a la cabina y el camión arranca hacia la derecha; después llega otro desde la izquierda y vuelve a empezar.
const HUECOS = [570, 446, 322]                       // posiciones dentro de la caja (se llenan del fondo hacia la puerta)
const S0 = 60, SUELTA = 200, CABINA = 690            // dónde aparece cada patinete, dónde lo suelta el operario y puerta de la cabina
const EMPUJE = 2600, RUEDA = 900, VUELTA = 1500, VIAJE = EMPUJE + RUEDA + VUELTA
const BAJA = 700, CAMINA = 2200, SUBE = 450, ARRANCA = 2300, LLEGA = 2300, ABRE = 500, VUELVE = 2200
const F_CARGA = 2 * VIAJE + EMPUJE + RUEDA          // el tercer patinete ya está dentro
const F_BAJA = F_CARGA + BAJA, F_CAMINA = F_BAJA + CAMINA, F_SUBE = F_CAMINA + SUBE
const F_ARRANCA = F_SUBE + ARRANCA, F_LLEGA = F_ARRANCA + LLEGA, CICLO = F_LLEGA + VUELVE
const SALIDA = 1100, ENTRADA = 420                   // al irse sale por el borde derecho de la pantalla; el nuevo entra desde la izquierda apareciendo
const sueloY = (x) => (x < 118 ? 458 : x < 260 ? 458 - ((x - 118) * 58) / 142 : 400)
const giro = (x) => (x < 112 ? 0 : x < 126 ? (-22.3 * (x - 112)) / 14 : x < 252 ? -22.3 : x < 266 ? -22.3 * (1 - (x - 252) / 14) : 0)
const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const frena = (t) => 1 - Math.pow(1 - t, 3)
const acelera = (t) => t * t * t
const lerp = (a, b, t) => a + (b - a) * t
const tramo = (t, a, d) => Math.min(1, Math.max(0, (t - a) / d))
// Manillar del patinete (en coordenadas del dibujo) cuando su punto de apoyo está en x
function manillar(x) {
  const a = (giro(x) * Math.PI) / 180, hx = 46, hy = -115
  return [x + hx * Math.cos(a) - hy * Math.sin(a), sueloY(x) + hx * Math.sin(a) + hy * Math.cos(a)]
}
const OP0 = manillar(S0)[0] - 32, OP_SUELTA = manillar(SUELTA)[0] - 32

// Estado de la escena en el instante t (ms dentro del ciclo)
function escena(t) {
  const fuera = t >= F_ARRANCA                       // el camión cargado ya se fue: el que llega viene vacío
  const pats = HUECOS.map((hueco, i) => {
    const l = t - i * VIAJE
    if (l < 0 || fuera) return { x: S0, o: 0 }
    if (l < EMPUJE) return { x: lerp(S0, SUELTA, suave(l / EMPUJE)), o: Math.min(1, l / 300) }
    if (l < EMPUJE + RUEDA) return { x: lerp(SUELTA, hueco, frena((l - EMPUJE) / RUEDA)), o: 1 }
    return { x: hueco, o: 1 }
  })
  // camión: se va acelerando hacia la derecha y el siguiente llega frenando desde la izquierda
  const dx = t < F_SUBE ? 0 : t < F_ARRANCA ? SALIDA * acelera(tramo(t, F_SUBE, ARRANCA)) : t < F_LLEGA ? -ENTRADA * (1 - frena(tramo(t, F_ARRANCA, LLEGA))) : 0
  const visible = t < F_ARRANCA ? 1 : t < F_LLEGA ? Math.min(1, tramo(t, F_ARRANCA, LLEGA) / 0.6) : 1
  // puerta trasera y rampa: se cierran mientras el operario va a la cabina y se abren cuando llega el camión nuevo
  const puerta = t < F_BAJA ? 1 : t < F_ARRANCA ? 1 - tramo(t, F_BAJA, 600) : t < F_LLEGA ? 0 : tramo(t, F_LLEGA, ABRE)
  let op
  if (t < F_CARGA) {
    const k = Math.floor(t / VIAJE), l = t - k * VIAJE
    if (l < EMPUJE) { const m = manillar(pats[k].x); op = { x: m[0] - 32, dir: 1, anda: true, mano: m } }
    else if (l < EMPUJE + RUEDA) op = { x: OP_SUELTA, dir: 1, anda: false }
    else op = { x: lerp(OP_SUELTA, OP0, suave((l - EMPUJE - RUEDA) / VUELTA)), dir: -1, anda: true }
    op.y = sueloY(op.x)
  } else if (t < F_BAJA) { const x = lerp(OP_SUELTA, 110, tramo(t, F_CARGA, BAJA)); op = { x, y: sueloY(x), dir: -1, anda: true } }
  else if (t < F_CAMINA) op = { x: lerp(110, CABINA, suave(tramo(t, F_BAJA, CAMINA))), y: 458, dir: 1, anda: true }
  else if (t < F_SUBE) { const f = tramo(t, F_CAMINA, SUBE); op = { x: CABINA, y: 458 - 14 * f, dir: 1, o: 1 - f } }
  else if (t < F_LLEGA) op = { x: CABINA, y: 458, dir: 1, o: 0 }
  else { const f = tramo(t, F_LLEGA, VUELVE); op = { x: lerp(CABINA, OP0, suave(f)), y: 458, dir: -1, anda: f > 0.05, o: Math.min(1, f * 8) } }
  return { pats, dx, visible, puerta, op: { o: 1, mano: null, ...op } }
}

function CamionCargando({ className = '' }) {
  const svgRef = React.useRef(null), camionRef = React.useRef(null), puertaRef = React.useRef(null)
  const patRefs = [React.useRef(null), React.useRef(null), React.useRef(null)]
  const radioRefs = [React.useRef(null), React.useRef(null)]
  const opRef = React.useRef(null), piernasRef = React.useRef(null), brazoRef = React.useRef(null)

  React.useEffect(() => {
    const pintar = (t) => {
      const { pats, dx, visible, puerta, op } = escena(t)
      camionRef.current.setAttribute('transform', `translate(${dx.toFixed(1)} 0)`)
      camionRef.current.style.opacity = visible.toFixed(3)
      puertaRef.current.style.opacity = puerta.toFixed(3)
      const vuelta = ((dx / 30) * 180) / Math.PI        // las ruedas giran al avanzar (radio 30)
      radioRefs[0].current.setAttribute('transform', `rotate(${vuelta.toFixed(1)} 340 428)`)
      radioRefs[1].current.setAttribute('transform', `rotate(${vuelta.toFixed(1)} 720 428)`)
      pats.forEach((p, i) => {
        const g = patRefs[i].current
        g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${sueloY(p.x).toFixed(1)}) rotate(${giro(p.x).toFixed(2)})`)
        g.style.opacity = p.o.toFixed(3)
      })
      opRef.current.setAttribute('transform', `translate(${op.x.toFixed(1)} ${op.y.toFixed(1)}) scale(${op.dir} 1)`)
      opRef.current.style.opacity = op.o.toFixed(3)
      const a = op.anda ? Math.sin((t / 1000) * Math.PI * 2 * 1.5) * 0.32 : 0.12, L = 88   // parado: piernas algo abiertas
      piernasRef.current.setAttribute('d', `M2 -88 L${(2 + Math.sin(a) * L).toFixed(1)} ${(-88 + Math.cos(a) * L).toFixed(1)} M2 -88 L${(2 - Math.sin(a) * L).toFixed(1)} ${(-88 + Math.cos(a) * L).toFixed(1)}`)
      const h = op.mano ? [(op.mano[0] - op.x) * op.dir, op.mano[1] - op.y] : [8, -88]
      const c = [h[0] / 2 - 3, (-142 + h[1]) / 2 + 7]
      brazoRef.current.setAttribute('d', `M0 -142 L${c[0].toFixed(1)} ${c[1].toFixed(1)} L${h[0].toFixed(1)} ${h[1].toFixed(1)}`)
    }
    const fija = new URLSearchParams(window.location.search).get('escena')   // depuración: ?escena=ms congela la escena en ese instante
    if (fija != null) { pintar(Number(fija) % CICLO); return }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { pintar(VIAJE + EMPUJE * 0.6); return }
    let id
    const t0 = performance.now()
    const bucle = (ahora) => {
      if (svgRef.current?.getClientRects().length) pintar((ahora - t0) % CICLO)   // no dibuja si está oculto (pantallas estrechas)
      id = requestAnimationFrame(bucle)
    }
    id = requestAnimationFrame(bucle)
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <svg ref={svgRef} viewBox="0 0 900 480" className={className} style={{ overflow: 'visible' }} fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs>{PATINETE}</defs>
      {/* suelo */}
      <path d="M20 458 H880" strokeOpacity=".5" />
      <g ref={camionRef}>
        {/* caja de carga (vista en corte) y chasis */}
        <rect x="260" y="150" width="380" height="250" rx="6" />
        <path d="M260 300 H640" strokeOpacity=".35" strokeDasharray="2 10" />
        <path d="M250 400 H800 V418 H250 Z" />
        {/* cabina */}
        <path d="M640 400 V230 H730 L792 300 V400" />
        <path d="M656 246 H722 L768 298 H656 Z" />
        <path d="M792 352 H808" />
        {/* puerta trasera abierta y rampa */}
        <g ref={puertaRef}>
          <path d="M260 152 L214 168 V392 L260 400" />
          <path d="M260 400 L118 458" />
        </g>
        {/* ruedas (con un radio para que se vea que giran) */}
        <g fill="#050505">
          <circle cx="340" cy="428" r="30" /><circle cx="340" cy="428" r="11" />
          <circle cx="720" cy="428" r="30" /><circle cx="720" cy="428" r="11" />
        </g>
        <path ref={radioRefs[0]} d="M340 417 V398" strokeOpacity=".6" />
        <path ref={radioRefs[1]} d="M720 417 V398" strokeOpacity=".6" />
        {/* patinetes (la animación los mueve) */}
        {patRefs.map((r, i) => <g key={i} ref={r} style={{ opacity: 0 }}><use href="#patinete" transform="scale(1.4)" /></g>)}
      </g>
      {/* operario */}
      <g ref={opRef} transform={`translate(${OP0} 458)`}>
        <circle cx="0" cy="-166" r="12" />
        <path d="M0 -154 L2 -88" />
        <path ref={piernasRef} d="M2 -88 L-10 0 M2 -88 L14 0" />
        <path ref={brazoRef} d="M0 -142 L4 -114 L8 -88" />
      </g>
    </svg>
  )
}

// Fondo de la portada. 'ilustracion' muestra el camión a la derecha (solo en pantallas anchas, para no tapar el texto).
export function FondoPortada({ ilustracion = false }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 bg-[#050505]">
      {ilustracion && <CamionCargando className="absolute right-[3%] bottom-[10%] hidden w-[46%] max-w-[920px] opacity-40 lg:block" />}
    </div>
  )
}

function Enlace({ a, ir, children, className = '', ...p }) {
  return (
    <a href={a} onClick={(e) => { e.preventDefault(); ir(a) }} className={className} {...p}>{children}</a>
  )
}

export default function Portada({ ir }) {
  return (
    <div className="portada min-h-screen bg-white text-ink">
      <header className="sticky top-0 z-30 bg-ink text-white">
        <nav aria-label="Principal" className="mx-auto flex h-[72px] items-center justify-between gap-6 px-6 md:px-14">
          <a href="/" onClick={(e) => { e.preventDefault(); ir('/') }} aria-label="NexoPatin, inicio" className="inline-flex"><Logo className="text-[24px]" /></a>
          <div className="flex items-center gap-2 md:gap-8">
            <a href="#como" className="hidden md:inline text-[15px] font-medium text-white/80 hover:text-white">Cómo funciona</a>
            <Enlace a="/acceso" ir={ir} className="inline-flex h-10 items-center rounded-full border border-white/40 px-5 text-[15px] font-medium text-white hover:bg-white/10">Entrar</Enlace>
          </div>
        </nav>
      </header>

      <section className="relative overflow-hidden bg-ink text-white">
        <FondoPortada ilustracion />
        <div className="relative z-10 flex min-h-[max(640px,calc(100vh-72px))] flex-col justify-between px-6 pt-20 pb-10 md:px-14 md:pt-28">
          <div className="max-w-[860px]">
            <h1 className="entra text-[clamp(40px,5.6vw,80px)] font-bold leading-[1.06] tracking-[-0.02em] text-balance" style={{ '--d': '0ms' }}>
              Un patinete sin batería no factura. Una flota mal operada, tampoco.
            </h1>
            <p className="entra mt-10 max-w-[680px] text-[19px] leading-[1.55] text-white/80" style={{ '--d': '90ms' }}>
              Cada noche decides dónde cambiar baterías y qué patinetes mover. Compara los planes y mira qué pasará con cada uno antes de enviar los camiones.
            </p>
            <div className="entra mt-10 flex flex-wrap items-center gap-x-8 gap-y-5" style={{ '--d': '180ms' }}>
              <Enlace a="/acceso" ir={ir} className="inline-flex h-12 items-center gap-2 rounded-lg bg-cta px-6 text-[16px] font-medium text-white hover:bg-cta-hover active:scale-[.98] transition-[background-color,transform]">
                Empezar a planificar <IconFlecha size={20} />
              </Enlace>
              <a href="#como" className="text-[16px] font-medium underline underline-offset-4 decoration-white/60 hover:decoration-white">Ver cómo funciona</a>
            </div>
          </div>
        </div>
      </section>

      <section id="como" className="bg-surface px-6 py-24 md:px-14 md:py-32">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mx-auto max-w-[900px] text-center text-[clamp(30px,3.6vw,52px)] font-bold leading-[1.12] tracking-[-0.02em] text-balance">
            Tres pasos para llegar a una decisión
          </h2>
          <p className="mx-auto mt-6 max-w-[640px] text-center text-[18px] leading-[1.55] text-muted">
            De muchos planes posibles al que ejecutas, sabiendo qué pasa en el escenario esperado y en el peor.
          </p>
          <ol className="mt-20 border-t border-border-strong">
            {PASOS.map(([titulo, texto], i) => (
              <li key={titulo} className="grid gap-x-12 gap-y-2 border-b border-border-strong py-9 md:grid-cols-[64px_260px_1fr] md:items-baseline">
                <span className="text-[16px] font-medium text-muted">{i + 1}</span>
                <h3 className="text-[28px] font-bold leading-tight tracking-[-0.01em]">{titulo}</h3>
                <p className="max-w-[60ch] text-[18px] leading-[1.55] text-ink/80">{texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-ink px-6 py-24 text-white md:px-14 md:py-28">
        <div className="mx-auto flex max-w-[1100px] flex-col items-start justify-between gap-10 md:flex-row md:items-center">
          <h2 className="max-w-[640px] text-[clamp(30px,3.6vw,52px)] font-bold leading-[1.12] tracking-[-0.02em] text-balance">
            Empieza seleccionando los planes de esta noche
          </h2>
          <Enlace a="/acceso" ir={ir} className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-cta px-6 text-[16px] font-medium text-white hover:bg-cta-hover active:scale-[.98] transition-[background-color,transform]">
            Empezar a planificar <IconFlecha size={20} />
          </Enlace>
        </div>
      </section>

    </div>
  )
}
