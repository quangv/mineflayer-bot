# FriendlyBot — Mineflayer Minecraft Bot

A friendly bot that **protects human players** and **beats Minecraft** (all the way to the Ender Dragon).

## How to use

Make sure using a supported minecraft version (Java 1.21.10)

1. Start Minecraft Java Edition → click Play Singleplayer → Create New World → Survival → Create
2. Wait for the world to load and you spawn in
3. Press Esc → Open to LAN → Start LAN World
4. Use port 25565
5. Run npm start in your terminal

(version and port is in `.env`)

## Features

- **Player Protection** — Follows a player, detects nearby hostile mobs, and fights them off.
- **Full Progression** — Automatically gathers resources, crafts gear, enters the Nether, collects blaze rods & ender pearls, finds the stronghold, and fights the Ender Dragon.
- **Chat Commands** — Players control the bot via in-game chat.
- **Auto-Eat** — Keeps food topped up automatically.
- **Armor Manager** — Auto-equips best armor.
- **Smart Combat** — Equips the best available weapon and uses pathfinding to engage hostiles.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your server details

# 3. Run
npm start
```

## Configuration (.env)

| Variable            | Default       | Description                                  |
| ------------------- | ------------- | -------------------------------------------- |
| `BOT_USERNAME`      | `FriendlyBot` | Bot display name                             |
| `BOT_HOST`          | `localhost`   | Server address                               |
| `BOT_PORT`          | `25565`       | Server port                                  |
| `BOT_VERSION`       | `1.20.4`      | Minecraft version                            |
| `BOT_AUTH`          | _(empty)_     | Set to `microsoft` for online-mode servers   |
| `PROTECTED_PLAYERS` | _(empty)_     | Comma-separated player names to auto-protect |
| `PROTECTION_RADIUS` | `16`          | Blocks radius to scan for threats            |
| `BATTLE_RED_NAME`   | `RedBot`      | Red bot name (battle mode)                   |
| `BATTLE_BLUE_NAME`  | `BlueBot`     | Blue bot name (battle mode)                  |

## In-Game Chat Commands

| Command          | Description                                |
| ---------------- | ------------------------------------------ |
| `help`           | List all commands                          |
| `follow <name>`  | Follow a player                            |
| `protect <name>` | Follow + defend a player from hostile mobs |
| `come`           | Come to the sender's position              |
| `stop`           | Stop all current actions                   |
| `beat`           | Start automated Minecraft progression      |
| `phase`          | Show current progression phase             |
| `status`         | Show health, food, mode, and busy state    |
| `inventory`      | List inventory contents                    |
| `attack`         | Attack the nearest hostile mob             |
| `guard`          | Guard current location for 5 minutes       |
| `sleep`          | Try to sleep in a nearby bed               |

## Progression Phases

The `beat` command runs through these phases in order:

1. **Start** — Gather wood, craft basic tools
2. **Iron** — Mine stone & iron, smelt ingots, craft iron gear + shield
3. **Diamond** — Mine diamonds, craft diamond pickaxe & sword
4. **Nether Prep** — Get obsidian, flint & steel, gold for bartering, food, bow & arrows
5. **Nether** — Build portal, hunt blazes for rods, barter with piglins for ender pearls
6. **Stronghold** — Craft Eyes of Ender, locate stronghold, activate End portal
7. **End** — Destroy End Crystals, fight the Ender Dragon

## Project Structure

```
mineflayer-bot/
├── index.js                 # Entry point
├── battle.js                # Co-op mode — 6 bots, 1 team!
├── config.js                # Environment config
├── .env.example             # Config template
├── package.json
└── src/
    ├── bot.js               # Bot factory, plugin loading
    ├── chat.js              # Chat command handler
    └── plugins/
    │   ├── navigation.js    # Pathfinding & movement
    │   ├── combat.js        # Fighting utilities
    │   ├── protection.js    # Player follow & defend
    │   ├── survival.js      # Food, health, sleep
    │   ├── mining.js        # Resource gathering & strip mining
    │   ├── crafting.js      # Crafting & smelting
    │   ├── inventory.js     # Item counting & management
    │   ├── nether.js        # Portal, blazes, piglin bartering
    │   └── end.js           # Stronghold, portal, dragon fight
    └── progression/
        ├── index.js         # Progression loop manager
        └── phases.js        # Phase definitions & logic
```

## Tips

- The bot works best on **offline-mode / LAN** servers for testing.
- Make sure the server allows the bot's username.
- If the bot gets stuck, use `stop` then give it a manual command.
- The bot will auto-protect configured players when they join the server.
- Progression is ambitious — the bot may need help with some phases depending on the world.

## Co-op Mode — 6 Bots, 1 Team!

Spawn **6 bots** that work together as a squad to beat Minecraft! They talk to each other, fight mobs together, and are all a little dumb.

```bash
npm run battle
```

### The Squad

| Bot             | Role      | Behavior                                           |
| --------------- | --------- | -------------------------------------------------- |
| **FriendlyBot** | Leader    | Runs the full game progression (beat Minecraft)    |
| **RedGuard1**   | Bodyguard | Stays near the leader, fights anything threatening |
| **RedGuard2**   | Gatherer  | Mines nearby resources, panics when attacked       |
| **RedScout**    | Scout     | Runs ahead, reports mobs and points of interest    |
| **BlueHelper1** | Fighter   | Actively hunts hostile mobs around the group       |
| **BlueHelper2** | Builder   | Follows leader, helps with odd jobs and gathering  |

All bots are **a little dumb** — they get distracted by butterflies, walk into walls,
forget their swords, panic, miss attacks, and say silly things. They also **talk to each other constantly** with banter, reactions, and team callouts. Expect chaos and comedy.

### Co-op Commands (say in-game chat)

| Command         | Description                |
| --------------- | -------------------------- |
| `go` / `beat`   | Start the adventure!       |
| `stop`          | Everyone stops             |
| `regroup`       | Everyone comes to you      |
| `status`        | Show squad status & HP     |
| `reset`         | Heal all bots              |
| `arm`           | Random gear for all 6 bots |
| `kit stone`     | Stone gear for all         |
| `kit iron`      | Iron gear for all          |
| `kit diamond`   | Diamond gear for all       |
| `kit netherite` | Netherite gear for all     |
| `quit`          | Disconnect all bots        |

> **Note:** Gear commands use `/give` and `/clear`, so your server needs cheats enabled (LAN world with cheats ON, or an operator in a server).
>
> **Tip:** The bots have over 50 scripted conversations and react to deaths, respawns, combat, and each other's actions!

## Dependencies

- [mineflayer](https://github.com/PrismarineJS/mineflayer) — Core bot framework
- [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder) — A\* pathfinding
- [mineflayer-pvp](https://github.com/PrismarineJS/mineflayer-pvp) — Combat
- [mineflayer-collectblock](https://github.com/PrismarineJS/mineflayer-collectblock) — Block collection
- [mineflayer-auto-eat](https://github.com/link-discord/mineflayer-auto-eat) — Auto food
- [mineflayer-armor-manager](https://github.com/PrismarineJS/MineflayerArmorManager) — Auto armor
- [mineflayer-tool](https://github.com/PrismarineJS/mineflayer-tool) — Auto tool selection
