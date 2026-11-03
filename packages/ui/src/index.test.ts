import { describe, expect, it } from 'vitest';
import { tokens } from './index.js';

describe('UI tokens', () => {
  it('defines the base design primitives', () => {
    expect(tokens.color.brand).toBe('#2563eb');
    expect(tokens.spacing[4]).toBe('1rem');
    expect(tokens.radius.md).toBe('0.5rem');
    expect(tokens.motion.normal).toBe('200ms');
  });
});
