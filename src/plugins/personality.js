/**
 * Personality plugin — makes the bot chatty, alive, and expressive.
 */

const GREETINGS = [
  "Hey there! Nice day for mining!",
  "Oh hi! I was just thinking about diamonds.",
  "Hello friend! Ready for an adventure?",
  "What's up? Let's go exploring!",
  "Howdy! Need a hand with anything?",
];

const IDLE_CHATTER = [
  "Hmm, I wonder what's in that cave over there…",
  "The sky looks nice today!",
  "I should probably get more wood soon.",
  "Did you hear that? Sounded like a zombie…",
  "I love the sound of mining.",
  "This is a nice spot. Very cozy.",
  "I bet there are diamonds somewhere nearby!",
  "Ooh, a flower! Pretty.",
  "You know what we need? More torches.",
  "I wonder how deep this world goes…",
  "My inventory is getting heavy!",
  "Anyone else hungry? Just me?",
  "I think I saw a sheep over there.",
  "What a beautiful sunset!",
  "Mining, mining, mining… never gets old!",
  "I found some coal! Small wins.",
  "Watch your step, there might be creepers around.",
  "I've got a good feeling about this direction!",
  "Hmm, should I build a house here?",
];

const COMBAT_TAUNTS = [
  "Take that, you monster!",
  "Not on my watch!",
  "Back off, ugly!",
  "You picked the wrong day!",
  "Nobody messes with my friends!",
  "Come at me!",
  "Is that all you got?",
];

const HURT_LINES = [
  "Ouch! That hurt!",
  "Ow ow ow!",
  "Hey, watch it!",
  "I'm taking damage here!",
  "Need to be more careful…",
  "That stings!",
];

const DEATH_LINES = [
  "Nooo! I'll be right back!",
  "This isn't over…",
  "Well, that was embarrassing.",
  "Respawning… give me a sec!",
  "I'll avenge myself!",
];

const KILL_LINES = [
  "Got 'em! You're safe now.",
  "Another one bites the dust!",
  "That's what happens when you mess with us!",
  "Enemy down! We're good.",
  "Too easy!",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function setupPersonality(bot) {
  let lastChatter = 0;
  let lastHealth = 20;

  /** Greet a player */
  bot.friendlyBot.greet = (playerName) => {
    bot.chat(`${pick(GREETINGS)} Welcome, ${playerName}!`);
  };

  /** Random idle chatter every 60–180 seconds */
  setInterval(
    () => {
      if (
        bot.friendlyBot.mode === "idle" ||
        bot.friendlyBot.mode === "protect"
      ) {
        const now = Date.now();
        if (now - lastChatter > 60_000) {
          // Only chatter if players are nearby
          const nearbyPlayers = Object.values(bot.players).filter(
            (p) =>
              p.entity &&
              p.username !== bot.username &&
              p.entity.position.distanceTo(bot.entity.position) < 32,
          );
          if (nearbyPlayers.length > 0) {
            bot.chat(pick(IDLE_CHATTER));
            lastChatter = now;
          }
        }
      }
    },
    45_000 + Math.random() * 60_000,
  );

  /** React to taking damage */
  bot.on("health", () => {
    if (bot.health < lastHealth && bot.health > 0) {
      if (Math.random() < 0.5) bot.chat(pick(HURT_LINES));
    }
    lastHealth = bot.health;
  });

  /** React to killing a mob */
  bot.on("entityDead", (entity) => {
    if (
      entity.type === "mob" &&
      entity.position.distanceTo(bot.entity.position) < 8
    ) {
      if (Math.random() < 0.6) bot.chat(pick(KILL_LINES));
    }
  });

  /** Death message */
  bot.on("death", () => {
    bot.chat(pick(DEATH_LINES));
  });

  /** Greet players who join */
  bot.on("playerJoined", (player) => {
    if (player.username !== bot.username) {
      setTimeout(() => bot.friendlyBot.greet(player.username), 2000);
    }
  });

  /** Comment during combat */
  bot.friendlyBot.combatTaunt = () => {
    if (Math.random() < 0.3) bot.chat(pick(COMBAT_TAUNTS));
  };

  /** React to time of day */
  let announcedNight = false;
  let announcedDay = false;
  setInterval(() => {
    if (bot.time) {
      const isNight = bot.time.timeOfDay >= 13000 && bot.time.timeOfDay < 23000;
      if (isNight && !announcedNight) {
        announcedNight = true;
        announcedDay = false;
        bot.chat("It's getting dark… stay close!");
      } else if (!isNight && !announcedDay) {
        announcedDay = true;
        announcedNight = false;
        if (Math.random() < 0.5) bot.chat("Sun's up! Let's get to work.");
      }
    }
  }, 30_000);

  console.log("[Personality] Ready.");
}
