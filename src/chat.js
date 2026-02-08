/**
 * Chat plugin — in-game commands for players to control the bot.
 */

export function setupChat(bot) {
  const COMMANDS = {
    help: {
      desc: "Show commands",
      run: () => {
        const cmds = Object.entries(COMMANDS)
          .map(([k, v]) => `${k} — ${v.desc}`)
          .join(" | ");
        bot.chat(cmds);
      },
    },

    follow: {
      desc: 'Follow a player: "follow <name>"',
      run: (args, sender) => {
        const target = args[0] || sender;
        const player = bot.players[target];
        if (!player?.entity) {
          bot.chat(`I can't see ${target}!`);
          return;
        }
        bot.friendlyBot.followEntity(player.entity, 3);
        bot.friendlyBot.followTarget = target;
        bot.chat(`Following ${target}!`);
      },
    },

    stop: {
      desc: "Stop everything",
      run: () => {
        bot.friendlyBot.stopMoving();
        bot.friendlyBot.stopFighting();
        bot.friendlyBot.stopProtecting();
        bot.friendlyBot.stopProgression();
        bot.friendlyBot.stopAutonomous?.();
        bot.chat("Stopped. I'll just hang out here.");
      },
    },

    go: {
      desc: "Resume autonomous behavior",
      run: () => {
        bot.friendlyBot.startAutonomous?.();
        bot.chat("Alright, back to exploring!");
      },
    },

    protect: {
      desc: 'Protect a player: "protect <name>"',
      run: (args, sender) => {
        const target = args[0] || sender;
        bot.friendlyBot.protect(target);
        // Auto-bind: if you die, I die
        bot.friendlyBot.boundTo = target;
        bot.chat(`Our fates are linked, ${target}. If you fall, I fall.`);
      },
    },

    bind: {
      desc: 'Link fate: "bind <name>" — if they die, I die',
      run: (args, sender) => {
        const target = args[0] || sender;
        bot.friendlyBot.boundTo = target;
        bot.chat(`My fate is bound to ${target}. We live and die together.`);
      },
    },

    unbind: {
      desc: "Unlink fate",
      run: () => {
        const was = bot.friendlyBot.boundTo;
        bot.friendlyBot.boundTo = null;
        bot.chat(was ? `Fate unlinked from ${was}. I'm on my own now.` : "I wasn't bound to anyone.");
      },
    },

    beat: {
      desc: "Start beating Minecraft!",
      run: () => bot.friendlyBot.startProgression(),
    },

    status: {
      desc: "Show current status",
      run: () => {
        const fb = bot.friendlyBot;
        const hp = fb.getHealthStatus();
        bot.chat(
          `Mode: ${fb.mode} | Phase: ${fb.phase} | ` +
            `HP: ${hp.health}/20 | Food: ${hp.food}/20 | Busy: ${fb.busy}`,
        );
      },
    },

    inventory: {
      desc: "List inventory",
      run: () => bot.chat(bot.friendlyBot.listInventory()),
    },

    come: {
      desc: "Come to sender",
      run: (_args, sender) => {
        const player = bot.players[sender];
        if (!player?.entity) {
          bot.chat(`I can't see you, ${sender}!`);
          return;
        }
        bot.friendlyBot
          .goTo(player.entity.position, 2)
          .then(() => bot.chat(`Here I am, ${sender}!`))
          .catch(() => bot.chat("I couldn't get there."));
      },
    },

    attack: {
      desc: "Attack nearest hostile",
      run: () => {
        const threat = bot.friendlyBot.findNearestHostile(
          bot.entity.position,
          32,
        );
        if (threat) {
          bot.chat(`Attacking ${threat.name}!`);
          bot.friendlyBot.attackEntity(threat);
        } else {
          bot.chat("No hostile mobs nearby.");
        }
      },
    },

    sleep: {
      desc: "Try to sleep",
      run: async () => {
        if (!(await bot.friendlyBot.tryToSleep()))
          bot.chat("No bed nearby or not night time.");
      },
    },

    phase: {
      desc: "Current progression phase",
      run: () => bot.chat(`Current phase: ${bot.friendlyBot.getPhase()}`),
    },

    guard: {
      desc: "Guard this area for 5 min",
      run: () => {
        bot.chat("Guarding this area!");
        const iv = setInterval(async () => {
          if (bot.friendlyBot.mode !== "idle") {
            clearInterval(iv);
            return;
          }
          const h = bot.friendlyBot.findNearestHostile(bot.entity.position, 20);
          if (h && !bot.friendlyBot.busy) await bot.friendlyBot.attackEntity(h);
        }, 1500);
        setTimeout(() => {
          clearInterval(iv);
          bot.chat("Guard duty ended.");
        }, 300_000);
      },
    },
  };

  bot.on("chat", (username, message) => {
    if (username === bot.username) return;
    const [cmd, ...args] = message.trim().toLowerCase().split(/\s+/);
    if (COMMANDS[cmd]) {
      console.log(`[Chat] ${username} → ${cmd} ${args.join(" ")}`);
      COMMANDS[cmd].run(args, username);
    }
  });

  bot.on("whisper", (username, message) => {
    if (username === bot.username) return;
    const [cmd, ...args] = message.trim().toLowerCase().split(/\s+/);
    if (COMMANDS[cmd]) COMMANDS[cmd].run(args, username);
  });

  console.log('[Chat] Ready. Say "help" in-game for commands.');
}
