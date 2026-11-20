export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

export function lastPageOffset(total, limit) {
  return Math.floor(Math.max(0, total - 1) / limit) * limit;
}
