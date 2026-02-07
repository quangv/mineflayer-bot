import "dotenv/config";

export default {
  bot: {
    username: process.env.BOT_USERNAME || "FriendlyBot",
    host: process.env.BOT_HOST || "localhost",
    port: parseInt(process.env.BOT_PORT, 10) || 25565,
    version: process.env.BOT_VERSION || "1.20.4",
    auth: process.env.BOT_AUTH || undefined,
  },
  protection: {
    players: process.env.PROTECTED_PLAYERS
      ? process.env.PROTECTED_PLAYERS.split(",").map((s) => s.trim())
      : [],
    radius: parseInt(process.env.PROTECTION_RADIUS, 10) || 16,
  },
  hostileMobs: [
    "zombie",
    "skeleton",
    "spider",
    "cave_spider",
    "creeper",
    "enderman",
    "witch",
    "pillager",
    "vindicator",
    "ravager",
    "drowned",
    "husk",
    "stray",
    "phantom",
    "blaze",
    "wither_skeleton",
    "ghast",
    "piglin_brute",
    "hoglin",
    "zombified_piglin",
    "magma_cube",
    "slime",
    "shulker",
    "endermite",
    "silverfish",
    "vex",
    "evoker",
  ],
};
