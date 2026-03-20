'use strict'

const express    = require('express')
const http       = require('http')
const { Server } = require('socket.io')
const path       = require('path')
const cron       = require('node-cron')
const SessionManager = require('./bot/SessionManager')

const app    = express()
const server = http.createServer(app)
const io     = new Server(server, { cors: { origin: '*' }, pingTimeout: 60000 })
const PORT   = process.env.PORT || 3000
const manager = new SessionManager(io)

global.io      = io
global.manager = manager

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// ── API ──────────────────────────────────────────────────

app.post('/api/pair', async (req, res) => {
  const { number } = req.body || {}
  const clean = (number || '').trim()
  if (!clean || !/^\+\d{7,15}$/.test(clean))
    return res.status(400).json({ ok: false, error: 'Numéro invalide. Ex: +33612345678' })
  try {
    const code = await manager.createSession(clean)
    res.json({ ok: true, code, id: 'bot_' + clean.replace(/\D/g, '') })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/api/sessions', (req, res) => {
  res.json({ ok: true, sessions: manager.getAll() })
})

app.delete('/api/session/:id', async (req, res) => {
  await manager.remove(req.params.id)
  res.json({ ok: true })
})

// ── WEBSOCKET ─────────────────────────────────────────────
io.on('connection', socket => {
  socket.emit('sessions:update', manager.getAll())
})

// ── CRON nettoyage sessions inactives > 5 jours ──────────
cron.schedule('0 */6 * * *', () => manager.cleanExpired(5))

// ── START ─────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n  ⚡ CRAZY MD → http://localhost:${PORT}\n`)
})
