const PREFS_KEY = 'hzl-dashboard-prefs';

export interface DashboardPrefs {
  dateFilter: string;
  projectFilter: string;
  assigneeFilter: string;
  activityAssigneeFilter: string;
  activityKeywordFilter: string;
  taskSearch: string;
  columnVisibility: string[];
  showSubtasks: boolean;
  collapsedParents: string[];
  activeView: string;
  tagFilter: string;
  activeTab: string;
  railCollapsed: boolean;
}

const DEFAULT_PREFS: DashboardPrefs = {
  dateFilter: '3d',
  projectFilter: '',
  assigneeFilter: '',
  activityAssigneeFilter: '',
  activityKeywordFilter: '',
  taskSearch: '',
  columnVisibility: ['backlog', 'ready', 'in_progress', 'blocked', 'done'],
  showSubtasks: true,
  collapsedParents: [],
  activeView: 'kanban',
  tagFilter: '',
  activeTab: 'ready',
  railCollapsed: false,
};

export function loadPreferences(): DashboardPrefs {
  try {
    const saved = localStorage.getItem(PREFS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<DashboardPrefs>;
      return { ...DEFAULT_PREFS, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_PREFS };
}

export function savePreferences(prefs: DashboardPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}
