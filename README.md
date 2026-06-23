# 🎮 GameNight

> Self-hosted multiplayer party games for your living room. No internet. No accounts. Just fun.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.7-010101?style=flat-square&logo=socketdotio)](https://socket.io)
[![Express](https://img.shields.io/badge/Express-4.18-000000?style=flat-square&logo=express)](https://expressjs.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-7c3aed?style=flat-square)](LICENSE)
[![Games](https://img.shields.io/badge/games-3-blueviolet?style=flat-square)](#-games)
[![Multiplayer](https://img.shields.io/badge/play-local%20network-0ea5e9?style=flat-square)](#-network-play)
[![No frameworks](https://img.shields.io/badge/frontend-vanilla%20JS-f59e0b?style=flat-square)](#)

---

```
  ██████╗  █████╗ ███╗   ███╗███████╗███╗   ██╗██╗ ██████╗ ██╗  ██╗████████╗
 ██╔════╝ ██╔══██╗████╗ ████║██╔════╝████╗  ██║██║██╔════╝ ██║  ██║╚══██╔══╝
 ██║  ███╗███████║██╔████╔██║█████╗  ██╔██╗ ██║██║██║  ███╗███████║   ██║   
 ██║   ██║██╔══██║██║╚██╔╝██║██╔══╝  ██║╚██╗██║██║██║   ██║██╔══██║   ██║   
 ╚██████╔╝██║  ██║██║ ╚═╝ ██║███████╗██║ ╚████║██║╚██████╔╝██║  ██║   ██║   
  ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝  
```

**GameNight** turns any device on your local network into a party game console.  
Run one command → share the URL → play instantly.

---

## 🎲 Games

| | Game | Players | Vibe |
|--|------|---------|------|
| 🔪 | **Mongolpuri** | 4–15 | Social deduction — lies, trust, and midnight murder |
| ⭕ | **Tic Tac Toe** | 2+ | Classic 1v1 with score tracking and match formats |
| 🎨 | **Scribble** | 3+ | Draw a word while your friends race to guess it |

---

## ✨ Features

- 🌐 **Fully local** — runs on your LAN, no internet required after setup
- 📱 **Works everywhere** — phone, tablet, laptop — any browser
- 🏠 **Room codes** — create a room, share the 6-letter code or invite link, done
- 🔗 **Smart invite links** — link pre-fills the room code and shows only the game being joined
- 🎭 **100 avatars** — auto-assigned by name for known players, random for new ones; open a modal to browse and change
- 💾 **Remembered preferences** — name and avatar are saved and restored on your next visit
- ⚙️ **Configurable** — host adjusts timers, rounds, match format before game starts
- 📖 **Built-in rules** — tap "How to Play" to learn any game
- 🔄 **Reconnect support** — refresh the page and jump back in
- 👻 **Spectator mode** — eliminated players watch the action
- 🌙 **Dark UI** — polished animations, countdown timers, role cards

---

## 🚀 Quick Start

### Prerequisites

- [Node.js 18+](https://nodejs.org/en/download)

### Install

```bash
git clone <repo-url>
cd gamenight
npm install
```

### Run

| Platform | Command |
|----------|---------|
| Windows | Double-click `start.bat` or run it in terminal |
| macOS / Linux | `./start.sh` |
| Anywhere | `npm start` |

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🌐 Network Play

When the server starts it prints every URL your friends can use:

```
🎮  GameNight is live!

  Local:    http://localhost:3000
  Network:  http://192.168.1.42:3000   ← share this!
  Network:  http://10.0.0.5:3000
```

Anyone on the **same WiFi or LAN** can open the Network URL directly — no setup needed on their end.

> **Tip:** Your IP can change between sessions. Check the terminal output each time.

---

## ⚙️ Game Settings

The room creator can tune settings in the lobby before the game starts. Everyone else sees the current configuration.

| Game | Configurable |
|------|-------------|
| 🎨 Scribble | Draw time (40–120 s) · Rounds (2–5) · Word choices per turn (2–4) |
| 🔪 Mongolpuri | Discussion time · Voting time |
| ⭕ Tic Tac Toe | Free play · Best of 3 / 5 / 7 |

---

## 📖 How to Play

Rules are built into the app — click **"How to Play"** on any screen. Here's the quick version:

### 🔪 Mongolpuri
Players are secretly assigned **Killer**, **Doctor**, or **Villager**. Roles are hidden by default — tap your role card to reveal it. Each night, every player confirms they are awake (villagers tap "I'm awake"; killer and doctor choose their target). Once all players have acted, the server waits a random delay then resolves the night. At dawn the village debates during a timed discussion, then votes to eliminate a suspect. Villagers win by voting out the Killer. The Killer wins by reducing the living players to two.

### 🎨 Scribble
One player draws a secret word on a shared canvas while everyone else types guesses in the chat. Faster correct guesses = more points. The drawer earns bonus points for each correct guesser. Hints appear as time runs low. Roles rotate every turn.

### ⭕ Tic Tac Toe
Classic 3×3 grid. Get three of your symbol in a row (horizontal, vertical, or diagonal) to win. X always goes first. Symbols swap each game. In match formats, first to reach the win target takes the match. Supports single-elimination tournaments for groups.

---

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js |
| HTTP server | Express |
| Realtime | Socket.io (WebSockets) |
| Drawing | HTML5 Canvas API |
| Frontend | Vanilla JS, pure CSS |
| Styles | CSS custom properties, no framework |

---

## 📁 Structure

```
gamenight/
├── server.js            # All game logic + Socket.io events
├── public/
│   ├── index.html       # Single-page app shell
│   ├── style.css        # Dark theme, animations
│   └── js/
│       ├── app.js           # Socket setup · lobby · views · avatars · settings
│       ├── killerdoctor.js  # Mongolpuri client UI
│       ├── tictactoe.js     # Tic Tac Toe client UI
│       └── scribble.js      # Scribble canvas + chat
├── start.bat            # Windows one-click launcher
├── start.sh             # macOS / Linux launcher
└── package.json
```

---

## 📝 License

MIT — do whatever you want with it.

---

*No cloud. No tracking. No nonsense. Just game night.*
