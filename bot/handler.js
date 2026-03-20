‘use strict’

// ╔═══════════════════════════════════════════════════════════╗
// ║              CRAZY MD — Bot Handler Pro                   ║
// ║                                                           ║
// ║  ➕ Ajouter une commande :                                ║
// ║     case ‘cmd’: {                                         ║
// ║       await reply(sock, msg, ‘texte’)                     ║
// ║       break                                               ║
// ║     }                                                     ║
// ╚═══════════════════════════════════════════════════════════╝

const axios              = require(‘axios’)
const fs                 = require(‘fs’)
const path               = require(‘path’)
const { downloadMediaMessage, jidNormalizedUser } = require(’@whiskeysockets/baileys’)

// ════════════════════════════════════════════════════════════
// ⚙️  CONFIG — Tout modifier ici
// ════════════════════════════════════════════════════════════
const CONFIG = {
PREFIX:     ‘.’,
BOT_NAME:   ‘CRAZY MD’,
VERSION:    ‘v2.0’,
OWNER_NUM:  ‘24105730123’,              // ex: ‘+33612345678’
ASSETS_DIR: path.join(__dirname, ‘..’, ‘assets’),
}

// ════════════════════════════════════════════════════════════
// 🛠  HELPERS — Réutilisables partout
// ════════════════════════════════════════════════════════════

/** Répond en citant */
const reply = (sock, msg, text) =>
sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg })

/** Envoie sans citer */
const send = (sock, jid, text) =>
sock.sendMessage(jid, { text })

/** Réaction emoji */
const react = (sock, msg, emoji) =>
sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } })

/** Image depuis URL */
const sendImageUrl = (sock, msg, url, caption = ‘’) =>
sock.sendMessage(msg.key.remoteJid, { image: { url }, caption }, { quoted: msg })

/** Image depuis fichier local */
const sendImageFile = (sock, msg, filePath, caption = ‘’) =>
sock.sendMessage(msg.key.remoteJid,
{ image: fs.readFileSync(filePath), caption, mimetype: ‘image/jpeg’ },
{ quoted: msg }
)

/** Vidéo depuis URL */
const sendVideoUrl = (sock, msg, url, caption = ‘’) =>
sock.sendMessage(msg.key.remoteJid, { video: { url }, caption }, { quoted: msg })

/** Audio depuis fichier */
const sendAudio = (sock, msg, filePath) =>
sock.sendMessage(msg.key.remoteJid,
{ audio: fs.readFileSync(filePath), mimetype: ‘audio/mp4’, ptt: true },
{ quoted: msg }
)

/** Document */
const sendDoc = (sock, msg, filePath, filename = ‘file’) =>
sock.sendMessage(msg.key.remoteJid,
{ document: fs.readFileSync(filePath), fileName: filename, mimetype: ‘application/octet-stream’ },
{ quoted: msg }
)

/** Envoie un sticker depuis un buffer */
const sendSticker = (sock, msg, buffer) =>
sock.sendMessage(msg.key.remoteJid, { sticker: buffer }, { quoted: msg })

/** Envoie des boutons */
const sendButtons = (sock, msg, text, buttons, footer = ‘’) =>
sock.sendMessage(msg.key.remoteJid, {
text, footer,
buttons: buttons.map((b, i) => ({
buttonId:   `btn_${i}`,
buttonText: { displayText: b },
type:       1,
})),
headerType: 1,
})

/** Envoie une liste */
const sendList = (sock, msg, title, text, btnText, sections) =>
sock.sendMessage(msg.key.remoteJid, {
title, text,
buttonText: btnText,
sections,
listType:   1,
})

/** Mentionne des JIDs dans un message */
const sendMention = (sock, jid, text, mentionJids) =>
sock.sendMessage(jid, { text, mentions: mentionJids })

