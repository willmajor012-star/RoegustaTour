export type AdminTab =
  | 'Overview'
  | 'Tour setup'
  | 'Player library'
  | 'Squads & teams'
  | 'Courses'
  | 'Rounds & tee times'
  | 'Matches & pairings'
  | 'Result entry'
  | 'Tour itinerary'
  | 'Admin guide'
  | 'Settings'
  | 'Bet Punto'
  | 'Handbook';

export type AdminWorkspaceId = 'live' | 'tour' | 'people' | 'pairings' | 'bet-punto' | 'settings';

export type AdminWorkspace = {
  id: AdminWorkspaceId;
  label: string;
  description: string;
  tabs: Array<{ id: AdminTab; label: string; legacy?: boolean }>;
};

export const adminWorkspaces: AdminWorkspace[] = [
  { id: 'live', label: 'Live', description: 'Results and playing winners', tabs: [] },
  {
    id: 'tour',
    label: 'Tour',
    description: 'Details, golf and itinerary',
    tabs: [
      { id: 'Overview', label: 'Overview' },
      { id: 'Tour setup', label: 'Tour details' },
      { id: 'Courses', label: 'Courses' },
      { id: 'Rounds & tee times', label: 'Rounds' },
      { id: 'Tour itinerary', label: 'Itinerary & shirts' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    description: 'Players, attendance and teams',
    tabs: [
      { id: 'Player library', label: 'Player library' },
      { id: 'Squads & teams', label: 'Attendance & teams' },
    ],
  },
  {
    id: 'pairings',
    label: 'Pairings',
    description: 'Tee sheets and corrections',
    tabs: [
      { id: 'Matches & pairings', label: 'Matches & tee times' },
      { id: 'Result entry', label: 'Corrections' },
    ],
  },
  { id: 'bet-punto', label: 'Bet Punto', description: 'Markets, tally and corrections', tabs: [{ id: 'Bet Punto', label: 'Markets & ledger' }] },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Access, help and archive tools',
    tabs: [
      { id: 'Settings', label: 'Public access' },
      { id: 'Admin guide', label: 'Admin guide' },
      { id: 'Handbook', label: 'Legacy archive', legacy: true },
    ],
  },
];

export function visibleWorkspaceTabs(workspace: AdminWorkspace, showLegacy: boolean) {
  return workspace.tabs.filter((tab) => showLegacy || !tab.legacy);
}

export function defaultAdminTab(workspaceId: AdminWorkspaceId, showLegacy = false): AdminTab | null {
  const workspace = adminWorkspaces.find((candidate) => candidate.id === workspaceId);
  return workspace ? visibleWorkspaceTabs(workspace, showLegacy)[0]?.id ?? null : null;
}
