/**
 * Navigation plugin — pathfinding helpers.
 */

import pathfinderPkg from "mineflayer-pathfinder";
const { Movements, goals } = pathfinderPkg;
import mcDataLoader from "minecraft-data";

export function setupNavigation(bot) {
  const mcData = mcDataLoader(bot.version);
  const defaultMove = new Movements(bot);
  defaultMove.scafoldingBlocks = [];
  defaultMove.canDig = true;
  defaultMove.allow1by1towers = true;
  bot.pathfinder.setMovements(defaultMove);

  /** Go to a position { x, y, z }. Returns a Promise. */
  bot.friendlyBot.goTo = async (pos, range = 1) => {
    const goal = new goals.GoalNear(pos.x, pos.y, pos.z, range);
    await bot.pathfinder.goto(goal);
  };

  /** Follow an entity at a given distance. */
  bot.friendlyBot.followEntity = (entity, range = 3) => {
    const goal = new goals.GoalFollow(entity, range);
    bot.pathfinder.setGoal(goal, true);
  };

  /** Stop all pathfinding. */
  bot.friendlyBot.stopMoving = () => {
    bot.pathfinder.stop();
  };

  /** Go to a specific block type nearby. */
  bot.friendlyBot.goToBlock = async (blockName, range = 64) => {
    const block = bot.findBlock({
      matching: mcData.blocksByName[blockName]?.id,
      maxDistance: range,
    });
    if (!block) return null;
    await bot.friendlyBot.goTo(block.position, 2);
    return block;
  };

  /** Get a new Movements instance. */
  bot.friendlyBot.createMovements = () => new Movements(bot);

  console.log("[Navigation] Ready.");
}