/** Extrait le texte de tous les types de messages */
function getText(msg) {
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

/** Message cité */
const getQuoted  = msg => msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || null
/** Type du message cité */
const getQuotedType = msg => {
const q = getQuoted(msg)
if (!q) return null
return Object.keys(q).find(k => k !== ‘senderKeyDistributionMessage’ && q[k])
}
/** Mentions dans le message */
const getMentions = msg => msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
/** Vrai si c’est un groupe */
const isGroup     = msg => msg.key.remoteJid?.endsWith(’@g.us’)
/** Vrai si c’est un message privé */
const isPrivate   = msg => !msg.key.remoteJid?.endsWith(’@g.us’)

/** Uptime formaté */
function uptime() {
const s = Math.floor(process.uptime())
const parts = [
Math.floor(s / 86400) && `${Math.floor(s / 86400)}j`,
Math.floor((s % 86400) / 3600) && `${Math.floor((s % 86400) / 3600)}h`,
Math.floor((s % 3600) / 60) && `${Math.floor((s % 3600) / 60)}m`,
`${s % 60}s`,
].filter(Boolean)
return parts.join(’ ’)
}

/** Pause */
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Emoji météo selon le code wttr.in */
function weatherEmoji(code) {
const c = parseInt(code)
if (c <= 113) return ‘☀️’
if (c <= 116) return ‘⛅’
if (c <= 119) return ‘☁️’
if (c <= 143) return ‘🌫’
if (c <= 176) return ‘🌦’
if (c <= 260) return ‘🌧’
if (c <= 296) return ‘🌨’
if (c <= 395) return ‘❄️’
return ‘🌩’
}

// ════════════════════════════════════════════════════════════
// ⚡ HANDLER PRINCIPAL
// ════════════════════════════════════════════════════════════
async function handler(sock, msg) {
const text = getText(msg)
if (!text || !text.startsWith(CONFIG.PREFIX)) return

const jid         = msg.key.remoteJid
const sender      = msg.key.participant || jid
const senderNum   = sender.replace(’@s.whatsapp.net’, ‘’).replace(/\D/g, ‘’)
const isOwner     = !!CONFIG.OWNER_NUM && CONFIG.OWNER_NUM.replace(/\D/g, ‘’) === senderNum
const parts       = text.slice(CONFIG.PREFIX.length).trim().split(/\s+/)
const cmd         = parts[0].toLowerCase()
const args        = parts.slice(1)
const body        = args.join(’ ’)
const quoted      = getQuoted(msg)
const quotedType  = getQuotedType(msg)
const mentions    = getMentions(msg)

// Réaction instantanée
await react(sock, msg, ‘⚡’).catch(() => {})

switch (cmd) {

// ╔═══════════════════════════════════════╗
// ║           GÉNÉRAL                     ║
// ╚═══════════════════════════════════════╝

case 'ping': {
  const start = Date.now()
  await reply(sock, msg, `🏓 *Pong!* — Latence : *${Date.now() - start}ms*`)
  break
}

case 'menu':
case 'help':
case 'aide': {
  await reply(sock, msg,
    `╔════════════════════════════╗\n` +
    `║   ⚡ *${CONFIG.BOT_NAME} ${CONFIG.VERSION}*      ║\n` +
    `╚════════════════════════════╝\n\n` +

    `*━━━ 🔧 GÉNÉRAL ━━━*\n` +
    `❯ *${CONFIG.PREFIX}ping* — Latence\n` +
    `❯ *${CONFIG.PREFIX}info* — Infos système\n` +
    `❯ *${CONFIG.PREFIX}uptime* — Temps actif\n` +
    `❯ *${CONFIG.PREFIX}owner* — Contact owner\n` +
    `❯ *${CONFIG.PREFIX}time* — Heure & date\n\n` +

    `*━━━ 👤 PROFIL ━━━*\n` +
    `❯ *${CONFIG.PREFIX}id* — Votre JID\n` +
    `❯ *${CONFIG.PREFIX}whoami* — Vos infos\n` +
    `❯ *${CONFIG.PREFIX}pp* [@user] — Photo profil\n` +
    `❯ *${CONFIG.PREFIX}bio* [@user] — Statut WhatsApp\n` +
    `❯ *${CONFIG.PREFIX}presence* — Activer présence\n\n` +

    `*━━━ 🛠 OUTILS ━━━*\n` +
    `❯ *${CONFIG.PREFIX}sticker* — Image → Sticker\n` +
    `❯ *${CONFIG.PREFIX}toimg* — Sticker → Image\n` +
    `❯ *${CONFIG.PREFIX}calc* [expr] — Calculatrice\n` +
    `❯ *${CONFIG.PREFIX}b64* [txt] — Encode Base64\n` +
    `❯ *${CONFIG.PREFIX}decodeb64* [txt] — Décode B64\n` +
    `❯ *${CONFIG.PREFIX}upper* [txt] — MAJUSCULES\n` +
    `❯ *${CONFIG.PREFIX}lower* [txt] — minuscules\n` +
    `❯ *${CONFIG.PREFIX}count* [txt] — Compte mots\n` +
    `❯ *${CONFIG.PREFIX}reverse* [txt] — Inverser texte\n` +
    `❯ *${CONFIG.PREFIX}repeat* [n] [txt] — Répéter\n` +
    `❯ *${CONFIG.PREFIX}meteo* [ville] — Météo\n` +
    `❯ *${CONFIG.PREFIX}blague* — Blague aléatoire\n` +
    `❯ *${CONFIG.PREFIX}cite* — Citation motivante\n` +
    `❯ *${CONFIG.PREFIX}define* [mot] — Définition\n\n` +

    `*━━━ 💬 MESSAGES ━━━*\n` +
    `❯ *${CONFIG.PREFIX}dm* @user [txt] — Message privé\n` +
    `❯ *${CONFIG.PREFIX}annonce* [txt] — Annonce groupe\n` +
    `❯ *${CONFIG.PREFIX}forward* — Transférer message cité\n` +
    `❯ *${CONFIG.PREFIX}delete* — Supprimer message cité\n\n` +

    `*━━━ 👥 GROUPE ━━━*\n` +
    `❯ *${CONFIG.PREFIX}tagall* — Mentionner tout le monde\n` +
    `❯ *${CONFIG.PREFIX}members* — Liste membres\n` +
    `❯ *${CONFIG.PREFIX}kick* @user — Exclure\n` +
    `❯ *${CONFIG.PREFIX}add* [num] — Ajouter\n` +
    `❯ *${CONFIG.PREFIX}promote* @user — Promouvoir admin\n` +
    `❯ *${CONFIG.PREFIX}demote* @user — Rétrograder\n` +
    `❯ *${CONFIG.PREFIX}desc* [txt] — Changer description\n` +
    `❯ *${CONFIG.PREFIX}subject* [txt] — Changer nom groupe\n` +
    `❯ *${CONFIG.PREFIX}mute* — Lecture seule\n` +
    `❯ *${CONFIG.PREFIX}unmute* — Ouvrir messages\n` +
    `❯ *${CONFIG.PREFIX}groupinfo* — Infos du groupe\n` +
    `❯ *${CONFIG.PREFIX}link* — Lien d'invitation\n` +
    `❯ *${CONFIG.PREFIX}revoke* — Révoquer lien invite\n\n` +

    `> _Préfixe : *${CONFIG.PREFIX}* · ${CONFIG.BOT_NAME} ${CONFIG.VERSION}_`
  )
  break
}

case 'info': {
  const mem = process.memoryUsage()
  await reply(sock, msg,
    `⚡ *${CONFIG.BOT_NAME} ${CONFIG.VERSION}*\n\n` +
    `📱 Numéro : *${sock.user?.id?.split(':')[0] || 'N/A'}*\n` +
    `✅ Statut : *En ligne*\n` +
    `⏱ Uptime : *${uptime()}*\n` +
    `🔢 Node.js : *${process.version}*\n` +
    `💾 RAM utilisée : *${Math.round(mem.heapUsed / 1024 / 1024)} MB*\n` +
    `💻 RAM totale : *${Math.round(mem.heapTotal / 1024 / 1024)} MB*\n` +
    `🖥 Plateforme : *${process.platform}*\n` +
    `📅 *${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}*\n` +
    `🕐 *${new Date().toLocaleTimeString('fr-FR')}*`
  )
  break
}

case 'uptime': {
  await reply(sock, msg, `⏱ *Uptime :* ${uptime()}`)
  break
}

case 'time': {
  await reply(sock, msg,
    `🕐 *${new Date().toLocaleTimeString('fr-FR')}*\n` +
    `📅 *${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}*`
  )
  break
}

case 'owner': {
  await reply(sock, msg,
    CONFIG.OWNER_NUM
      ? `👑 *Owner :* ${CONFIG.OWNER_NUM}`
      : `👑 *${CONFIG.BOT_NAME}* — Contactez le support.`
  )
  break
}

// ╔═══════════════════════════════════════╗
// ║           PROFIL                      ║
// ╚═══════════════════════════════════════╝

case 'id': {
  await reply(sock, msg, `🆔 *Votre JID :*\n\`${jid}\``)
  break
}

case 'whoami': {
  await reply(sock, msg,
    `👤 *Vos informations*\n\n` +
    `• JID : \`${sender}\`\n` +
    `• Numéro : *+${senderNum}*\n` +
    `• Contexte : ${isGroup(msg) ? '👥 Groupe' : '💬 Privé'}\n` +
    `• Owner : ${isOwner ? '✅ Oui' : '❌ Non'}`
  )
  break
}

case 'pp': {
  const target = mentions[0] || sender
  try {
    const url = await sock.profilePictureUrl(target, 'image')
    await sendImageUrl(sock, msg, url,
      `📸 *Photo de profil*\n+${target.split('@')[0]}`
    )
  } catch {
    await reply(sock, msg, '❌ Aucune photo de profil disponible ou profil privé.')
  }
  break
}

case 'bio': {
  const target = mentions[0] || sender
  try {
    const status = await sock.fetchStatus(target)
    await reply(sock, msg,
      `📝 *Statut WhatsApp*\n\n` +
      `👤 +${target.split('@')[0]}\n` +
      `💬 ${status?.status || 'Aucun statut'}`
    )
  } catch {
    await reply(sock, msg, '❌ Impossible de récupérer le statut.')
  }
  break
}

case 'presence': {
  try {
    await sock.sendPresenceUpdate('available', jid)
    await reply(sock, msg, '✅ Présence activée — le bot apparaît *En ligne*.')
  } catch {
    await reply(sock, msg, '❌ Erreur lors de l\'activation de la présence.')
  }
  break
}

// ╔═══════════════════════════════════════╗
// ║           OUTILS                      ║
// ╚═══════════════════════════════════════╝

case 'sticker': {
  if (!quoted?.imageMessage && !quoted?.videoMessage) {
    await reply(sock, msg, `📎 *Citez une image* puis tapez *${CONFIG.PREFIX}sticker*`)
    break
  }
  await react(sock, msg, '⏳')
  try {
    const buffer = await downloadMediaMessage(
      { message: quoted, key: msg.key }, 'buffer', {},
      { logger: require('pino')({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
    )
    await sendSticker(sock, msg, buffer)
    await react(sock, msg, '✅')
  } catch (err) {
    await reply(sock, msg, `❌ Échec création sticker.\n_${err.message}_`)
  }
  break
}

case 'toimg': {
  // Convertit un sticker cité en image
  if (!quoted?.stickerMessage) {
    await reply(sock, msg, `📎 *Citez un sticker* puis tapez *${CONFIG.PREFIX}toimg*`)
    break
  }
  await react(sock, msg, '⏳')
  try {
    const buffer = await downloadMediaMessage(
      { message: quoted, key: msg.key }, 'buffer', {},
      { logger: require('pino')({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
    )
    await sock.sendMessage(jid,
      { image: buffer, caption: '🖼 Sticker converti en image', mimetype: 'image/webp' },
      { quoted: msg }
    )
    await react(sock, msg, '✅')
  } catch (err) {
    await reply(sock, msg, `❌ Échec conversion.\n_${err.message}_`)
  }
  break
}

case 'calc': {
  if (!body) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}calc* 3*(4+2)/2`); break }
  try {
    if (!/^[\d\s\+\-\*\/\.\(\)%\^]+$/.test(body)) throw new Error('Expression invalide')
    // eslint-disable-next-line no-new-func
    const result = Function(`'use strict'; return (${body.replace(/\^/g, '**')})`)()
    if (!isFinite(result)) throw new Error('Division par zéro')
    await reply(sock, msg, `🧮 \`${body}\`\n📊 Résultat : *${result}*`)
  } catch (e) {
    await reply(sock, msg, `❌ ${e.message}\nEx : \`${CONFIG.PREFIX}calc 3^2+4\``)
  }
  break
}

case 'b64': {
  if (!body) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}b64* [texte]`); break }
  await reply(sock, msg, `🔐 *Base64 :*\n\`${Buffer.from(body).toString('base64')}\``)
  break
}

case 'decodeb64': {
  if (!body) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}decodeb64* [base64]`); break }
  try {
    const decoded = Buffer.from(body, 'base64').toString('utf8')
    await reply(sock, msg, `🔓 *Décodé :*\n${decoded}`)
  } catch {
    await reply(sock, msg, '❌ Base64 invalide.')
  }
  break
}

case 'upper': {
  if (!body) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}upper* [texte]`); break }
  await reply(sock, msg, `🔠 ${body.toUpperCase()}`)
  break
}

case 'lower': {
  if (!body) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}lower* [texte]`); break }
  await reply(sock, msg, `🔡 ${body.toLowerCase()}`)
  break
}

case 'count': {
  if (!body) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}count* [texte]`); break }
  const words = body.trim().split(/\s+/).length
  await reply(sock, msg,
    `📊 *Analyse du texte*\n\n` +
    `• Mots : *${words}*\n` +
    `• Caractères (espaces inclus) : *${body.length}*\n` +
    `• Caractères (sans espaces) : *${body.replace(/\s/g, '').length}*`
  )
  break
}

