import React from 'react'
import { COLOR_CAMION, COLOR_PLAN, TEXTO_PLAN } from '../utils.js'

const Svg = ({ children, size = 30, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>
)
// Logo de NexoPatin: la marca (una N con la diagonal gruesa y dos ruedas) y el nombre. Toma el color del texto.
export function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-[0.3em] font-logo font-bold tracking-[-0.04em] leading-none whitespace-nowrap ${className}`}>
      <svg viewBox="32 30 96 118" style={{ height: '1.5em', width: 'auto', aspectRatio: '96 / 118' }} fill="currentColor" aria-hidden="true">
        <rect x="38" y="34" width="7" height="84" /><rect x="115" y="34" width="7" height="84" />
        <polygon points="38,34 68,34 122,118 92,118" />
        <circle cx="41.5" cy="138" r="8" /><circle cx="118.5" cy="138" r="8" />
      </svg>
      NexoPatin
    </span>
  )
}

export const IconMenu = (p) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
export const IconRuta = (p) => <Svg {...p}><circle cx="6" cy="19" r="2.2" /><circle cx="18" cy="5" r="2.2" /><path d="M8.2 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8" /></Svg>
export const IconCheck = (p) => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></Svg>
export const IconLimites = (p) => <Svg {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Svg>
export const IconPerfil = (p) => <Svg {...p}><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20.2c.6-3.8 3.6-6 7.5-6s6.9 2.2 7.5 6" /></Svg>
export const IconSalir = (p) => <Svg {...p}><path d="M9 4.5H6.5A2 2 0 0 0 4.5 6.5v11a2 2 0 0 0 2 2H9" /><path d="M16 8l4 4-4 4M20 12H10" /></Svg>
export const IconAjustes = (p) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></Svg>
export const IconDeshacer = (p) => <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Svg>
export const IconFlecha = (p) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
export const IconAtras = (p) => <Svg {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>
export const IconBuscar = (p) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></Svg>
export const IconFiltro = (p) => <Svg {...p}><path d="M4 7h16M7 12h10M10 17h4" /></Svg>
export const IconCerrar = (p) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
export const IconAviso = (p) => <Svg {...p}><path d="M12 4 3 20h18L12 4Z" /><path d="M12 10v4M12 17.2v.1" /></Svg>
export const IconChevron = ({ arriba, ...p }) => <Svg {...p}><path d={arriba ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></Svg>
export const IconOrden = (p) => <Svg {...p}><path d="M8 4v16M8 4 4 8M8 4l4 4M16 20V4m0 16-4-4m4 4 4-4" /></Svg>

// Cálculo lento: true solo si 'activo' dura más de ms (300 por defecto). Se usa con la clase "dim" y <Recalculando/>; nunca bloquea la pantalla.
export function useLento(activo, ms = 300) {
  const [lento, setLento] = React.useState(false)
  React.useEffect(() => {
    if (!activo) { setLento(false); return }
    const t = setTimeout(() => setLento(true), ms)
    return () => clearTimeout(t)
  }, [activo, ms])
  return lento
}
export function Recalculando({ activo }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted whitespace-nowrap min-w-[1px]" role="status" aria-live="polite">
      {activo && <><span className="w-3 h-3 rounded-full border-2 border-border-strong border-t-accent animate-spin" aria-hidden="true" />Recalculando…</>}
    </span>
  )
}

export function Camion({ n, size = 20 }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0"
      style={{ background: COLOR_CAMION[n], width: size, height: size, fontSize: size * 0.55 }} aria-label={`Camión ${n}`}>{n}</span>
  )
}

export function Boton({ variante = 'secundario', className = '', children, ...p }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-full font-medium px-5 h-11 whitespace-nowrap transition-colors'
  const v = {
    primario: 'bg-cta text-white hover:bg-cta-hover disabled:bg-border-strong',
    secundario: 'bg-surface-2 text-ink hover:bg-border',
    borde: 'bg-white text-ink border border-border-strong hover:bg-surface',
  }[variante]
  return <button className={`${base} ${v} ${className}`} {...p}>{children}</button>
}

export function Chip({ activo, className = '', children, ...p }) {
  return (
    <button className={`inline-flex items-center gap-1.5 rounded-full h-10 px-4 text-[13px] font-medium whitespace-nowrap ${activo ? 'bg-accent text-white' : 'bg-surface-2 text-ink hover:bg-accent-bg hover:text-accent-ink'} ${className}`} {...p}>{children}</button>
  )
}

export function Selector({ etiqueta, valor, opciones, onChange, plano }) {
  // Píldora con menú propio: "Etiqueta: valor ▾". El menú es una tarjeta flotante (bordes redondeados, sombra suave, check en la opción activa).
  const [abierto, setAbierto] = React.useState(false)
  const [foco, setFoco] = React.useState(-1)
  const raiz = React.useRef(null)
  const activo = !plano && valor !== 'Todos' && valor !== 'Todas'
  const idx = opciones.findIndex((o) => o.valor === valor)
  const txt = idx >= 0 ? opciones[idx].texto : valor

  React.useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const abrir = () => { setFoco(Math.max(idx, 0)); setAbierto(true) }
  const elegir = (v) => { setAbierto(false); if (v !== valor) onChange(v) }
  const teclas = (e) => {
    if (!abierto) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); abrir() } return }
    if (e.key === 'Escape') { setAbierto(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFoco((f) => (f + 1) % opciones.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFoco((f) => (f - 1 + opciones.length) % opciones.length) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(opciones[foco]?.valor ?? valor) }
    else if (e.key === 'Tab') setAbierto(false)
  }

  return (
    <div ref={raiz} className="relative inline-block">
      <button type="button" aria-haspopup="listbox" aria-expanded={abierto} aria-label={etiqueta}
        onClick={() => (abierto ? setAbierto(false) : abrir())} onKeyDown={teclas}
        className={`inline-flex items-center gap-1.5 rounded-full h-10 px-4 text-[13px] font-medium whitespace-nowrap ${activo ? 'bg-accent text-white' : 'bg-surface-2 text-ink hover:bg-accent-bg hover:text-accent-ink'}`}>
        <span>{etiqueta}: {txt}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={`transition-transform ${abierto ? 'rotate-180' : ''}`}><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {abierto && (
        <ul role="listbox" aria-label={etiqueta} onMouseLeave={() => setFoco(idx)} className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-full w-max max-h-[320px] overflow-auto bg-white border border-border rounded-2xl shadow-float p-[6px]">
          {/* Relleno azul (color de acento) que se desliza hasta la opción bajo el ratón (o la del teclado) */}
          <div aria-hidden="true" className="absolute left-[6px] right-[6px] h-[36px] rounded-xl bg-accent pointer-events-none transition-transform duration-150 ease-out"
            style={{ top: 6, transform: `translateY(${Math.max(foco, 0) * 36}px)`, opacity: foco >= 0 ? 1 : 0 }} />
          {opciones.map((o, i) => {
            const sel = o.valor === valor
            return (
              <li key={o.valor} role="option" aria-selected={sel} onMouseEnter={() => setFoco(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(o.valor)}
                className={`relative flex items-center justify-between gap-6 rounded-xl px-3 h-[36px] text-[13px] cursor-pointer transition-colors duration-150 ${foco === i ? 'text-white' : ''} ${sel ? 'font-semibold' : 'font-medium'}`}>
                <span>{o.texto}</span>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className={sel ? 'opacity-100' : 'opacity-0'}><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export const Tarjeta = ({ className = '', children, ...p }) => (
  <div className={`bg-white border border-border rounded-2xl ${className}`} {...p}>{children}</div>
)

export function Chipvar({ children }) {
  return <span className="text-cta-ink font-semibold text-[12px]">{children}</span>
}

export function Migas({ items }) {
  return (
    <nav className="text-[14px] flex items-center gap-2 text-white" aria-label="Migas de pan">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-white/60">›</span>}
          {it.onClick ? <button className="underline" onClick={it.onClick}>{it.texto}</button> : <span>{it.texto}</span>}
        </React.Fragment>
      ))}
    </nav>
  )
}

export const IconLista = (p) => <Svg {...p}><circle cx="5" cy="7" r="1.4" /><circle cx="5" cy="12" r="1.4" /><circle cx="5" cy="17" r="1.4" /><path d="M10 7h10M10 12h10M10 17h10" /></Svg>
export const IconColumnas = (p) => <Svg {...p}><rect x="3.5" y="10" width="4" height="10" rx="1" /><rect x="10" y="4" width="4" height="16" rx="1" /><rect x="16.5" y="13" width="4" height="7" rx="1" /></Svg>
export const IconOk = (p) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>

// Insignia de plan: círculo con la letra del hueco (A/B/C), siempre con la letra escrita
export function Insignia({ letra, size = 24 }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full font-bold shrink-0" aria-label={`Plan ${letra}`}
      style={{ background: COLOR_PLAN[letra], color: TEXTO_PLAN[letra], width: size, height: size, fontSize: size * 0.5 }}>{letra}</span>
  )
}

// Barra de pasos: proceso lineal 1 Opciones > 2 Comparar > 3 Decidir, con "Plan propio" como desvio opcional
// Estados: hecho (check, conector relleno) · actual (negro) · pendiente (gris)
const PASOS = [
  { id: '/opciones', n: 1, texto: 'Seleccionar', h: 0 },
  { id: '/comparar', n: 2, texto: 'Comparar', h: 2 },
  { id: '/decidir', n: 3, texto: 'Decidir', h: 3 },
]
const POS = { '/opciones': 0, '/plan-propio': 0.5, '/comparar': 1, '/decidir': 2 }
export function Stepper({ ruta, ir, puedeComparar, puedeDecidir, hechos }) {
  const pos = POS[ruta] ?? 0
  const enPlan = ruta === '/plan-propio'
  const habilitado = (p) => (p.id === '/comparar' ? puedeComparar : p.id === '/decidir' ? puedeDecidir : true)
  const linea = (lleno) => <span className={`h-[2px] flex-1 min-w-[8px] rounded-full ${lleno ? 'bg-white' : 'bg-white/30'}`} />
  return (
    <nav aria-label="Progreso">
      <ol className="flex items-center list-none m-0 p-0">
        {PASOS.map((p, i) => {
          const act = i === pos
          const hecho = !!hechos[p.h] && !act
          const ok = habilitado(p) || hecho
          const lleno = i === 1 ? pos >= 0.5 : pos >= i
          return (
            <React.Fragment key={p.id}>
              {i > 0 && (i === 1 ? (
                <li className="flex items-center flex-1 max-w-[190px] mx-1.5">
                  {linea(pos >= 0.5)}
                  <button onClick={() => ir('/plan-propio')} aria-current={enPlan ? 'step' : undefined}
                    className={`mx-1 inline-flex items-center gap-1 rounded-full h-[28px] px-2.5 text-[12px] font-medium whitespace-nowrap border border-dashed
                      ${enPlan ? 'bg-white text-ink border-white' : hechos[1] ? 'bg-transparent text-white border-white' : 'bg-transparent text-white/60 border-white/40 hover:text-white hover:border-white'}`}>
                    {hechos[1] && !enPlan && <IconOk size={12} strokeWidth={2.8} />}
                    Plan propio <span className={enPlan ? 'text-ink/60' : 'text-white/60'}>· opcional</span>
                  </button>
                  {linea(pos >= 1)}
                </li>
              ) : (
                <li aria-hidden="true" className="flex items-center flex-1 max-w-[70px] mx-1.5">{linea(lleno)}</li>
              ))}
              <li>
                <button onClick={() => ok && ir(p.id)} aria-current={act ? 'step' : undefined} disabled={!ok && !act}
                  className={`inline-flex items-center gap-2 rounded-full h-[38px] pl-1.5 pr-4 text-[13.5px] font-semibold whitespace-nowrap
                    ${act ? 'bg-white text-ink' : hecho ? 'border border-white text-white hover:bg-white/15' : 'bg-white/15 text-white/60 disabled:cursor-default'}`}>
                  <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[12px] ${act ? 'bg-ink text-white' : hecho ? 'bg-white text-ink' : 'bg-white/20 text-white/70'}`}>
                    {hecho ? <IconOk size={14} strokeWidth={2.6} /> : p.n}
                  </span>
                  {p.texto}
                  <span className="sr-only">{`, paso ${p.n} de 3${act ? ', actual' : hecho ? ', hecho' : ''}`}</span>
                </button>
              </li>
            </React.Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

// Cabecera común: marca, miga de pan, título (con contador), etiqueta de la noche y barra de pasos
export function Cabecera({ titulo, contador, extra, miga, etiqueta, pasos }) {
  return (
    <header className="mb-4 bg-ink text-white rounded-2xl px-6 py-4">
      <div className="flex items-center gap-4 mb-2">
        <Logo className="text-[21px]" /><span className="text-white/40 text-[22px] font-light">|</span>
        <Migas items={miga} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-[34px] font-bold leading-tight whitespace-nowrap">{titulo}{contador != null && <span className="font-normal text-white/60"> ({contador})</span>}</h1>
          {etiqueta && <span className="bg-white/15 text-white rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap">{etiqueta}</span>}
          {extra}
        </div>
        {pasos}
      </div>
    </header>
  )
}
