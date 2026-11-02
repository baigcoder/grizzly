/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from 'vitest';
import { FLAVORS } from '../data/flavors';
import { BENEFITS } from '../data/benefits';
import { FAQ_ITEMS } from '../data/faq';
import { LABEL, publicText, confirmed, isTodo } from '../data/brand';
import { PRODUCTS, getProductBySlug, getRelatedProducts } from '../data/products';
import { cartStore, createCheckoutSession } from '../store/cart';
import { audioManager } from '../audio/audioManager';

describe('Grizzly Energy data and state', () => {
  beforeEach(() => {
    cartStore.clearCart();
  });

  it('has eight flavors with distinct slugs, accent tokens and label textures', () => {
    expect(FLAVORS.map((f) => f.name)).toEqual([
      'Blue Raspberry', 'Mango Fuego', 'Watermelon', 'Strawberry Kiwi', 'Peach', 'Blackout Berry', 'Falsa Frost', 'Cold Coffee',
    ]);
    expect(new Set(FLAVORS.map((f) => f.id)).size).toBe(8);
    expect(new Set(FLAVORS.map((f) => f.accentToken)).size).toBe(8);
    FLAVORS.forEach((flavor, index) => {
      expect(flavor.index).toBe(index);
      expect(flavor.theme.secondary).toMatch(/^#[0-9a-f]{6}$/i);
      expect(flavor.textureUrl).toBe(`/textures/grizzly/${flavor.id}.webp`);
      expect(flavor.surfaceUrl).toBe(`/textures/grizzly/${flavor.id}-surface.png`);
    });
  });

  it('ships the can art of every flavor: label maps, GPU levels, thumbnail and roar bear', () => {
    // a flavor added to grizzly.json without its art shows a blank can in the 3D scene
    const shipped = new Set(Object.keys(import.meta.glob(['/public/textures/grizzly/**/*.{webp,png,ktx2}', '/public/products/thumbs/*.webp'])));
    FLAVORS.forEach(({ id }) => {
      const files = [
        `public/textures/grizzly/${id}.webp`,
        `public/textures/grizzly/${id}-surface.png`,
        ...['1k', '2k', '2k-lite', '4k', 'surface', 'normal'].map((level) => `public/textures/grizzly/ktx2/${id}-${level}.ktx2`),
        `public/products/thumbs/${id}.webp`,
        `public/textures/grizzly/bear/${id}.webp`,
      ];
      files.forEach((file) => expect(shipped.has(`/${file}`), file).toBe(true));
    });
  });

  it('has the four label benefits in label order, each with a spotlight block', () => {
    expect(BENEFITS.map((b) => b.title)).toEqual([
      'Natural caffeine', 'Natural electrolytes', 'B vitamins', 'Added Zamzam water',
    ]);
    expect(LABEL.benefitBlocks).toHaveLength(BENEFITS.length);
    LABEL.benefitBlocks.forEach(([u0, v0, u1, v1]) => {
      expect(u0).toBeGreaterThanOrEqual(LABEL.panels.right[0]);
      expect(u1).toBeLessThanOrEqual(LABEL.panels.right[1]);
      expect(v1).toBeGreaterThan(v0);
    });
  });

  it('never shows raw TODO text to visitors', () => {
    expect(publicText('Every can. TODO: confirm source.')).toBe('Every can. Details to be confirmed.');
    expect(confirmed('TODO: price', 'Price to follow')).toBe('Price to follow');
    BENEFITS.forEach((b) => {
      expect(publicText(b.description)).not.toContain('TODO');
      expect(publicText(b.spec)).not.toContain('TODO');
    });
    FAQ_ITEMS.forEach((item) => expect(publicText(item.answer)).not.toContain('TODO'));
    expect(isTodo('TODO: x')).toBe(true);
  });

  it('keeps sound off by default and toggles on demand', () => {
    expect(audioManager.isMuted()).toBe(true);
    expect(audioManager.toggleMute()).toBe(false);
    audioManager.toggleMute();
    expect(audioManager.isMuted()).toBe(true);
  });

  it('builds the catalog from the same data with placeholder packs', () => {
    expect(PRODUCTS).toHaveLength(FLAVORS.length);
    PRODUCTS.forEach((product, index) => {
      expect(product.index).toBe(index);
      expect(product.packOptions.map((p) => p.count)).toEqual([1, 6, 12, 24]);
      expect(product.nutrition.rows.length).toBeGreaterThan(5);
    });
    expect(getProductBySlug('peach')?.name).toBe('Peach');
    const related = getRelatedProducts('peach');
    expect(related).toHaveLength(3);
    expect(related.every((r) => r.slug !== 'peach')).toBe(true);
  });

  it('adds, merges, updates and removes cart lines', () => {
    const product = PRODUCTS[0];
    expect(cartStore.addItem(product, 'pack-6', 2).ok).toBe(true);
    cartStore.addItem(product, 'pack-6', 1);
    let items = cartStore.getItems();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
    cartStore.updateQuantity(items[0].id, 5);
    expect(cartStore.getItems()[0].quantity).toBe(5);
    cartStore.removeItem(items[0].id);
    items = cartStore.getItems();
    expect(items).toHaveLength(0);
  });

  it('saves a line for later and moves it back without losing it', () => {
    const peach = getProductBySlug('peach')!;
    cartStore.addItem(peach, 'pack-6', 2);
    const id = cartStore.getItems()[0].id;
    cartStore.saveForLater(id);
    expect(cartStore.getItems()).toHaveLength(0);
    expect(cartStore.getSnapshot().saved.map((line) => line.quantity)).toEqual([2]);
    cartStore.moveToBag(id);
    expect(cartStore.getItems()[0].quantity).toBe(2);
    expect(cartStore.getSnapshot().saved).toHaveLength(0);
  });

  it('rejects unknown pack sizes instead of guessing', () => {
    expect(cartStore.addItem(PRODUCTS[0], 'pallet' as never, 1)).toEqual({ ok: false, reason: 'unknown-pack' });
  });

  it('never reports a successful order without a payment backend', async () => {
    expect((await createCheckoutSession([])).status).toBe('GATEWAY_UNAVAILABLE');
    cartStore.addItem(PRODUCTS[0], 'pack-6', 1);
    expect((await createCheckoutSession(cartStore.getItems())).status).toBe('GATEWAY_UNAVAILABLE');
  });
});