case 'reverse': {
  if (!body) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}reverse* [texte]`); break }
  await reply(sock, msg, `🔄 ${[...body].reverse().join('')}`)
  break
}

case 'repeat': {
  const n   = parseInt(args[0])
  const txt = args.slice(1).join(' ')
  if (isNaN(n) || !txt || n < 1 || n > 10) {
    await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}repeat* [1-10] [texte]`)
    break
  }
  await reply(sock, msg, Array(n).fill(txt).join('\n'))
  break
}

case 'meteo': {
  if (!body) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}meteo* Paris`); break }
  try {
    const { data } = await axios.get(
      `https://wttr.in/${encodeURIComponent(body)}?format=j1`,
      { timeout: 8000 }
    )
    const c       = data.current_condition[0]
    const area    = data.nearest_area[0]
    const city    = area.areaName[0].value
    const country = area.country[0].value
    const today   = data.weather[0]
    const emoji   = weatherEmoji(c.weatherCode)

    await reply(sock, msg,
      `${emoji} *Météo — ${city}, ${country}*\n\n` +
      `🌡 Température : *${c.temp_C}°C* _(ressenti ${c.FeelsLikeC}°C)_\n` +
      `💧 Humidité : *${c.humidity}%*\n` +
      `💨 Vent : *${c.windspeedKmph} km/h*\n` +
      `👁 Visibilité : *${c.visibility} km*\n` +
      `☁️ Ciel : *${c.weatherDesc[0].value}*\n` +
      `🌅 UV : *${c.uvIndex}*\n` +
      `🌡 Min/Max : *${today.mintempC}°C / ${today.maxtempC}°C*`
    )
  } catch {
    await reply(sock, msg, `❌ Ville *"${body}"* introuvable ou service indisponible.`)
  }
  break
}

