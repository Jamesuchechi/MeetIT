import { describe, expect, it } from 'vitest';
import {
  computeLayout,
  MESH_MAX_PARTICIPANTS,
  SFU_MAX_PARTICIPANTS,
} from './layout';

describe('computeLayout', () => {
  it('computes 1-4 participant mesh modes correctly', () => {
    expect(computeLayout(1).mode).toBe('solo');
    expect(computeLayout(2, { preferPip: false, isPortrait: false }).mode).toBe(
      'pair',
    );
    expect(computeLayout(2, { preferPip: true }).mode).toBe('pip');
    expect(computeLayout(3, { isPortrait: false }).mode).toBe('trio');
    expect(computeLayout(4).mode).toBe('quad');
    expect(computeLayout(4).maxParticipants).toBe(MESH_MAX_PARTICIPANTS);
  });

  it('computes SFU gallery pagination for 25 participants', () => {
    const layout = computeLayout(25, { page: 1, pageSize: 9 });
    expect(layout.mode).toBe('gallery');
    expect(layout.maxParticipants).toBe(SFU_MAX_PARTICIPANTS);
    expect(layout.totalPages).toBe(3);
    expect(layout.page).toBe(1);
    expect(layout.columns).toBe(3);
  });

  it('computes speaker view mode with spotlight and filmstrip', () => {
    const layout = computeLayout(15, { isSpeakerView: true });
    expect(layout.mode).toBe('speaker');
    expect(layout.columns).toBe(1);
    expect(layout.filmstripCount).toBe(14);
  });
});
