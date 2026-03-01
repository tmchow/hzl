import { useCallback, useEffect, useRef } from 'react';

export type ViewMode = 'kanban' | 'calendar' | 'graph';

export interface UrlState {
  view?: ViewMode;
  since?: string;
  month?: string;
  project?: string;
  assignee?: string;
  q?: string;
  subtasks?: string;
  tab?: string;
  activity?: string;
  activityAssignee?: string;
  activityQ?: string;
  tag?: string;
  task?: string;
}

/** Parse URL params into a structured state object */
export function parseUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const state: UrlState = {};

  const view = params.get('view');
  if (view === 'kanban' || view === 'calendar' || view === 'graph') {
    state.view = view;
  }

  const since = params.get('since');
  if (since) state.since = since;

  const month = params.get('month');
  if (month) state.month = month;

  const project = params.get('project');
  if (project !== null) state.project = project;

  const assignee = params.get('assignee');
  if (assignee !== null) state.assignee = assignee;

  const q = params.get('q');
  if (q !== null) state.q = q;

  const subtasks = params.get('subtasks');
  if (subtasks !== null) state.subtasks = subtasks;

  const tab = params.get('tab');
  if (tab) state.tab = tab;

  const activity = params.get('activity');
  if (activity) state.activity = activity;

  const activityAssignee = params.get('activity_assignee');
  if (activityAssignee !== null) state.activityAssignee = activityAssignee;

  const activityQ = params.get('activity_q');
  if (activityQ !== null) state.activityQ = activityQ;

  const tag = params.get('tag');
  if (tag !== null) state.tag = tag;

  const task = params.get('task');
  if (task) state.task = task;

  return state;
}

export interface SyncUrlStateParams {
  view: ViewMode;
  since: string;
  calendarYear: number;
  calendarMonth: number;
  project: string;
  assignee: string;
  searchQuery: string;
  showSubtasks: boolean;
  activeTab: string;
  activityOpen: boolean;
  activityAssignee: string;
  activityKeyword: string;
  tag: string;
  selectedTaskId: string | null;
}

/** Sync current state to URL params */
export function syncUrlState(state: SyncUrlStateParams): void {
  const params = new URLSearchParams();

  if (state.view !== 'kanban') params.set('view', state.view);
  if (state.view === 'calendar') {
    const month = String(state.calendarMonth + 1).padStart(2, '0');
    params.set('month', `${state.calendarYear}-${month}`);
  } else if (state.since !== '3d') {
    params.set('since', state.since);
  }

  if (state.project) params.set('project', state.project);
  if (state.assignee) params.set('assignee', state.assignee);
  if (state.searchQuery) params.set('q', state.searchQuery);
  if (!state.showSubtasks) params.set('subtasks', '0');
  if (state.activeTab !== 'ready') params.set('tab', state.activeTab);
  if (state.activityAssignee) params.set('activity_assignee', state.activityAssignee);
  if (state.activityKeyword.trim()) params.set('activity_q', state.activityKeyword.trim());
  if (state.tag) params.set('tag', state.tag);
  if (state.activityOpen) params.set('activity', '1');
  if (state.selectedTaskId) params.set('task', state.selectedTaskId);

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`;
  history.replaceState(null, '', nextUrl);
}

/** Hook that syncs state to URL on change */
export function useUrlSync(state: SyncUrlStateParams): void {
  const stateRef = useRef(state);
  stateRef.current = state;

  const sync = useCallback(() => {
    syncUrlState(stateRef.current);
  }, []);

  useEffect(() => {
    sync();
  });
}