case 'blague': {
  try {
    const { data } = await axios.get(
      'https://v2.jokeapi.dev/joke/Any?lang=fr&blacklistFlags=nsfw,racist,sexist&type=twopart',
      { timeout: 5000 }
    )
    await reply(sock, msg, `😂 *${data.setup}*\n\n_${data.delivery}_`)
  } catch {
    const fallback = [
      'Pourquoi les plongeurs plongent en arrière ?\nParce que sinon ils tomberaient dans le bateau !',
      'C\'est l\'histoire d\'un homme qui rentre fatigué... il avait fait une bonne sieste.',
      'Comment appelle-t-on un chat tombé dans un pot de peinture ? Un chat-peint !',
    ]
    await reply(sock, msg, `😂 ${fallback[Math.floor(Math.random() * fallback.length)]}`)
  }
  break
}

case 'cite':
case 'citation': {
  try {
    const { data } = await axios.get('https://api.quotable.io/random', { timeout: 5000 })
    await reply(sock, msg, `💡 *"${data.content}"*\n\n— _${data.author}_`)
  } catch {
    const fallback = [
      '"Le succès c\'est d\'aller d\'échec en échec sans perdre son enthousiasme." — Winston Churchill',
      '"La vie, c\'est comme une bicyclette, il faut avancer pour ne pas perdre l\'équilibre." — Albert Einstein',
      '"Le seul moyen de faire du bon travail est d\'aimer ce que vous faites." — Steve Jobs',
    ]
    await reply(sock, msg, `💡 ${fallback[Math.floor(Math.random() * fallback.length)]}`)
  }
  break
}

