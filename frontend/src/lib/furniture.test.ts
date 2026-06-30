import { describe, expect, it } from 'vitest';
import { boxOf } from './furniture';

describe('boxOf', () => {
  it('builds a floor box centred on its footprint', () => {
    const b = boxOf({
      mount: 'FLOOR',
      posX: 1,
      posZ: 2,
      posY: 0,
      width: 1.4,
      depth: 0.4,
      height: 1.4,
      rotation: 0,
    });
    expect(b.cx).toBeCloseTo(1);
    expect(b.cz).toBeCloseTo(2);
    expect(b.hx).toBeCloseTo(0.7);
    expect(b.hz).toBeCloseTo(0.2);
    expect(b.cy).toBeCloseTo(0.7); // posY + height/2
  });

  it('swaps the footprint when rotated 90°', () => {
    const b = boxOf({
      mount: 'FLOOR',
      posX: 0,
      posZ: 0,
      posY: 0,
      width: 1.4,
      depth: 0.4,
      height: 1.4,
      rotation: 90,
    });
    expect(b.hx).toBeCloseTo(0.2);
    expect(b.hz).toBeCloseTo(0.7);
  });

  it('pins a wall-back piece to the back wall (cz = 0)', () => {
    const b = boxOf({
      mount: 'WALL_BACK',
      posX: 1,
      posZ: 5,
      posY: 1,
      width: 1,
      depth: 0.3,
      height: 0.5,
      rotation: 0,
    });
    expect(b.cz).toBe(0);
    expect(b.cy).toBeCloseTo(1.25); // posY + height/2
  });
});
