import type { MatchFormat } from './types';

export const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
export const formatPoints = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
export const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'TBC';
export const formatShortDate = (value?: string) => value ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value)) : 'TBC';
export const formatMatchFormat = (format: MatchFormat) => ({ singles: 'Singles', better_ball: 'Better Ball', foursomes: 'Foursomes', scramble: 'Scramble', custom: 'Custom' })[format];
