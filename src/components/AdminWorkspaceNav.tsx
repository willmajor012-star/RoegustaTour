import { adminWorkspaces, visibleWorkspaceTabs, type AdminTab, type AdminWorkspaceId } from '../lib/adminNavigation';

type Props = {
  activeWorkspace: AdminWorkspaceId;
  activeTab: AdminTab;
  showLegacy: boolean;
  onWorkspaceChange: (workspaceId: AdminWorkspaceId) => void;
  onTabChange: (tab: AdminTab) => void;
};

export function AdminWorkspaceNav({ activeWorkspace, activeTab, showLegacy, onWorkspaceChange, onTabChange }: Props) {
  const workspace = adminWorkspaces.find((candidate) => candidate.id === activeWorkspace) ?? adminWorkspaces[0];
  const tabs = visibleWorkspaceTabs(workspace, showLegacy);

  return <div className="admin-workspace-navigation">
    <nav className="admin-workspace-nav" aria-label="Admin work areas">
      {adminWorkspaces.map((candidate) => <button
        type="button"
        className={candidate.id === activeWorkspace ? 'selected' : ''}
        aria-current={candidate.id === activeWorkspace ? 'page' : undefined}
        onClick={() => onWorkspaceChange(candidate.id)}
        key={candidate.id}
      >
        <strong>{candidate.label}</strong>
        <small>{candidate.description}</small>
      </button>)}
    </nav>
    {tabs.length > 1 ? <nav className="admin-subsection-nav" aria-label={`${workspace.label} sections`}>
      {tabs.map((tab) => <button
        type="button"
        className={tab.id === activeTab ? 'selected' : ''}
        aria-current={tab.id === activeTab ? 'page' : undefined}
        onClick={() => onTabChange(tab.id)}
        key={tab.id}
      >{tab.label}</button>)}
    </nav> : null}
  </div>;
}
