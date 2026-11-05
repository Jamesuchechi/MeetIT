export interface LayoutConfig {
  mode: 'solo' | 'pair' | 'trio' | 'quad' | 'spotlight';
  columns: number;
  rows: number;
  maxParticipants: number;
  isRoomFull: boolean;
  filmstripCount: number;
}

export const MESH_MAX_PARTICIPANTS = 4;

/**
 * Computes the dynamic grid layout for 1 to 4 mesh participants,
 * including spotlight/pin-on-share mode and mobile portrait orientation.
 */
export function computeLayout(
  participantCount: number,
  options: {
    hasSpotlight?: boolean;
    isPortrait?: boolean;
  } = {},
): LayoutConfig {
  const clamped = Math.max(
    1,
    Math.min(participantCount, MESH_MAX_PARTICIPANTS),
  );
  const isRoomFull = participantCount >= MESH_MAX_PARTICIPANTS;
  const hasSpotlight = options.hasSpotlight ?? false;
  const isPortrait = options.isPortrait ?? false;

  if (hasSpotlight) {
    return {
      mode: 'spotlight',
      columns: 1,
      rows: 1,
      maxParticipants: MESH_MAX_PARTICIPANTS,
      isRoomFull,
      filmstripCount: clamped,
    };
  }

  if (clamped === 1) {
    return {
      mode: 'solo',
      columns: 1,
      rows: 1,
      maxParticipants: MESH_MAX_PARTICIPANTS,
      isRoomFull,
      filmstripCount: 0,
    };
  }

  if (clamped === 2) {
    return {
      mode: 'pair',
      columns: isPortrait ? 1 : 2,
      rows: isPortrait ? 2 : 1,
      maxParticipants: MESH_MAX_PARTICIPANTS,
      isRoomFull,
      filmstripCount: 0,
    };
  }

  if (clamped === 3) {
    return {
      mode: 'trio',
      columns: isPortrait ? 1 : 2,
      rows: isPortrait ? 3 : 2,
      maxParticipants: MESH_MAX_PARTICIPANTS,
      isRoomFull,
      filmstripCount: 0,
    };
  }

  return {
    mode: 'quad',
    columns: 2,
    rows: 2,
    maxParticipants: MESH_MAX_PARTICIPANTS,
    isRoomFull,
    filmstripCount: 0,
  };
}