case 'define':
case 'def': {
  if (!body) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}define* [mot]`); break }
  try {
    const { data } = await axios.get(
      `https://api.dictionaryapi.dev/api/v2/entries/fr/${encodeURIComponent(body)}`,
      { timeout: 6000 }
    )
    const entry = data[0]
    const def   = entry.meanings[0].definitions[0]
    await reply(sock, msg,
      `📖 *${entry.word}*\n\n` +
      `_${entry.meanings[0].partOfSpeech}_\n\n` +
      `> ${def.definition}${def.example ? `\n\nEx: _"${def.example}"_` : ''}`
    )
  } catch {
    await reply(sock, msg, `❌ Définition introuvable pour *"${body}"*.`)
  }
  break
}

// ╔═══════════════════════════════════════╗
// ║           MESSAGES                    ║
// ╚═══════════════════════════════════════╝

case 'dm': {
  if (!mentions.length || !body) {
    await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}dm* @user [message]`)
    break
  }
  const targetJid = mentions[0]
  const dmText    = args.slice(1).join(' ')
  if (!dmText) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}dm* @user [message]`); break }
  try {
    await send(sock, targetJid, `💬 *Message de ${CONFIG.BOT_NAME}*\n\n${dmText}`)
    await react(sock, msg, '✅')
    await reply(sock, msg, `✅ Message envoyé à @${targetJid.split('@')[0]}`)
  } catch {
    await reply(sock, msg, '❌ Impossible d\'envoyer le message privé.')
  }
  break
}

