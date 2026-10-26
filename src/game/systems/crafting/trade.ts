/** Shop access and authoritative purchases and sales. */
import { CRAFTER_KIT, TORCH, crafterKitPrice } from '../../content/equipment.ts';
import { CRATE_PRICE, STORES, enchantedPrice, storePrice } from '../../content/shops.ts';
import type { Command } from '../../command-types.ts';
import { HERO } from '../../content/heroes.ts';
import type { Hero } from '../../entity-types.ts';
import type { Sim } from '../../sim.ts';
import { dist } from '../../../core/math.ts';
import { insideOf } from '../rooms.ts';
import { scrollPrice } from './site-rules.ts';
import { shopCatalogue } from '../../shop.ts';

export function nearStore(sim: Sim, h: Hero, store: string): boolean {
  if (h.dead || !sim.state.discovered.includes(store as never)) return false;
  const poi = sim.state.pois.find((p) => p.store === store);
  if (store === 'market') {
    const shop = sim.state.buildings.find((b) => b.kind === 'shop' && b.hp > 0);
    if (!shop || !insideOf(sim, h, shop)) return false;
    return !!poi && dist(h.x, h.z, poi.x, poi.z) < poi.r + HERO.reach + 0.6;
  }
  return !!poi && dist(h.x, h.z, poi.x, poi.z) < poi.r + 5;
}

