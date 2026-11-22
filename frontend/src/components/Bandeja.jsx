import React from 'react'
import { Boton, Insignia, IconCerrar, IconFlecha, IconRuta } from './ui.jsx'
import { LETRAS, nombrePlan, resumenRuta } from '../utils.js'

// Bandeja de hasta 3 planes (huecos A, B, C) bajo el título de Opciones
export default function Bandeja({ bandeja, quitar, onCrear, onComparar, aviso }) {
  const n = bandeja.filter(Boolean).length
  return (
    <section className="bg-white border border-border rounded-2xl px-5 py-3 flex items-center gap-4 mb-3" aria-label="Tu bandeja">
      <div className="w-[170px] shrink-0">
        <div className="font-bold text-[16px]">Tu bandeja</div>
        <div className={`text-[12.5px] leading-snug ${aviso ? 'text-warning-ink font-medium' : 'text-muted'}`} role={aviso ? 'alert' : undefined}>
          {aviso || (n < 2 ? 'Elige al menos 2 planes (puedes crear uno propio)' : 'hasta 3 planes para comparar')}
        </div>
      </div>
      {bandeja.map((p, i) => (
        p ? (
          <div key={i} className="flex-1 min-w-0 bg-surface rounded-xl pl-3 pr-2 py-2.5 flex items-center gap-3">
            <Insignia letra={LETRAS[i]} size={28} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="font-semibold truncate">{nombrePlan(p, i)}</div>
              <div className="text-[12.5px] text-muted truncate">{resumenRuta(p.ruta).join(' · ')}</div>
            </div>
            <button onClick={() => quitar(i)} aria-label={`Quitar ${nombrePlan(p, i)} del hueco ${LETRAS[i]}`} className="w-7 h-7 rounded-full inline-flex items-center justify-center text-muted hover:bg-border"><IconCerrar size={16} /></button>
          </div>
        ) : (
          <div key={i} className="flex-1 min-w-0 border border-dashed border-border-strong rounded-xl px-3 py-2.5 flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-border-strong text-white inline-flex items-center justify-center font-bold text-[14px] shrink-0">{LETRAS[i]}</span>
            <div className="text-[12.5px] text-muted leading-snug">Hueco libre · elige un plan de la tabla o crea uno propio</div>
          </div>
        )
      ))}
      <Boton variante="borde" onClick={onCrear}><IconRuta size={18} /> Crear plan propio</Boton>
      <Boton variante="primario" disabled={n < 2} onClick={onComparar}>Comparar{n >= 2 ? ` ${n}` : ''} planes <IconFlecha size={18} /></Boton>
    </section>
  )
}
