import type { Player, TourPlayer } from './types';

function nonBlank(value?: string) {
  return value?.trim() ? value : undefined;
}

export function tourDisplayPlayer(player: Player, tourPlayer?: Pick<TourPlayer, 'nickname' | 'photoUrl' | 'profileBio'>): Player {
  return {
    ...player,
    nickname: nonBlank(tourPlayer?.nickname) ?? player.nickname,
    photoUrl: nonBlank(tourPlayer?.photoUrl) ?? player.photoUrl,
    profileBio: nonBlank(tourPlayer?.profileBio) ?? player.profileBio,
  };
}
