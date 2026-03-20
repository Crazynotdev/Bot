'use strict'

const axios = require('axios')

const PREFIX = '!'

function getText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || ''
  ).trim()
}

const isGroup = msg => msg.key.remoteJid?.endsWith('@g.us')

async function reply(sock, msg, text) {
  await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg })
}

async function react(sock, msg, emoji) {
  await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } })
}

function uptime() {
  const s = process.uptime()
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return [d && `${d}j`, h && `${h}h`, m && `${m}m`, `${sec}s`].filter(Boolean).join(' ')
}

async function handler(sock, msg) {
  const text = getText(msg)
  if (!text.startsWith(PREFIX)) return

  const jid  = msg.key.remoteJid
  const [rawCmd, ...args] = text.slice(1).trim().split(/\s+/)
  const cmd  = rawCmd.toLowerCase()
  const body = args.join(' ')

  await react(sock, msg, '⚡')

  switch (cmd) {

    case 'ping': {
      const t = Date.now()
      await reply(sock, msg, `🏓 Pong · *${Date.now() - t}ms*`)
      break
    }

    case 'menu':
    case 'help':
    case 'aide':
      await reply(sock, msg,
        `╔══════════════════════════╗\n║     ⚡ *CRAZY MD v2*      ║\n╚══════════════════════════╝\n\n` +
        `*── GÉNÉRAL ──*\n!ping !info !uptime !owner !menu\n\n` +
        `*── PROFIL ──*\n!id !whoami !pp\n\n` +
        `*── OUTILS ──*\n!calc [ex] !b64 [txt] !meteo [ville]\n!blague !sticker !tts [txt]\n\n` +
        `*── GROUPE ──*\n!tagall !members !kick @user !desc [txt]\n\n` +
        `_Préfixe: ${PREFIX} · v2.0_`)
      break

    case 'info':
      await reply(sock, msg,
        `⚡ *CRAZY MD v2*\n\n` +
        `📱 Numéro : ${sock.user?.id?.split(':')[0]}\n` +
        `✅ Statut : En ligne\n` +
        `⏱ Uptime : ${uptime()}\n` +
        `📅 ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}\n` +
        `🔢 Node : ${process.version}\n` +
        `💾 RAM : ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`)
      break

    case 'uptime':
      await reply(sock, msg, `⏱ *Uptime :* ${uptime()}`)
      break

    case 'owner':
      await reply(sock, msg, `👑 *CRAZY MD* — Bot WhatsApp\nContactez le owner via le support.`)
      break

    case 'id':
      await reply(sock, msg, `🆔 \`${jid}\``)
      break

    case 'whoami': {
      const sender = msg.key.participant || jid
      await reply(sock, msg,
        `👤 *Vos infos*\n\nJID : \`${sender}\`\nNuméro : +${sender.replace('@s.whatsapp.net', '').replace(/\D/g, '')}\nContexte : ${isGroup(msg) ? '👥 Groupe' : '💬 Privé'}`)
      break
    }

    case 'pp': {
      const sender = msg.key.participant || jid
      try {
        const url = await sock.profilePictureUrl(sender, 'image')
        await sock.sendMessage(jid, { image: { url }, caption: `📸 Photo de profil` }, { quoted: msg })
      } catch {
        await reply(sock, msg, '❌ Aucune photo de profil disponible.')
      }
      break
    }

    case 'calc': {
      if (!body) { await reply(sock, msg, `Usage : !calc 3*(4+2)/2`); break }
      try {
        if (!/^[\d\s\+\-\*\/\.\(\)%]+$/.test(body)) throw new Error()
        // eslint-disable-next-line no-new-func
        const result = Function(`'use strict'; return (${body})`)()
        await reply(sock, msg, `🧮 \`${body}\` = *${result}*`)
      } catch {
        await reply(sock, msg, '❌ Expression invalide.')
      }
      break
    }

    case 'b64': {
      if (!body) { await reply(sock, msg, `Usage : !b64 [texte]`); break }
      await reply(sock, msg, `🔐 *Base64 :*\n\`${Buffer.from(body).toString('base64')}\``)
      break
    }

    case 'meteo': {
      if (!body) { await reply(sock, msg, `Usage : !meteo Paris`); break }
      try {
        const { data } = await axios.get(`https://wttr.in/${encodeURIComponent(body)}?format=j1`, { timeout: 8000 })
        const c = data.current_condition[0]
        const city = data.nearest_area[0].areaName[0].value
        await reply(sock, msg,
          `🌍 *${city}*\n🌡 ${c.temp_C}°C (ressenti ${c.FeelsLikeC}°C)\n💧 Humidité : ${c.humidity}%\n💨 Vent : ${c.windspeedKmph} km/h\n☁️ ${c.weatherDesc[0].value}`)
      } catch {
        await reply(sock, msg, '❌ Ville introuvable.')
      }
      break
    }

    case 'blague': {
      try {
        const { data } = await axios.get('https://v2.jokeapi.dev/joke/Any?lang=fr&blacklistFlags=nsfw,racist&type=twopart', { timeout: 5000 })
        await reply(sock, msg, `😂 *${data.setup}*\n\n_${data.delivery}_`)
      } catch {
        await reply(sock, msg, '😂 Pourquoi les plongeurs plongent en arrière ? Parce que sinon ils tomberaient dans le bateau !')
      }
      break
    }

    case 'sticker': {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
      if (!quoted?.imageMessage && !quoted?.videoMessage) {
        await reply(sock, msg, '📎 Citez une *image* pour la convertir en sticker.')
        break
      }
      await reply(sock, msg, '⏳ Création du sticker...')
      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys')
        const buffer = await downloadMediaMessage(
          { message: quoted, key: msg.key }, 'buffer', {},
          { logger: P(), reuploadRequest: sock.updateMediaMessage }
        )
        await sock.sendMessage(jid, { sticker: buffer }, { quoted: msg })
      } catch {
        await reply(sock, msg, '❌ Impossible de créer le sticker.')
      }
      break
    }

    case 'tagall': {
      if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
      const meta     = await sock.groupMetadata(jid)
      const mentions = meta.participants.map(p => p.id)
      const list     = mentions.map(id => `@${id.split('@')[0]}`).join('\n')
      await sock.sendMessage(jid, { text: `📢 *Tag général*\n\n${list}`, mentions }, { quoted: msg })
      break
    }

    case 'members': {
      if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
      const meta   = await sock.groupMetadata(jid)
      const admins = meta.participants.filter(p => p.admin).length
      await reply(sock, msg,
        `👥 *${meta.subject}*\n\nTotal : *${meta.participants.length}*\nAdmins : *${admins}*\nMembres : *${meta.participants.length - admins}*`)
      break
    }

    case 'kick': {
      if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
      if (!mentioned?.length) { await reply(sock, msg, `Usage : !kick @user`); break }
      try {
        await sock.groupParticipantsUpdate(jid, mentioned, 'remove')
        await reply(sock, msg, `✅ ${mentioned.length} membre(s) exclu(s).`)
      } catch {
        await reply(sock, msg, '❌ Le bot doit être admin.')
      }
      break
    }

    case 'desc': {
      if (!isGroup(msg)) { await reply(sock, msg, '❌ Groupe uniquement.'); break }
      if (!body)         { await reply(sock, msg, `Usage : !desc [texte]`); break }
      try {
        await sock.groupUpdateDescription(jid, body)
        await reply(sock, msg, '✅ Description mise à jour.')
      } catch {
        await reply(sock, msg, '❌ Le bot doit être admin.')
      }
      break
    }

    default:
      await react(sock, msg, '❓')
      await reply(sock, msg, `❓ Commande inconnue : *!${cmd}*\nTapez *!menu* pour voir les commandes.`)
  }
}

// pino silencieux pour sticker
const P = () => require('pino')({ level: 'silent' })

module.exports = handler
