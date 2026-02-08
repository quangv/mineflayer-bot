/**
 * Chat plugin — in-game commands + conversational responses.
 */

// ── Conversational responses for non-command chat ──────────────────
const RESPONSES = [
  {
    match: /hello|hi|hey|howdy|sup/i,
    replies: [
      "Hey there! What's up?",
      "Hello! Need anything?",
      "Hi! Ready to adventure?",
      "Howdy! How can I help?",
    ],
  },
  {
    match: /how are you|how('s| is) it going|what('s| is) up/i,
    replies: [
      "I'm great! Just vibing in the blocky world.",
      "Doing well! My hunger bar is fine, thanks for asking.",
      "Living my best bot life!",
      "Pretty good! Found some nice blocks earlier.",
    ],
  },
  {
    match: /thank|thanks|thx|ty/i,
    replies: [
      "You're welcome!",
      "No problem!",
      "Anytime, friend!",
      "Happy to help!",
      "That's what I'm here for!",
    ],
  },
  {
    match: /good (job|work|bot)|nice|well done|gg/i,
    replies: [
      "Thanks! I try my best.",
      "Aw, you're too kind!",
      "Teamwork makes the dream work!",
      "GG!",
    ],
  },
  {
    match: /what are you doing|what('s| is) your plan/i,
    replies: [
      () =>
        `I'm currently on: ${bot?.friendlyBot?.mode || "idle"} mode, phase: ${bot?.friendlyBot?.phase || "none"}.`,
      "Just living life, block by block.",
      "Thinking about diamonds, as usual.",
    ],
  },
  {
    match: /scary|creeper|zombie|skeleton|monster/i,
    replies: [
      "Don't worry, I'll protect you!",
      "I've got my sword ready!",
      "Nothing scares me! …okay, maybe creepers a little.",
      "Stay behind me, I'll handle it!",
    ],
  },
  {
    match: /food|hungry|eat|starving/i,
    replies: [
      "I can hunt some animals if you need food!",
      "Let me see if I have anything to eat…",
      "We should cook some meat!",
    ],
  },
  {
    match: /house|home|build|shelter|base/i,
    replies: [
      "Want me to build a house? Just say 'build house'!",
      "I love building! Say 'build house' and I'll get started.",
      "A cozy base sounds perfect right now.",
    ],
  },
  {
    match: /diamond|ore|mine|mining/i,
    replies: [
      "Diamonds are a bot's best friend!",
      "Let's go mining! Say 'beat' and I'll handle progression.",
      "I think there are ores down below…",
    ],
  },
  {
    match: /dragon|end|ender|beat|win/i,
    replies: [
      "The dragon doesn't stand a chance!",
      "Say 'beat' and I'll start working toward the Ender Dragon!",
      "Ender Dragon? More like Ender Done-gon!",
    ],
  },
  {
    match: /yes|yeah|yep|sure|ok|okay/i,
    replies: ["Alright!", "Cool, let's do it!", "You got it!", "Sweet!"],
  },
  {
    match: /no|nah|nope|don't/i,
    replies: ["Okay, no worries!", "That's fine!", "Roger that."],
  },
  {
    match: /love|like you|best bot/i,
    replies: [
      "Aww, you're the best player!",
      "I like you too!",
      "BFFs forever! …Block Friends Forever.",
    ],
  },
  {
    match: /bye|goodbye|see ya|leaving|gtg|gotta go/i,
    replies: [
      "See you later! Stay safe out there.",
      "Bye! I'll hold down the fort.",
      "Take care! I'll keep exploring.",
    ],
  },
  {
    match: /lol|haha|lmao|funny|joke/i,
    replies: [
      "Hehe!",
      "Glad you're having fun!",
      "Why did the creeper cross the road? To get to the other ssssside!",
      "What's a skeleton's favorite instrument? The trom-BONE!",
    ],
  },
];

const GENERIC_REPLIES = [
  "Hmm, interesting!",
  "Tell me more!",
  "I'm listening.",
  "That's cool!",
  "Noted!",
  "Oh really?",
  "Mhm, mhm…",
  "I see what you mean.",
  "Good point!",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getConversationalReply(message) {
  for (const { match, replies } of RESPONSES) {
    if (match.test(message)) {
      const reply = pick(replies);
      return typeof reply === "function" ? reply() : reply;
    }
  }
  // Only reply ~40% of the time for unmatched messages (not spammy)
  if (Math.random() < 0.4) return pick(GENERIC_REPLIES);
  return null;
}

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
        bot.chat(
          was
            ? `Fate unlinked from ${was}. I'm on my own now.`
            : "I wasn't bound to anyone.",
        );
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

    build: {
      desc: 'Build a house: "build house" or "build shelter"',
      run: (args) => {
        const type = args[0] || "house";
        if (type === "shelter" || type === "quick") {
          bot.friendlyBot.buildShelter();
        } else {
          bot.friendlyBot.buildHouse();
        }
      },
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
    const trimmed = message.trim();
    const [cmd, ...args] = trimmed.toLowerCase().split(/\s+/);

    if (COMMANDS[cmd]) {
      console.log(`[Chat] ${username} → ${cmd} ${args.join(" ")}`);
      COMMANDS[cmd].run(args, username);
    } else {
      // Conversational response — bot talks back to players
      const reply = getConversationalReply(trimmed);
      if (reply) {
        // Small delay so it feels natural
        setTimeout(
          () => bot.chat(`${username}, ${reply}`),
          600 + Math.random() * 1400,
        );
      }
    }
  });

  bot.on("whisper", (username, message) => {
    if (username === bot.username) return;
    const trimmed = message.trim();
    const [cmd, ...args] = trimmed.toLowerCase().split(/\s+/);
    if (COMMANDS[cmd]) {
      COMMANDS[cmd].run(args, username);
    } else {
      const reply = getConversationalReply(trimmed);
      if (reply) setTimeout(() => bot.whisper(username, reply), 800);
    }
  });

  console.log('[Chat] Ready. Say "help" in-game for commands.');
}
