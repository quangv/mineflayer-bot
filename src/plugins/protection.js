/**
 * Protection plugin — follow & defend human players.
 */

export function setupProtection(bot) {
  const config = bot.friendlyBot.config;
  let scanInterval = null;

  /** Start protecting a player by name. */
  bot.friendlyBot.protect = (playerName) => {
    const player = bot.players[playerName];
    if (!player || !player.entity) {
      bot.chat(`I can't see ${playerName} — are they nearby?`);
      return false;
    }
    bot.friendlyBot.mode = "protect";
    bot.friendlyBot.followTarget = playerName;
    bot.friendlyBot.followEntity(player.entity, 4);
    bot.chat(`I'll protect you, ${playerName}! Stay close.`);

    if (scanInterval) clearInterval(scanInterval);
    scanInterval = setInterval(() => scanThreats(playerName), 1000);
    return true;
  };

  /** Stop protecting. */
  bot.friendlyBot.stopProtecting = () => {
    bot.friendlyBot.mode = "idle";
    bot.friendlyBot.followTarget = null;
    bot.friendlyBot.stopMoving();
    bot.friendlyBot.stopFighting();
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
    bot.chat("I've stopped protecting. Let me know if you need me!");
  };

  /** Scan for hostile mobs near the protected player and engage. */
  async function scanThreats(playerName) {
    if (bot.friendlyBot.mode !== "protect") return;
    if (bot.friendlyBot.busy) return;

    const player = bot.players[playerName];
    if (!player || !player.entity) return;

    const threat = bot.friendlyBot.findNearestHostile(
      player.entity.position,
      config.protection.radius,
    );

    if (threat) {
      bot.chat(`Watch out ${playerName}! I'll handle this ${threat.name}!`);
      bot.pathfinder.stop();
      await bot.friendlyBot.attackEntity(threat);
      if (bot.friendlyBot.mode === "protect" && player.entity) {
        bot.friendlyBot.followEntity(player.entity, 4);
      }
    }
  }

  // Auto-protect players listed in config on join
  bot.on("playerJoined", (player) => {
    if (
      config.protection.players.includes(player.username) &&
      bot.friendlyBot.mode === "idle"
    ) {
      setTimeout(() => bot.friendlyBot.protect(player.username), 3000);
    }
  });

  console.log("[Protection] Ready.");
}
