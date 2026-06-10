import type { Player } from './types';

export function getPlayerInitials(player?: Pick<Player, 'displayName' | 'initials'>) {
  if (player?.initials?.trim()) return player.initials.trim().slice(0, 3).toUpperCase();
  const name = player?.displayName?.trim();
  if (!name) return 'RT';
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