export function applyTradeCommand(sim: Sim, cmd: Command): void {
  const s = sim.state;
  switch (cmd.t) {
    case 'buy': {
      const h = sim.getAs(cmd.hero, 'hero');
      const store = STORES[cmd.store] ? shopCatalogue(cmd.store, s.road) : undefined;
      if (!h || !store || !nearStore(sim, h, cmd.store)) return;
      if (cmd.scroll) {
        if (!store.scrolls.includes(cmd.scroll)) return;
        if (s.library.includes(cmd.scroll)) {
          sim.emit('denied', { hero: h.id, reason: 'Already in your library' });
          return;
        }
        const price = scrollPrice(h, cmd.scroll);
        if (!sim.pay(price)) {
          sim.emit('denied', { hero: h.id, reason: 'Not enough gold' });
          return;
        }
        s.library.push(cmd.scroll);
        sim.emit('bought', { hero: h.id, store: cmd.store, scroll: cmd.scroll, count: 1, cost: price });
        return;
      }
      if (cmd.item) {
        if (!store.goods.includes(cmd.item)) return;
        if (sim.bagSpace(h, cmd.item) <= 0) {
          sim.emit('denied', { hero: h.id, reason: 'Your bag is full' });
          return;
        }
        const unit = storePrice(cmd.store, cmd.item);
        const count = Math.max(
          1,
          Math.min(cmd.count ?? 1, sim.bagSpace(h, cmd.item), s.dev ? Infinity : Math.floor(s.gold / unit)),
        );
        const cost = unit * count;
        if (count < 1 || !sim.pay(cost)) {
          sim.emit('denied', { hero: h.id, reason: 'Not enough gold' });
          return;
        }
        sim.addToBag(h, cmd.item, count);
        sim.emit('bought', { hero: h.id, store: cmd.store, item: cmd.item, count, cost });
      }
      return;
    }
    case 'toggleTorch': {
      const h = sim.getAs(cmd.hero, 'hero');
      if (h && !h.dead && h.torchOwned) h.torchLit = h.torchLit === false;
      else if (h)
        sim.emit('denied', { hero: h.id, reason: 'Buy a Pitchwood Torch at the shop counter first' });
      return;
    }
    case 'buyTorch': {
      const h = sim.getAs(cmd.hero, 'hero');
      if (!h || h.dead || cmd.store !== 'market' || !nearStore(sim, h, cmd.store)) return;
      if (h.torchOwned) return;
      if (!sim.pay(TORCH.price)) {
        sim.emit('denied', { hero: h.id, reason: 'Not enough gold for a torch' });
        return;
      }
      h.torchOwned = true;
      h.torchLit = true;
      sim.emit('bought', { hero: h.id, store: cmd.store, torch: true, count: 1, cost: TORCH.price });
      return;
    }
    case 'buyCrafterKit': {
      const h = sim.getAs(cmd.hero, 'hero');
      const store = STORES[cmd.store];
      if (!h || h.dead || !store?.crafterKit || !nearStore(sim, h, cmd.store)) return;
      const missing = CRAFTER_KIT.tools.filter((tool) => !h.tools.includes(tool));
      if (!missing.length) {
        sim.emit('denied', { hero: h.id, reason: 'You already have the complete Crafter Kit' });
        return;
      }
      const price = crafterKitPrice(h.tools);
      if (!sim.pay(price)) {
        sim.emit('denied', { hero: h.id, reason: 'Not enough gold for the Crafter Kit' });
        return;
      }
      h.tools.push(...missing);
      sim.emit('bought', { hero: h.id, store: cmd.store, kit: true, count: 1, cost: price });
      return;
    }
    case 'buyGear': {
      const h = sim.getAs(cmd.hero, 'hero');
      if (!h || !nearStore(sim, h, cmd.store)) return;
      const stock = s.stock[cmd.store] ?? [];
      const idx = stock.findIndex((g) => g.uid === cmd.uid);
      if (idx < 0) return;
      const inst = stock[idx];
      if (!inst) return;
      const price = enchantedPrice(inst.base, inst.rarity, inst.ilvl);
      if (!sim.canPay(price)) {
        sim.emit('denied', { hero: h.id, reason: 'Not enough gold' });
        return;
      }
      if (sim.bagFree(h) <= 0) {
        sim.emit('denied', { hero: h.id, reason: 'Your bag is full' });
        return;
      }
      sim.pay(price);
      stock.splice(idx, 1);
      h.gear.push(inst);
      sim.emit('bought', { hero: h.id, store: cmd.store, inst, count: 1, cost: price });
      return;
    }
    case 'buyCrate': {
      const h = sim.getAs(cmd.hero, 'hero');
      if (!h || !STORES[cmd.store].crates || !nearStore(sim, h, cmd.store)) return;
      if (!sim.canPay(CRATE_PRICE)) {
        sim.emit('denied', { hero: h.id, reason: 'Not enough gold' });
        return;
      }
      if (sim.bagFree(h) <= 0) {
        sim.emit('denied', { hero: h.id, reason: 'Your bag is full' });
        return;
      }
      sim.pay(CRATE_PRICE);
      const inst = sim.rollGear();
      h.gear.push(inst);
      sim.emit('crateOpened', { hero: h.id, inst });
      return;
    }
    case 'sell': {
      if (cmd.store === 'market') return;
      const h = sim.getAs(cmd.hero, 'hero');
      if (!h || !nearStore(sim, h, cmd.store)) return;
      const n = sim.takeFromBag(h, cmd.item, cmd.count);
      if (n <= 0) return;
      const gain = Math.floor((storePrice(cmd.store, cmd.item) * n) / 2);
      s.gold += gain;
      sim.emit('sold', { hero: h.id, store: cmd.store, item: cmd.item, count: n, gain });
      return;
    }
    case 'sellGear': {
      const h = sim.getAs(cmd.hero, 'hero');
      if (!h || !nearStore(sim, h, cmd.store)) return;
      const idx = h.gear.findIndex((g) => g.uid === cmd.uid);
      if (idx < 0) return;
      // A successful findIndex above identifies the element removed synchronously here.
      const inst = h.gear.splice(idx, 1)[0]!;
      const gain = Math.floor(enchantedPrice(inst.base, inst.rarity, inst.ilvl) / 3);
      s.gold += gain;
      sim.emit('sold', { hero: h.id, store: cmd.store, inst, count: 1, gain });
      return;
    }
  }
}
