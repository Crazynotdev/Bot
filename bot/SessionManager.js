'use strict'

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers,
} = require('@whiskeysockets/baileys')

const path    = require('path')
const fs      = require('fs')
const P       = require('pino')
const handler = require('./handler')

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions')

class SessionManager {
  constructor(io) {
    this.io       = io
    this.sessions = new Map()
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })
    this._restoreAll()
  }

  async createSession(number) {
    const id      = 'bot_' + number.replace(/\D/g, '')
    const sessDir = path.join(SESSIONS_DIR, id)

    if (this.sessions.has(id)) await this._close(id)
    if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true })

    const session = { id, number, status: 'connecting', sock: null, createdAt: new Date(), lastSeen: new Date() }
    this.sessions.set(id, session)
    this._push()

    const { state, saveCreds } = await useMultiFileAuthState(sessDir)
    const { version }          = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      logger:              P({ level: 'silent' }),
      printQRInTerminal:   false,
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' })),
      },
      browser:             Browsers.macOS('Desktop'),
      syncFullHistory:     false,
      markOnlineOnConnect: true,
      retryRequestDelayMs: 350,
    })

    session.sock = sock
    this.sessions.set(id, session)

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      session.lastSeen = new Date()
      if (connection === 'open') {
        session.status = 'connected'
        this.sessions.set(id, session)
        this._push()
        this.io.emit('bot:connected', { id, number })
        console.log(`  ✓ [${id}] connecté`)
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
        if (code === DisconnectReason.loggedOut) {
          session.status = 'disconnected'
          this.sessions.set(id, session)
          this._push()
          this._deleteFiles(id)
          this.io.emit('bot:disconnected', { id, number })
        } else {
          session.status = 'reconnecting'
          this.sessions.set(id, session)
          this._push()
          setTimeout(() => this.createSession(number).catch(console.error), 5000)
        }
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return
      session.lastSeen = new Date()
      this.sessions.set(id, session)
      for (const msg of messages) {
        if (msg.key.fromMe) continue
        await handler(sock, msg).catch(console.error)
      }
    })

    if (!state.creds.registered) {
      await new Promise(r => setTimeout(r, 2000))
      const code = await sock.requestPairingCode(number.replace(/\D/g, ''))
      session.status = 'pending'
      this.sessions.set(id, session)
      this._push()
      return code
    }

    return null
  }

  async remove(id) {
    await this._close(id)
    this._deleteFiles(id)
    this.sessions.delete(id)
    this._push()
  }

  getAll() {
    return [...this.sessions.values()].map(s => ({
      id: s.id, number: s.number, status: s.status,
      createdAt: s.createdAt, lastSeen: s.lastSeen,
    }))
  }

  cleanExpired(days) {
    const limit = days * 86400000
    for (const [id, s] of this.sessions) {
      if (s.status !== 'connected' && Date.now() - new Date(s.lastSeen).getTime() > limit)
        this.remove(id)
    }
  }

  async _close(id) {
    const s = this.sessions.get(id)
    if (s?.sock) try { s.sock.end() } catch (_) {}
  }

  _deleteFiles(id) {
    const dir = path.join(SESSIONS_DIR, id)
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  }

  _push() {
    this.io.emit('sessions:update', this.getAll())
  }

  _restoreAll() {
    if (!fs.existsSync(SESSIONS_DIR)) return
    fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .forEach(d => {
        const number = '+' + d.name.replace('bot_', '')
        this.createSession(number).catch(console.error)
      })
  }
}

module.exports = SessionManager
