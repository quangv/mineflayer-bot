/**
 * Autonomous behavior plugin — the bot does stuff on its own when idle.
 *
 * When not protecting or progressing, the bot will:
 *  - Wander around exploring
 *  - Gather nearby resources (wood, food, ores)
 *  - Fight hostile mobs that get close
 *  - Try to sleep at night
 *  - Follow the nearest player loosely
 */

import Vec3 from "vec3";

const GATHER_BLOCKS = [
  "oak_log",
  "birch_log",
  "spruce_log",
  "dark_oak_log",
  "acacia_log",
  "jungle_log",
  "coal_ore",
  "deepslate_coal_ore",
  "iron_ore",
  "deepslate_iron_ore",
];

const FOOD_ANIMALS = ["cow", "pig", "sheep", "chicken"];

export function setupAutonomous(bot) {
  let autonomousInterval = null;
  let lastAction = Date.now();
  let wanderCount = 0;

  /** Start autonomous behavior loop. */
  function startAutonomous() {
    if (autonomousInterval) return;
    autonomousInterval = setInterval(() => tick(), 5000);
    console.log("[Autonomous] Started.");
  }

  /** Stop autonomous behavior. */
  function stopAutonomous() {
    if (autonomousInterval) {
      clearInterval(autonomousInterval);
      autonomousInterval = null;
    }
  }

  bot.friendlyBot.startAutonomous = startAutonomous;
  bot.friendlyBot.stopAutonomous = stopAutonomous;

  /** Main autonomous tick — decide what to do. */
  async function tick() {
    // Only act when idle
    if (bot.friendlyBot.mode !== "idle") return;
    if (bot.friendlyBot.busy) return;

    bot.friendlyBot.busy = true;

    try {
      // Priority 1: Fight nearby hostiles
      const hostile = bot.friendlyBot.findNearestHostile(
        bot.entity.position,
        16,
      );
      if (hostile) {
        bot.friendlyBot.combatTaunt?.();
        await bot.friendlyBot.attackEntity(hostile);
        return;
      }

      // Priority 2: Sleep at night
      if (bot.time && !bot.time.isDay) {
        const slept = await bot.friendlyBot.tryToSleep();
        if (slept) return;
      }

      // Priority 3: Stay near the closest player (loose follow)
      const nearestPlayer = findNearestPlayer();
      if (nearestPlayer) {
        const dist = nearestPlayer.entity.position.distanceTo(
          bot.entity.position,
        );
        if (dist > 20) {
          // Too far, run back
          try {
            await bot.friendlyBot.goTo(nearestPlayer.entity.position, 5);
          } catch {
            /* path blocked */
          }
          return;
        }
      }

      // Priority 4: Gather resources if inventory isn't full
      if (!bot.friendlyBot.isInventoryFull()) {
        const gathered = await tryGatherNearby();
        if (gathered) return;
      }

      // Priority 5: Hunt animals for food if hungry
      if (!bot.friendlyBot.hasEnoughFood(8)) {
        const hunted = await tryHuntAnimal();
        if (hunted) return;
      }

      // Priority 6: Wander / explore
      await wander();
    } catch (err) {
      console.log(`[Autonomous] Error: ${err.message}`);
    } finally {
      bot.friendlyBot.busy = false;
      lastAction = Date.now();
    }
  }

  /** Find the closest human player. */
  function findNearestPlayer() {
    let nearest = null;
    let nearestDist = Infinity;
    for (const player of Object.values(bot.players)) {
      if (!player.entity || player.username === bot.username) continue;
      const dist = player.entity.position.distanceTo(bot.entity.position);
      if (dist < nearestDist) {
        nearest = player;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  /** Try to gather a nearby resource block. */
  async function tryGatherNearby() {
    for (const blockName of GATHER_BLOCKS) {
      try {
        const success = await bot.friendlyBot.mineBlock(blockName, 1);
        if (success) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  /** Try to hunt a nearby food animal. */
  async function tryHuntAnimal() {
    for (const animalName of FOOD_ANIMALS) {
      const animal = Object.values(bot.entities).find(
        (e) =>
          e.name === animalName &&
          e.position.distanceTo(bot.entity.position) < 24,
      );
      if (animal) {
        bot.chat(`I'm hungry… sorry, ${animalName}!`);
        await bot.friendlyBot.attackEntity(animal);
        return true;
      }
    }
    return false;
  }

  /** Wander in a random direction, staying near players. */
  async function wander() {
    wanderCount++;
    const nearestPlayer = findNearestPlayer();

    let target;
    if (nearestPlayer && wanderCount % 3 === 0) {
      // Every 3rd wander, drift toward the player
      target = nearestPlayer.entity.position.offset(
        (Math.random() - 0.5) * 10,
        0,
        (Math.random() - 0.5) * 10,
      );
    } else {
      // Random wander
      target = bot.entity.position.offset(
        (Math.random() - 0.5) * 20,
        0,
        (Math.random() - 0.5) * 20,
      );
    }

    try {
      await bot.friendlyBot.goTo(target, 2);
    } catch {
      /* path blocked, that's fine */
    }
  }

  // Auto-start autonomous behavior after spawn
  setTimeout(() => {
    if (bot.friendlyBot.mode === "idle") {
      startAutonomous();
      bot.chat("I'll look around and gather some resources!");
    }
  }, 5000);

  console.log("[Autonomous] Ready.");
}
