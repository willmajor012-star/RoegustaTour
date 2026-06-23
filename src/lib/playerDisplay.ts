import type { Player, TourPlayer } from './types';

export function tourDisplayPlayer(player: Player, tourPlayer?: Pick<TourPlayer, 'nickname' | 'photoUrl' | 'profileBio'>): Player {
  return {
    ...player,
    nickname: tourPlayer?.nickname ?? player.nickname,
    photoUrl: tourPlayer?.photoUrl ?? player.photoUrl,
    profileBio: tourPlayer?.profileBio ?? player.profileBio,
  };
}
