/**
 * End plugin — stronghold finding, End portal, Ender Dragon fight.
 */

import Vec3 from "vec3";
import mcDataLoader from "minecraft-data";

export function setupEnd(bot) {
  const mcData = mcDataLoader(bot.version);

  /** Craft Eyes of Ender from blaze powder + ender pearls. */
  bot.friendlyBot.craftEyesOfEnder = async (count = 12) => {
    const blazeRods = bot.friendlyBot.countItem("blaze_rod");
    const existingPowder = bot.friendlyBot.countItem("blaze_powder");
    const neededPowder = Math.max(0, count - existingPowder);

    if (neededPowder > 0 && blazeRods > 0) {
      await bot.friendlyBot.craftItem(
        "blaze_powder",
        Math.min(blazeRods, Math.ceil(neededPowder / 2)),
      );
    }

    const eyes = bot.friendlyBot.countItem("ender_eye");
    if (eyes >= count) return true;
    return await bot.friendlyBot.craftItem("ender_eye", count - eyes);
  };

  /** Throw Eyes of Ender and track direction to find stronghold. */
  bot.friendlyBot.locateStronghold = async () => {
    bot.chat("Throwing Eyes of Ender to locate the stronghold…");

    for (let i = 0; i < 3; i++) {
      const eye = bot.inventory.items().find((it) => it.name === "ender_eye");
      if (!eye) {
        bot.chat("I need more Eyes of Ender!");
        return null;
      }

      await bot.equip(eye, "hand");
      await bot.look(bot.entity.yaw, -Math.PI / 4);
      await bot.activateItem();
      await bot.waitForTicks(60);

      // Check for portal frames
      const portalFrame = bot.findBlock({
        matching: mcData.blocksByName.end_portal_frame?.id,
        maxDistance: 128,
      });
      if (portalFrame) {
        bot.chat("Found the stronghold!");
        return portalFrame.position;
      }

      // Move for triangulation and retry
      const moveDir = new Vec3(
        (Math.random() > 0.5 ? 1 : -1) * 80,
        0,
        (Math.random() > 0.5 ? 1 : -1) * 80,
      );
      try {
        await bot.friendlyBot.goTo(bot.entity.position.plus(moveDir), 5);
      } catch {
        /* best effort */
      }
    }

    bot.chat("Following the Eye of Ender direction…");
    return null;
  };

  /** Fill End portal frames with Eyes of Ender. */
  bot.friendlyBot.activateEndPortal = async () => {
    const frameId = mcData.blocksByName.end_portal_frame?.id;
    if (!frameId) return false;

    const frames = bot.findBlocks({
      matching: frameId,
      maxDistance: 16,
      count: 12,
    });
    if (frames.length === 0) {
      bot.chat("I can't find the End portal frames nearby.");
      return false;
    }

    bot.chat("Activating the End portal…");
    for (const pos of frames) {
      const block = bot.blockAt(new Vec3(pos.x, pos.y, pos.z));
      if (!block) continue;

      const hasEye = block.getProperties?.().eye === "true";
      if (hasEye) continue;

      const eye = bot.inventory.items().find((i) => i.name === "ender_eye");
      if (!eye) {
        bot.chat("I ran out of Eyes of Ender!");
        return false;
      }

      await bot.friendlyBot.goTo(pos, 3);
      await bot.equip(eye, "hand");
      try {
        await bot.activateBlock(block);
      } catch {}
      await bot.waitForTicks(10);
    }

    bot.chat("End portal activated! Jumping in!");
    return true;
  };

  /** Fight the Ender Dragon. */
  bot.friendlyBot.fightDragon = async () => {
    bot.chat("Fighting the Ender Dragon! Wish me luck!");
    bot.friendlyBot.busy = true;

    try {
      // Step 1: Destroy End Crystals
      await destroyEndCrystals();
      // Step 2: Attack the dragon
      await attackDragon();
      bot.chat("We defeated the Ender Dragon! GG!");
    } catch (err) {
      console.log(`[End] Dragon fight error: ${err.message}`);
      bot.chat("The dragon fight was tough… I might need another try.");
    } finally {
      bot.friendlyBot.busy = false;
    }
  };

  async function destroyEndCrystals() {
    bot.chat("Destroying End Crystals first…");
    for (let i = 0; i < 60; i++) {
      const crystal = Object.values(bot.entities).find(
        (e) =>
          e.name === "end_crystal" &&
          e.position.distanceTo(bot.entity.position) < 64,
      );
      if (!crystal) break;

      const bow = bot.inventory.items().find((i) => i.name === "bow");
      if (bow && crystal.position.distanceTo(bot.entity.position) > 8) {
        await bot.equip(bow, "hand");
        await bot.lookAt(crystal.position.offset(0, 1, 0));
        bot.activateItem();
        await bot.waitForTicks(15);
        bot.deactivateItem();
      } else {
        try {
          await bot.friendlyBot.goTo(crystal.position, 4);
          await bot.friendlyBot.equipBestWeapon();
          await bot.attack(crystal);
        } catch {}
      }
      await bot.waitForTicks(20);
    }
  }

  async function attackDragon() {
    bot.chat("Engaging the Ender Dragon!");

    for (let round = 0; round < 300; round++) {
      const dragon = Object.values(bot.entities).find(
        (e) => e.name === "ender_dragon",
      );
      if (!dragon) {
        break;
      } // dragon defeated

      const dist = dragon.position.distanceTo(bot.entity.position);

      if (dist < 8) {
        await bot.friendlyBot.equipBestWeapon();
        try {
          await bot.attack(dragon);
        } catch {}
      } else if (dist < 48) {
        const bow = bot.inventory.items().find((i) => i.name === "bow");
        const arrows = bot.inventory.items().find((i) => i.name === "arrow");
        if (bow && arrows) {
          await bot.equip(bow, "hand");
          await bot.lookAt(dragon.position.offset(0, 2, 0));
          bot.activateItem();
          await bot.waitForTicks(15);
          bot.deactivateItem();
        } else {
          try {
            await bot.friendlyBot.goTo(dragon.position, 5);
          } catch {}
        }
      } else {
        try {
          await bot.friendlyBot.goTo({ x: 0, y: 64, z: 0 }, 10);
        } catch {}
      }

      await bot.waitForTicks(10);
    }
  }

  console.log("[End] Ready.");
}