case 'annonce': {
  if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  if (!body)         { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}annonce* [texte]`); break }
  try {
    const meta     = await sock.groupMetadata(jid)
    const allJids  = meta.participants.map(p => p.id)
    await sock.sendMessage(jid, {
      text:     `📢 *ANNONCE — ${meta.subject}*\n\n${body}\n\n_— ${CONFIG.BOT_NAME}_`,
      mentions: allJids,
    })
    await react(sock, msg, '✅')
  } catch {
    await reply(sock, msg, '❌ Erreur lors de l\'annonce.')
  }
  break
}

case 'forward': {
  if (!quoted) { await reply(sock, msg, `📌 *Citez un message* à transférer.`); break }
  if (!body)   { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}forward* [@user ou JID]`); break }
  try {
    const targetJid = mentions[0] || body
    await sock.sendMessage(targetJid, { forward: { ...msg, message: quoted } })
    await react(sock, msg, '✅')
  } catch {
    await reply(sock, msg, '❌ Impossible de transférer le message.')
  }
  break
}

case 'delete':
case 'del': {
  if (!quoted) { await reply(sock, msg, `📌 *Citez le message* à supprimer.`); break }
  const quotedKey = msg.message?.extendedTextMessage?.contextInfo?.stanzaId
  if (!quotedKey) { await reply(sock, msg, '❌ Impossible de trouver le message.'); break }
  try {
    await sock.sendMessage(jid, {
      delete: {
        remoteJid: jid,
        fromMe:    false,
        id:        quotedKey,
        participant: msg.message?.extendedTextMessage?.contextInfo?.participant,
      },
    })
    await react(sock, msg, '✅')
  } catch {
    await reply(sock, msg, '❌ Impossible de supprimer (le bot doit être admin en groupe).')
  }
  break
}

