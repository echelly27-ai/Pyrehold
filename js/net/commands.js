// Player intent goes through commands. A future multiplayer host can
// receive the same calls and apply them on the authority simulation.
// Zombie damage and wave ticks stay inside the simulation; they are not commands.

export function createCommands(game) {
  return {
    place() {
      return game.buildings.placeSelected();
    },
    demolish() {
      game.buildings.demolishLooked();
    },
    upgradeLooked() {
      game.buildings.upgradeLooked();
    },
    toggleGate(building) {
      game.buildings.toggleGate(building);
    },
    setBuild(id) {
      game.buildings.select(id);
    },
    buyWeapon(id) {
      return game.armory.buy(id);
    },
    upgradeWeapon(id) {
      return game.armory.tryUpgrade(id);
    },
    equip(id) {
      game.armory.equip(id);
    },
    buyAmmo(type) {
      const pack = game.ammoPack(type);
      if (!pack) return;
      const price = Math.round(pack.price * game.marketBuyMul());
      if (game.inventory.gold < price) {
        game.notify("Not enough gold", "bad");
        game.audio.play("error");
        return;
      }
      game.inventory.gold -= price;
      game.armory.addAmmo(type, pack.rounds);
      game.notify("+" + pack.rounds + " " + pack.name, "good");
      game.audio.play("gold");
    },
    buyMedkit() {
      const price = Math.round(80 * game.marketBuyMul());
      if (game.inventory.gold < price) {
        game.notify("Not enough gold", "bad");
        return;
      }
      if (game.player.hp >= game.player.maxHp - 1) {
        game.notify("Already healthy", "bad");
        return;
      }
      game.inventory.gold -= price;
      game.player.heal(45);
      game.audio.play("pickup");
    },
    sell(res, amount) {
      const have = game.inventory.amount(res);
      const n = Math.max(0, Math.min(have, amount));
      if (!n) return;
      const unit = game.marketSell(res);
      game.inventory[res] -= n;
      const gold = Math.floor(unit * n);
      game.inventory.add("gold", gold);
      game.notify("Sold " + n + " " + res + " for " + gold + " gold", "good");
    },
    buyMat(res, amount) {
      const unit = Math.round(game.marketBuy(res));
      const cost = unit * amount;
      if (game.inventory.gold < cost) {
        game.notify("Not enough gold", "bad");
        return;
      }
      game.inventory.gold -= cost;
      const added = game.inventory.add(res, amount);
      if (added < amount) game.inventory.gold += unit * (amount - added);
    },
    upgradeBase() {
      game.progression.upgradeTier();
    },
    upgradeStorage() {
      game.inventory.upgradeStorage();
    },
    spendSkill(tree, skill) {
      game.progression.spend(tree, skill);
    },
    callWave() {
      game.waves.callEarly();
    },
    buyPad(id) {
      return game.tycoon.purchase(id);
    },
  };
}
