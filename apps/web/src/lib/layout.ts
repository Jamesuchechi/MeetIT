export type LayoutMode =
  | 'solo'
  | 'pair'
  | 'trio'
  | 'quad'
  | 'spotlight'
  | 'pip'
  | 'gallery'
  | 'speaker';

export interface LayoutConfig {
  mode: LayoutMode;
  columns: number;
  rows: number;
  maxParticipants: number;
  isRoomFull: boolean;
  filmstripCount: number;
  isPip?: boolean;
  page: number;
  totalPages: number;
  pageSize: number;
}

export const MESH_MAX_PARTICIPANTS = 4;
export const SFU_MAX_PARTICIPANTS = 100;
export const DEFAULT_GALLERY_PAGE_SIZE = 9;

export interface LayoutOptions {
  hasSpotlight?: boolean | undefined;
  isPortrait?: boolean | undefined;
  preferPip?: boolean | undefined;
  isSpeakerView?: boolean | undefined;
  isSfu?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

/**
 * Computes the dynamic layout for mesh (1-4) or SFU (1-100) participants,
 * including spotlight, speaker view, gallery pagination, and mobile portrait PiP.
 */
export function computeLayout(
  participantCount: number,
  options: LayoutOptions = {},
): LayoutConfig {
  const isSfu = options.isSfu ?? participantCount > MESH_MAX_PARTICIPANTS;
  const maxCapacity = isSfu ? SFU_MAX_PARTICIPANTS : MESH_MAX_PARTICIPANTS;
  const isRoomFull = participantCount >= maxCapacity;
  const hasSpotlight = options.hasSpotlight ?? false;
  const isPortrait = options.isPortrait ?? false;
  const isSpeakerView = options.isSpeakerView ?? false;
  const shouldUsePip = options.preferPip ?? isPortrait;

  const pageSize =
    options.pageSize ?? (isPortrait ? 6 : DEFAULT_GALLERY_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(participantCount / pageSize));
  const currentPage = Math.max(1, Math.min(options.page ?? 1, totalPages));

  const clamped = Math.max(
    1,
    Math.min(participantCount, MESH_MAX_PARTICIPANTS),
  );

  if (hasSpotlight || isSpeakerView) {
    return {
      mode: isSpeakerView ? 'speaker' : 'spotlight',
      columns: 1,
      rows: 1,
      maxParticipants: maxCapacity,
      isRoomFull,
      filmstripCount: isSpeakerView
        ? Math.max(0, participantCount - 1)
        : clamped,
      isPip: false,
      page: currentPage,
      totalPages,
      pageSize,
    };
  }

  // SFU Multi-participant gallery mode (> 4 participants)
  if (isSfu && participantCount > 4) {
    const visibleCount = Math.min(
      pageSize,
      participantCount - (currentPage - 1) * pageSize,
    );
    const cols = isPortrait ? 2 : visibleCount <= 4 ? 2 : 3;
    const rws = Math.ceil(visibleCount / cols);

    return {
      mode: 'gallery',
      columns: Math.max(1, cols),
      rows: Math.max(1, rws),
      maxParticipants: maxCapacity,
      isRoomFull,
      filmstripCount: 0,
      isPip: false,
      page: currentPage,
      totalPages,
      pageSize,
    };
  }

  // Mesh 1 to 4 participant layouts
  if (clamped === 1) {
    return {
      mode: 'solo',
      columns: 1,
      rows: 1,
      maxParticipants: maxCapacity,
      isRoomFull,
      filmstripCount: 0,
      isPip: false,
      page: 1,
      totalPages: 1,
      pageSize,
    };
  }

  if (clamped === 2) {
    if (shouldUsePip) {
      return {
        mode: 'pip',
        columns: 1,
        rows: 1,
        maxParticipants: maxCapacity,
        isRoomFull,
        filmstripCount: 0,
        isPip: true,
        page: 1,
        totalPages: 1,
        pageSize,
      };
    }
    return {
      mode: 'pair',
      columns: isPortrait ? 1 : 2,
      rows: isPortrait ? 2 : 1,
      maxParticipants: maxCapacity,
      isRoomFull,
      filmstripCount: 0,
      isPip: false,
      page: 1,
      totalPages: 1,
      pageSize,
    };
  }

  if (clamped === 3) {
    return {
      mode: 'trio',
      columns: isPortrait ? 1 : 2,
      rows: isPortrait ? 3 : 2,
      maxParticipants: maxCapacity,
      isRoomFull,
      filmstripCount: 0,
      isPip: false,
      page: 1,
      totalPages: 1,
      pageSize,
    };
  }

  return {
    mode: 'quad',
    columns: 2,
    rows: 2,
    maxParticipants: maxCapacity,
    isRoomFull,
    filmstripCount: 0,
    isPip: false,
    page: 1,
    totalPages: 1,
    pageSize,
  };
}
