# ⚡ CRAZY MD v2

WhatsApp Bot via Pairing Code — sans QR Code.

---

## 🚀 Lancer en local

```bash
npm install
npm start
# → http://localhost:3000
```

**Node.js 18+** requis.

---

## 📁 Structure

```
crazy-md/
├── index.js               ← Serveur Express + Socket.IO
├── package.json
├── Dockerfile             ← Docker universel
├── railway.json           ← Config Railway
├── render.yaml            ← Config Render
├── koyeb.yaml             ← Config Koyeb
├── ecosystem.config.js    ← Config PM2 (VPS)
├── public/
│   └── index.html         ← UI pairing
├── bot/
│   ├── SessionManager.js  ← Engine Baileys multi-sessions
│   └── handler.js         ← Toutes les commandes
└── sessions/              ← Créé auto · 1 dossier/bot
```

---

## ☁️ Déploiements

### Railway (recommandé — gratuit)
```
1. Créer un compte sur railway.app
2. New Project → Deploy from GitHub
3. Push ce repo sur GitHub
4. Railway détecte le railway.json automatiquement
5. Add Variable : PORT = 3000
6. Deploy → Done ✅
```
> ⚠️ Ajouter un **Volume** dans Railway pour persister le dossier `/app/sessions`

---

### Render (gratuit avec disk)
```
1. Créer un compte sur render.com
2. New → Web Service → GitHub
3. Le render.yaml est détecté automatiquement
4. Deploy → Done ✅
```
> Le render.yaml configure automatiquement un disk de 1GB pour `/app/sessions`

---

### Koyeb (gratuit)
```
1. Créer un compte sur koyeb.com
2. New App → GitHub → sélectionner le repo
3. Build: Node.js · Start: npm start · Port: 3000
4. Deploy → Done ✅
```

---

### VPS / Pterodactyl avec PM2
```bash
# Installer Node.js 20 et PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install nodejs -y
npm install -g pm2

# Déployer
git clone <repo> crazy-md && cd crazy-md
npm install

# Lancer avec PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

### Docker
```bash
docker build -t crazy-md .
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/sessions:/app/sessions \
  --name crazy-md \
  --restart unless-stopped \
  crazy-md
```

---

## 🤖 Commandes du bot

| Commande | Description |
|---|---|
| `!menu` | Toutes les commandes |
| `!ping` | Latence |
| `!info` | RAM, uptime, version Node |
| `!uptime` | Durée active |
| `!id` | Votre JID |
| `!whoami` | Vos infos complètes |
| `!pp` | Photo de profil |
| `!sticker` | Image citée → sticker |
| `!calc 3+4` | Calculatrice |
| `!b64 texte` | Encode Base64 |
| `!meteo Paris` | Météo temps réel |
| `!blague` | Blague aléatoire |
| `!tagall` | Mention tous (groupe) |
| `!members` | Liste membres (groupe) |
| `!kick @user` | Exclure (admin requis) |
| `!desc texte` | Changer description (admin) |

---

## ⚠️ Important — Persistance des sessions

Les sessions Baileys sont stockées dans `sessions/`.
**Sans persistance de ce dossier, les bots se déconnectent au redémarrage.**

- **Railway** → ajouter un Volume sur `/app/sessions`
- **Render** → le `render.yaml` configure le disk automatiquement
- **VPS** → les sessions survivent naturellement
- **Docker** → monter le volume `-v ./sessions:/app/sessions`
