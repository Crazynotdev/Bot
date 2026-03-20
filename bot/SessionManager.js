'use strict'

// ╔═══════════════════════════════════════════════════════════╗
// ║             CRAZY MD — Session Manager Pro                ║
// ║     Multi-sessions · Pairing Code · Auto-reconnect        ║
// ╚═══════════════════════════════════════════════════════════╝

const {
makeWASocket,
useMultiFileAuthState,
DisconnectReason,
makeCacheableSignalKeyStore,
fetchLatestBaileysVersion,
Browsers,
jidNormalizedUser,
proto,
downloadMediaMessage,
areJidsSameUser,
} = require(’@whiskeysockets/baileys’)

const path    = require(‘path’)
const fs      = require(‘fs’)
const P       = require(‘pino’)
const handler = require(’./handler’)

// ─── Chemins ────────────────────────────────────────────────
const SESSIONS_DIR  = path.join(__dirname, ‘..’, ‘sessions’)
const WELCOME_IMAGE = path.join(__dirname, ‘..’, ‘assets’, ‘welcome.jpg’)

// ─── Logger coloré ──────────────────────────────────────────
const log = {
info:  (…a) => console.log(’\x1b[36m[INFO]\x1b[0m’, …a),
ok:    (…a) => console.log(’\x1b[32m[ OK ]\x1b[0m’, …a),
warn:  (…a) => console.log(’\x1b[33m[WARN]\x1b[0m’, …a),
error: (…a) => console.error(’\x1b[31m[ERR ]\x1b[0m’, …a),
msg:   (…a) => console.log(’\x1b[35m[ MSG]\x1b[0m’, …a),
}

// ─── Constantes ─────────────────────────────────────────────
const PAIRING_WAIT_MS     = 2_000
const RECONNECT_BASE_MS   = 5_000
const MAX_RECONNECT_TRIES = 10

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ════════════════════════════════════════════════════════════
class SessionManager {
constructor(io) {
this.io       = io
/** @type {Map<string, object>} */
this.sessions = new Map()
/** @type {Map<string, number>} */
this._retries = new Map()


if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })
this._restoreAll()


}

// ══════════════════════════════════════════════════════════
// createSession — crée ou reconnecte une session Baileys
// ══════════════════════════════════════════════════════════
async createSession(number) {
const id      = ‘bot_’ + number.replace(/\D/g, ‘’)
const sessDir = path.join(SESSIONS_DIR, id)

if (this.sessions.has(id)) await this._close(id)
if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true })

const session = {
  id, number,
  status:    'connecting',
  sock:      null,
  store:     {},           // cache messages pour reply/download
  createdAt: new Date(),
  lastSeen:  new Date(),
}
this.sessions.set(id, session)
this._push()

const { state, saveCreds } = await useMultiFileAuthState(sessDir)
const { version }          = await fetchLatestBaileysVersion()

log.info(`[${id}] Baileys v${version.join('.')}`)

const sock = makeWASocket({
  version,
  logger:              P({ level: 'silent' }),
  printQRInTerminal:   false,
  auth: {
    creds: state.creds,
    keys:  makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' })),
  },
  browser:                        Browsers.macOS('Desktop'),
  syncFullHistory:                false,
  markOnlineOnConnect:            false,
  generateHighQualityLinkPreview: false,
  fireInitQueries:                true,
  emitOwnEvents:                  false,
  // Nécessaire pour recevoir les messages en tant que linked device
  getMessage: async (key) => {
    const stored = session.store[key.id]
    if (stored) return stored
    return { conversation: '' }
  },
})

session.sock = sock
this.sessions.set(id, session)

sock.ev.on('creds.update', saveCreds)

// ── Cache les messages pour permettre les downloads ────
sock.ev.on('messages.upsert', ({ messages }) => {
  for (const m of messages) {
    if (m.message) session.store[m.key.id] = m.message
  }
})

this._onConnectionUpdate(sock, session, number)
this._onMessages(sock, session)
this._onGroupUpdate(sock, session)
this._onPresenceUpdate(sock, session)

// ── Pairing code ───────────────────────────────────────
if (!state.creds.registered) {
  await sleep(PAIRING_WAIT_MS)
  const clean = number.replace(/\D/g, '')
  const code  = await sock.requestPairingCode(clean)
  log.ok(`[${id}] Code → ${code}`)
  session.status = 'pending'
  this.sessions.set(id, session)
  this._push()
  return code
}

log.info(`[${id}] Session existante — reconnexion directe`)
return null

}

// ══════════════════════════════════════════════════════════
// remove
// ══════════════════════════════════════════════════════════
async remove(id) {
await this._close(id)
this._deleteFiles(id)
this.sessions.delete(id)
this._retries.delete(id)
this._push()
log.warn(`[${id}] Supprimé`)
}

getAll() {
return […this.sessions.values()].map(s => ({
id: s.id, number: s.number, status: s.status,
createdAt: s.createdAt, lastSeen: s.lastSeen,
}))
}

cleanExpired(days) {
const limit = days * 86_400_000
for (const [id, s] of this.sessions)
if (s.status !== ‘connected’ && Date.now() - new Date(s.lastSeen).getTime() > limit)
this.remove(id)
}

// ══════════════════════════════════════════════════════════
// _onConnectionUpdate
// ══════════════════════════════════════════════════════════
_onConnectionUpdate(sock, session, number) {
const { id } = session


sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
  session.lastSeen = new Date()

  if (connection === 'open') {
    session.status = 'connected'
    this.sessions.set(id, session)
    this._retries.set(id, 0)
    this._push()
    this.io.emit('bot:connected', { id, number })
    log.ok(`[${id}] ✓ Connecté — ${number}`)

    // Message de bienvenue après 2s
    await sleep(2000)
    await this._sendWelcome(sock, number)
  }

  if (connection === 'close') {
    const code      = lastDisconnect?.error?.output?.statusCode
    const loggedOut = code === DisconnectReason.loggedOut
    const retries   = this._retries.get(id) || 0

    log.warn(`[${id}] Déconnecté (code ${code}) — essai ${retries}/${MAX_RECONNECT_TRIES}`)

    if (loggedOut) {
      session.status = 'disconnected'
      this.sessions.set(id, session)
      this._push()
      this._deleteFiles(id)
      this.io.emit('bot:disconnected', { id, number })
      log.error(`[${id}] Logged out — session supprimée`)
    } else if (retries < MAX_RECONNECT_TRIES) {
      session.status = 'reconnecting'
      this.sessions.set(id, session)
      this._push()
      this._retries.set(id, retries + 1)
      const delay = Math.min(RECONNECT_BASE_MS * (retries + 1), 60_000)
      log.info(`[${id}] Reconnexion dans ${delay / 1000}s...`)
      setTimeout(() => this.createSession(number).catch(e => log.error(`[${id}]`, e.message)), delay)
    } else {
      session.status = 'disconnected'
      this.sessions.set(id, session)
      this._push()
      log.error(`[${id}] Max reconnexions atteint`)
    }
  }
})

}

// ══════════════════════════════════════════════════════════
// _onMessages — traitement ultra-rapide
// ══════════════════════════════════════════════════════════
_onMessages(sock, session) {
const { id } = session
  
sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return

  // Traitement parallèle de tous les messages reçus
  await Promise.allSettled(messages.map(async (msg) => {
    if (msg.key.fromMe)                             return
    if (!msg.message)                               return
    if (msg.key.remoteJid === 'status@broadcast')  return

    session.lastSeen = new Date()
    this.sessions.set(id, session)

    const text = extractText(msg)
    log.msg(`[${id}] ← ${msg.key.remoteJid} : "${text}"`)

    await handler(sock, msg).catch(err =>
      log.error(`[${id}] Handler:`, err.message)
    )
  }))
})
}

// ══════════════════════════════════════════════════════════
// _onGroupUpdate — events groupe
// ══════════════════════════════════════════════════════════
_onGroupUpdate(sock, session) {
// Notifie quand le bot rejoint un groupe
sock.ev.on(‘groups.upsert’, async (groups) => {
for (const group of groups) {
log.info(`[${session.id}] Rejoint le groupe: ${group.subject}`)
}
})
// Notifie les changements participants
sock.ev.on('group-participants.update', async ({ id: gid, participants, action }) => {
  log.info(`[${session.id}] Groupe ${gid} — action: ${action} — ${participants.join(', ')}`)
})
}

// ══════════════════════════════════════════════════════════
// _onPresenceUpdate — présence en ligne
// ══════════════════════════════════════════════════════════
_onPresenceUpdate(sock, session) {
sock.ev.on(‘presence.update’, ({ id: jid, presences }) => {
// Disponible si tu veux tracker les présences
})
}

// ══════════════════════════════════════════════════════════
// _sendWelcome
// ══════════════════════════════════════════════════════════
async _sendWelcome(sock, number) {
try {
const jid     = jidNormalizedUser(number.replace(/\D/g, ‘’) + ‘@s.whatsapp.net’)
const hasImg  = fs.existsSync(WELCOME_IMAGE)

  const caption =
    `╔═══════════════════════╗\n` +
    `║   ⚡ *CRAZY MD v2*     ║\n` +
    `╚═══════════════════════╝\n\n` +
    `✅ *Bot connecté avec succès !*\n\n` +
    `📱 Numéro : *${number}*\n` +
    `🕐 Heure  : *${new Date().toLocaleTimeString('fr-FR')}*\n` +
    `📅 Date   : *${new Date().toLocaleDateString('fr-FR')}*\n\n` +
    `💡 Tapez *!menu* pour voir toutes les commandes.\n\n` +
    `_⚡ Powered by CRAZY MD_`

  if (hasImg) {
    await sock.sendMessage(jid, {
      image:    fs.readFileSync(WELCOME_IMAGE),
      caption,
      mimetype: 'image/jpeg',
    })
  } else {
    await sock.sendMessage(jid, { text: caption })
  }

  log.ok(`[${number}] Message de bienvenue envoyé`)
} catch (err) {
  log.warn(`Welcome: ${err.message}`)
}
}

// ══════════════════════════════════════════════════════════
// Utilitaires privés
// ══════════════════════════════════════════════════════════
async *close(id) {
const s = this.sessions.get(id)
if (s?.sock) try { s.sock.end(undefined) } catch (*) {}
}

_deleteFiles(id) {
const dir = path.join(SESSIONS_DIR, id)
if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

_push() {
this.io.emit(‘sessions:update’, this.getAll())
}

*restoreAll() {
if (!fs.existsSync(SESSIONS_DIR)) return
const dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
.filter(d => d.isDirectory() && d.name.startsWith(’bot*’))
log.info(`[RESTORE] ${dirs.length} session(s) trouvée(s)`)
for (const d of dirs) {
const number = ‘+’ + d.name.replace(‘bot_’, ‘’)
this.createSession(number).catch(err =>
log.error(`[RESTORE] ${d.name}:`, err.message)
)
}
}
}

// ─── Extrait le texte de tous les types de messages ─────────
function extractText(msg) {
const m = msg.message
if (!m) return ‘’
return (
m.conversation                                    ||
m.extendedTextMessage?.text                       ||
m.imageMessage?.caption                           ||
m.videoMessage?.caption                           ||
m.documentMessage?.caption                        ||
m.buttonsResponseMessage?.selectedDisplayText     ||
m.listResponseMessage?.title                      ||
m.templateButtonReplyMessage?.selectedDisplayText ||
‘’
).trim()
}

module.exports = SessionManager
