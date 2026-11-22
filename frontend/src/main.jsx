import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Admin from './Admin.jsx'

const esAdmin = window.location.pathname.startsWith('/admin')
createRoot(document.getElementById('root')).render(esAdmin ? <Admin /> : <App />)
