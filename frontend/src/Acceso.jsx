import React, { useRef, useState } from 'react'
import { FondoPortada } from './Portada.jsx'
import { Logo } from './components/ui.jsx'
import { postLogin, postRegistro } from './api.js'

// Acceso: iniciar sesión o crear usuario. Las cuentas y las sesiones las guarda el backend (SQLite; sesión en cookie HttpOnly).
// El rol 'admin' entra en /admin y el resto en Seleccionar.

const CAMPO = 'h-12 w-full rounded-lg bg-surface px-4 text-[16px] text-ink placeholder:text-muted-2 outline-none focus-visible:ring-2 focus-visible:ring-cta aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-negative'

function Campo({ id, etiqueta, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[14px] font-medium">{etiqueta}</label>
      {children}
      {error && <p id={`${id}-error`} className="mt-2 text-[14px] text-negative">{error}</p>}
    </div>
  )
}

export default function Acceso({ ir }) {
  const [modo, setModo] = useState('entrar')       // 'entrar' | 'crear'
  const [v, setV] = useState({ nombre: '', correo: '', clave: '', clave2: '' })
  const [errores, setErrores] = useState({})
  const [ver, setVer] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState(null)
  const formRef = useRef(null)
  const crear = modo === 'crear'

  const cambia = (k) => (e) => setV((a) => ({ ...a, [k]: e.target.value }))

  const validar = () => {
    const e = {}
    if (crear && !v.nombre.trim()) e.nombre = 'Escribe un nombre de usuario.'
    else if (crear && v.nombre.includes('@')) e.nombre = 'El nombre de usuario no puede llevar @.'
    if (!v.correo.trim()) e.correo = crear ? 'Escribe tu correo electrónico.' : 'Escribe tu usuario o correo.'
    else if (crear && !/^\S+@\S+\.\S+$/.test(v.correo.trim())) e.correo = 'El correo no parece válido. Revisa que tenga la forma nombre@empresa.com.'
    if (!v.clave) e.clave = 'Escribe tu contraseña.'
    if (crear && v.clave2 !== v.clave) e.clave2 = 'Las contraseñas no coinciden. Vuelve a escribirla.'
    return e
  }

  const enviar = async (ev) => {
    ev.preventDefault()
    const e = validar()
    setErrores(e)
    const primero = Object.keys(e)[0]
    if (primero) { formRef.current?.querySelector(`#${primero}`)?.focus(); return }
    setFallo(null); setEnviando(true)
    try {
      const u = crear ? await postRegistro(v.nombre.trim(), v.correo.trim(), v.clave) : await postLogin(v.correo.trim(), v.clave)
      if (u.rol === 'admin') window.location.assign('/admin'); else ir('/opciones')
    } catch (err) {
      setFallo(err.message)
      setEnviando(false)
    }
  }

  const cambiaModo = () => { setModo(crear ? 'entrar' : 'crear'); setErrores({}); setFallo(null) }
  const aria = (k) => ({ 'aria-invalid': errores[k] ? 'true' : undefined, 'aria-describedby': errores[k] ? `${k}-error` : undefined })

  return (
    <div className="portada min-h-screen bg-white text-ink lg:relative lg:h-screen lg:overflow-hidden">
      <aside className={`hidden overflow-hidden bg-ink text-white lg:absolute lg:inset-y-0 lg:left-0 lg:block lg:w-1/2 motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-[cubic-bezier(.16,1,.3,1)] ${crear ? 'lg:translate-x-full' : ''}`}>
        <FondoPortada />
        <div className="relative z-10 flex h-full flex-col justify-between p-14">
          <a href="/" onClick={(e) => { e.preventDefault(); ir('/') }} aria-label="NexoPatin, inicio" className="inline-flex w-fit"><Logo className="text-[24px]" /></a>
          <p className="max-w-[520px] text-[clamp(32px,3.2vw,48px)] font-bold leading-[1.1] tracking-[-0.02em] text-balance">
            {crear ? 'Bienvenido' : 'Bienvenido de nuevo'}
          </p>
        </div>
      </aside>

      <main className={`flex min-h-screen flex-col px-6 py-8 md:px-14 lg:absolute lg:inset-y-0 lg:right-0 lg:min-h-0 lg:w-1/2 lg:overflow-y-auto motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-[cubic-bezier(.16,1,.3,1)] ${crear ? 'lg:-translate-x-full' : ''}`}>
        <a href="/" onClick={(e) => { e.preventDefault(); ir('/') }} aria-label="NexoPatin, inicio" className="inline-flex w-fit lg:invisible"><Logo className="text-[22px]" /></a>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">
          <h1 className="text-[36px] font-bold leading-[1.1] tracking-[-0.02em]">{crear ? 'Crea tu cuenta' : 'Inicia sesión'}</h1>
          <p className="mt-3 text-[16px] text-muted">{crear ? 'Con tu cuenta podrás planificar la noche de la flota.' : 'Entra para planificar la noche de la flota.'}</p>

          <form ref={formRef} onSubmit={enviar} noValidate className="mt-10 space-y-5">
            {crear && (
              <Campo id="nombre" etiqueta="Nombre de usuario" error={errores.nombre}>
                <input id="nombre" name="nombre" type="text" autoComplete="name" value={v.nombre} onChange={cambia('nombre')} className={CAMPO} {...aria('nombre')} />
              </Campo>
            )}
            <Campo id="correo" etiqueta={crear ? 'Correo electrónico' : 'Usuario o correo'} error={errores.correo}>
              <input id="correo" name="correo" type={crear ? 'email' : 'text'} autoComplete={crear ? 'email' : 'username'} value={v.correo} onChange={cambia('correo')} placeholder={crear ? 'nombre@empresa.com' : undefined} className={CAMPO} {...aria('correo')} />
            </Campo>
            <Campo id="clave" etiqueta="Contraseña" error={errores.clave}>
              <div className="relative">
                <input id="clave" name="clave" type={ver ? 'text' : 'password'} autoComplete={crear ? 'new-password' : 'current-password'} value={v.clave} onChange={cambia('clave')} className={`${CAMPO} pr-24`} {...aria('clave')} />
                <button type="button" onClick={() => setVer((a) => !a)} aria-pressed={ver} className="absolute right-2 top-1/2 h-9 -translate-y-1/2 rounded-md px-3 text-[14px] font-medium text-muted hover:text-ink">
                  {ver ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </Campo>
            {crear && (
              <Campo id="clave2" etiqueta="Repite la contraseña" error={errores.clave2}>
                <input id="clave2" name="clave2" type={ver ? 'text' : 'password'} autoComplete="new-password" value={v.clave2} onChange={cambia('clave2')} className={CAMPO} {...aria('clave2')} />
              </Campo>
            )}
            {fallo && <p role="alert" className="text-[14px] text-negative">{fallo}</p>}
            <button type="submit" disabled={enviando} className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-cta px-6 text-[16px] font-medium text-white hover:bg-cta-hover disabled:opacity-60 active:scale-[.99] transition-[background-color,transform]">
              {enviando ? 'Un momento…' : crear ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </form>

          <p className="mt-8 text-[15px] text-muted">
            {crear ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
            <button type="button" onClick={cambiaModo} className="font-medium text-ink underline underline-offset-4">{crear ? 'Inicia sesión' : 'Crea una'}</button>
          </p>
        </div>
      </main>
    </div>
  )
}
