import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchStall } from '../webgl/stallWatch';

describe('watchStall', () => {
  let clock = 0;
  const now = () => clock;
  /** Advances the fake clock and fires the interval ticks that fall inside it. */
  const run = (ms: number, jankAt?: { at: number; blockedMs: number }) => {
    let remaining = ms;
    while (remaining > 0) {
      const step = Math.min(250, remaining);
      clock += step;
      if (jankAt && clock >= jankAt.at && jankAt.blockedMs > 0) {
        clock += jankAt.blockedMs; // the main thread was busy: the next tick arrives late
        jankAt.blockedMs = 0;
      }
      vi.advanceTimersByTime(step);
      remaining -= step;
    }
  };

  beforeEach(() => {
    clock = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('fires once after the budget of quiet, responsive time', () => {
    const onStall = vi.fn();
    watchStall(onStall, 2000, 250, now);
    run(1750);
    expect(onStall).not.toHaveBeenCalled();
    run(500);
    expect(onStall).toHaveBeenCalledTimes(1);
    run(5000);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it('does not count a long main-thread block as a stall', () => {
    const onStall = vi.fn();
    watchStall(onStall, 2000, 250, now);
    run(1000, { at: 500, blockedMs: 5000 }); // 5 s frozen: counts as 0.5 s, not 5 s
    expect(onStall).not.toHaveBeenCalled();
  });

  it('progress restarts the budget', () => {
    const onStall = vi.fn();
    const watch = watchStall(onStall, 2000, 250, now);
    run(1500);
    watch.progress();
    run(1500);
    expect(onStall).not.toHaveBeenCalled();
    run(1000);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it('stop() prevents any later stall and is safe to repeat', () => {
    const onStall = vi.fn();
    const watch = watchStall(onStall, 1000, 250, now);
    run(500);
    watch.stop();
    watch.stop();
    run(5000);
    expect(onStall).not.toHaveBeenCalled();
  });
});