// ╔═══════════════════════════════════════╗
// ║           GROUPE                      ║
// ╚═══════════════════════════════════════╝

case 'groupinfo': {
  if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  const meta    = await sock.groupMetadata(jid)
  const creator = meta.owner?.split('@')[0] || 'Inconnu'
  const admins  = meta.participants.filter(p => p.admin).length
  await reply(sock, msg,
    `👥 *Infos du groupe*\n\n` +
    `📌 Nom : *${meta.subject}*\n` +
    `📝 Description : ${meta.desc || '_Aucune_'}\n` +
    `👑 Créateur : *+${creator}*\n` +
    `📅 Créé le : *${new Date(meta.creation * 1000).toLocaleDateString('fr-FR')}*\n` +
    `👤 Membres : *${meta.participants.length}*\n` +
    `🛡 Admins : *${admins}*\n` +
    `🔒 Restriction : ${meta.announce ? '✅ Lecture seule' : '❌ Ouvert'}`
  )
  break
}

case 'tagall': {
  if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  const meta     = await sock.groupMetadata(jid)
  const allJids  = meta.participants.map(p => p.id)
  const list     = allJids.map(id => `@${id.split('@')[0]}`).join('\n')
  await sendMention(sock, jid,
    `📢 *${CONFIG.BOT_NAME} — Tag général*\n\n${list}`,
    allJids
  )
  break
}

case 'members': {
  if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  const meta    = await sock.groupMetadata(jid)
  const admins  = meta.participants.filter(p => p.admin)
  const members = meta.participants.filter(p => !p.admin)
  await reply(sock, msg,
    `👥 *${meta.subject}*\n\n` +
    `📊 Total : *${meta.participants.length}*\n` +
    `👑 Admins (${admins.length}) :\n${admins.map(a => `  • +${a.id.split('@')[0]}`).join('\n')}\n\n` +
    `👤 Membres (${members.length}) :\n${members.slice(0, 15).map(m => `  • +${m.id.split('@')[0]}`).join('\n')}` +
    (members.length > 15 ? `\n  _...et ${members.length - 15} autres_` : '')
  )
  break
}

case 'kick': {
  if (!isGroup(msg))    { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  if (!mentions.length) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}kick* @user`); break }
  try {
    await sock.groupParticipantsUpdate(jid, mentions, 'remove')
    await reply(sock, msg, `✅ *${mentions.length}* membre(s) exclu(s).`)
  } catch {
    await reply(sock, msg, '❌ Le bot doit être *admin* du groupe.')
  }
  break
}

case 'add': {
  if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  if (!body)         { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}add* +33612345678`); break }
  const addJid = body.replace(/\D/g, '') + '@s.whatsapp.net'
  try {
    await sock.groupParticipantsUpdate(jid, [addJid], 'add')
    await reply(sock, msg, `✅ *+${body.replace(/\D/g, '')}* ajouté au groupe.`)
  } catch {
    await reply(sock, msg, '❌ Impossible d\'ajouter (bot admin requis ou numéro invalide).')
  }
  break
}

case 'promote': {
  if (!isGroup(msg))    { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  if (!mentions.length) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}promote* @user`); break }
  try {
    await sock.groupParticipantsUpdate(jid, mentions, 'promote')
    await reply(sock, msg, `✅ *${mentions.length}* membre(s) promu(s) admin.`)
  } catch {
    await reply(sock, msg, '❌ Le bot doit être *admin* du groupe.')
  }
  break
}

case 'demote': {
  if (!isGroup(msg))    { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  if (!mentions.length) { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}demote* @user`); break }
  try {
    await sock.groupParticipantsUpdate(jid, mentions, 'demote')
    await reply(sock, msg, `✅ *${mentions.length}* admin(s) rétrogradé(s).`)
  } catch {
    await reply(sock, msg, '❌ Le bot doit être *admin* du groupe.')
  }
  break
}

case 'desc': {
  if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  if (!body)         { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}desc* [texte]`); break }
  try {
    await sock.groupUpdateDescription(jid, body)
    await reply(sock, msg, `✅ Description mise à jour.`)
  } catch {
    await reply(sock, msg, '❌ Le bot doit être *admin* du groupe.')
  }
  break
}

case 'subject': {
  if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  if (!body)         { await reply(sock, msg, `📌 Usage : *${CONFIG.PREFIX}subject* [nom]`); break }
  try {
    await sock.groupUpdateSubject(jid, body)
    await reply(sock, msg, `✅ Nom du groupe changé en *${body}*.`)
  } catch {
    await reply(sock, msg, '❌ Le bot doit être *admin* du groupe.')
  }
  break
}

case 'mute': {
  if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  try {
    await sock.groupSettingUpdate(jid, 'announcement')
    await reply(sock, msg, '🔇 Groupe passé en *lecture seule*. Seuls les admins peuvent écrire.')
  } catch {
    await reply(sock, msg, '❌ Le bot doit être *admin* du groupe.')
  }
  break
}

case 'unmute': {
  if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  try {
    await sock.groupSettingUpdate(jid, 'not_announcement')
    await reply(sock, msg, '🔔 Groupe *ouvert* — tout le monde peut écrire.')
  } catch {
    await reply(sock, msg, '❌ Le bot doit être *admin* du groupe.')
  }
  break
}

case 'link': {
  if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  try {
    const code = await sock.groupInviteCode(jid)
    await reply(sock, msg, `🔗 *Lien d'invitation :*\nhttps://chat.whatsapp.com/${code}`)
  } catch {
    await reply(sock, msg, '❌ Le bot doit être *admin* du groupe.')
  }
  break
}

case 'revoke': {
  if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
  try {
    await sock.groupRevokeInvite(jid)
    await reply(sock, msg, '✅ Lien d\'invitation *révoqué*. Un nouveau lien a été généré.')
  } catch {
    await reply(sock, msg, '❌ Le bot doit être *admin* du groupe.')
  }
  break
}

// ╔═══════════════════════════════════════╗
// ║        COMMANDE INCONNUE              ║
// ╚═══════════════════════════════════════╝
default: {
  await react(sock, msg, '❓')
  await reply(sock, msg,
    `❓ Commande inconnue : *${CONFIG.PREFIX}${cmd}*\n` +
    `Tapez *${CONFIG.PREFIX}menu* pour voir toutes les commandes.`
  )
}

} // fin switch
}

module.exports = handler
