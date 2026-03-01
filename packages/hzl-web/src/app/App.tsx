import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTasks } from './hooks/useTasks';
import { useEvents } from './hooks/useEvents';
import { useStats } from './hooks/useStats';
import { useSSE } from './hooks/useSSE';
import { loadPreferences, savePreferences } from './hooks/usePreferences';
import { parseUrlState, syncUrlState } from './hooks/useUrlState';
import type { ViewMode } from './hooks/useUrlState';
import type { TaskListItem } from './api/types';
import type { ActivityEvent } from './api/types';
import { buildEmojiMap } from './utils/emoji';
import { getAssigneeValue, getBoardStatus } from './utils/format';
import { COLUMNS } from './utils/board';
import Header from './components/Header/Header';
import FilterBar from './components/Filters/FilterBar';
import Board from './components/Board/Board';
import CalendarView from './components/CalendarView/CalendarView';
import GraphView from './components/GraphView/GraphView';
import TaskModal from './components/TaskModal/TaskModal';
import ActivityPanel from './components/ActivityPanel/ActivityPanel';
import ConnectionStatus from './components/ConnectionStatus/ConnectionStatus';
import type { SSEState } from './components/ConnectionStatus/types';
import MobileTabs from './components/MobileTabs/MobileTabs';

function normalizeSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}

function taskMatchesSearch(task: TaskListItem, query: string): boolean {
  if (!query) return true;
  const terms = query.split(' ');
  const haystack = [
    task.task_id,
    task.title,
    task.project,
    getAssigneeValue(task.assignee),
    task.description,
    Array.isArray(task.tags) ? task.tags.join(' ') : '',
    Array.isArray(task.blocked_by) ? task.blocked_by.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export default function App() {
  // Load initial state from preferences and URL
  const initialPrefs = useMemo(() => loadPreferences(), []);
  const initialUrl = useMemo(() => parseUrlState(), []);

  const [view, setView] = useState<ViewMode>(
    (initialUrl.view || initialPrefs.activeView || 'kanban') as ViewMode,
  );
  const [since, setSince] = useState(initialUrl.since || initialPrefs.dateFilter || '3d');
  const [project, setProject] = useState(initialUrl.project ?? initialPrefs.projectFilter ?? '');
  const [assignee, setAssignee] = useState(initialUrl.assignee ?? initialPrefs.assigneeFilter ?? '');
  const [searchQuery, setSearchQuery] = useState(
    initialUrl.q !== undefined ? normalizeSearchQuery(initialUrl.q) : initialPrefs.taskSearch || '',
  );
  const [showSubtasks, setShowSubtasks] = useState(
    initialUrl.subtasks !== undefined ? initialUrl.subtasks !== '0' : initialPrefs.showSubtasks,
  );
  const [columnVisibility, setColumnVisibility] = useState(
    initialPrefs.columnVisibility || [...COLUMNS],
  );
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(
    () => new Set(initialPrefs.collapsedParents || []),
  );
  const [activeTab, setActiveTab] = useState(initialUrl.tab || initialPrefs.activeTab || 'ready');
  const [activityOpen, setActivityOpen] = useState(initialUrl.activity === '1');
  const [activityAssignee, setActivityAssignee] = useState(
    initialUrl.activityAssignee ?? initialPrefs.activityAssigneeFilter ?? '',
  );
  const [activityKeyword, setActivityKeyword] = useState(
    initialUrl.activityQ ?? initialPrefs.activityKeywordFilter ?? '',
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialUrl.task ?? null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sseState, setSseState] = useState<SSEState>('connecting');

  // Calendar state
  const parsedMonth = useMemo(() => {
    if (initialUrl.month) {
      const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(initialUrl.month);
      if (match) return { year: Number(match[1]), month: Number(match[2]) - 1 };
    }
    return null;
  }, [initialUrl.month]);

  const [calendarYear, setCalendarYear] = useState(parsedMonth?.year ?? new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(parsedMonth?.month ?? new Date().getMonth());

  // Compute API params
  const dueMonth = view === 'calendar'
    ? `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}`
    : undefined;

  const { tasks, refresh: refreshTasks } = useTasks({
    since: dueMonth ? undefined : since,
    project: project || undefined,
    dueMonth,
  });
  const { events, refresh: refreshEvents } = useEvents();
  const { stats, refresh: refreshStats } = useStats();

  const refreshAll = useCallback(() => {
    refreshTasks();
    refreshEvents();
    refreshStats();
  }, [refreshTasks, refreshEvents, refreshStats]);

  // SSE connection
  useSSE(() => {
    setSseState('live');
    refreshAll();
  });

  // Save preferences on state change
  const persistPrefs = useCallback(() => {
    savePreferences({
      dateFilter: since,
      projectFilter: project,
      assigneeFilter: assignee,
      activityAssigneeFilter: activityAssignee,
      activityKeywordFilter: activityKeyword,
      taskSearch: searchQuery,
      columnVisibility,
      showSubtasks,
      collapsedParents: Array.from(collapsedParents),
      activeView: view,
      activeTab,
    });
  }, [since, project, assignee, activityAssignee, activityKeyword, searchQuery,
      columnVisibility, showSubtasks, collapsedParents, view, activeTab]);

  // URL sync
  const syncUrl = useCallback(() => {
    syncUrlState({
      view,
      since,
      calendarYear,
      calendarMonth,
      project,
      assignee,
      searchQuery,
      showSubtasks,
      activeTab,
      activityOpen,
      activityAssignee,
      activityKeyword,
      selectedTaskId,
    });
  }, [view, since, calendarYear, calendarMonth, project, assignee, searchQuery,
      showSubtasks, activeTab, activityOpen, activityAssignee, activityKeyword, selectedTaskId]);

  useEffect(() => {
    persistPrefs();
    syncUrl();
  }, [persistPrefs, syncUrl]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let filtered = showSubtasks ? tasks : tasks.filter((t) => !t.parent_id);

    if (assignee) {
      filtered = filtered.filter((t) => getAssigneeValue(t.assignee) === assignee);
    }

    const query = normalizeSearchQuery(searchQuery).toLowerCase();
    if (query) {
      filtered = filtered.filter((t) => taskMatchesSearch(t, query));
    }

    // Collapsed parents: hide children of collapsed parents (but not during search)
    if (showSubtasks && !query) {
      const visibleIds = new Set(filtered.map((t) => t.task_id));
      filtered = filtered.filter((t) => {
        if (!t.parent_id) return true;
        if (!visibleIds.has(t.parent_id)) return true;
        return !collapsedParents.has(t.parent_id);
      });
    }

    return filtered;
  }, [tasks, showSubtasks, assignee, searchQuery, collapsedParents]);

  // Compute search counts for filter bar
  const searchCounts = useMemo(() => {
    if (!searchQuery) return { matched: 0, total: 0 };
    let base = showSubtasks ? tasks : tasks.filter((t) => !t.parent_id);
    if (assignee) {
      base = base.filter((t) => getAssigneeValue(t.assignee) === assignee);
    }
    const query = normalizeSearchQuery(searchQuery).toLowerCase();
    const matched = base.filter((t) => taskMatchesSearch(t, query));
    return { matched: matched.length, total: base.length };
  }, [tasks, showSubtasks, assignee, searchQuery]);

  // Emoji map
  const emojiMap = useMemo(() => buildEmojiMap(tasks), [tasks]);

  // Assignee options for filter bar
  const assigneeOptions = useMemo(() => {
    let base = showSubtasks ? tasks : tasks.filter((t) => !t.parent_id);
    // Apply column visibility
    const visibleStatuses = new Set(columnVisibility);
    base = base.filter((t) => visibleStatuses.has(getBoardStatus(t)));

    const counts = new Map<string, number>();
    for (const t of base) {
      const a = getAssigneeValue(t.assignee);
      if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map(([name, count]) => ({ name, count }));
  }, [tasks, showSubtasks, columnVisibility]);

  // Visible board task IDs (without assignee filter) — shared by activity panel memos
  const visibleBoardTaskIds = useMemo(() => {
    let boardBase = showSubtasks ? tasks : tasks.filter((t) => !t.parent_id);
    const visibleStatuses = new Set(columnVisibility);
    boardBase = boardBase.filter((t) => visibleStatuses.has(getBoardStatus(t)));
    const query = normalizeSearchQuery(searchQuery).toLowerCase();
    if (query) {
      boardBase = boardBase.filter((t) => taskMatchesSearch(t, query));
    }
    return new Set(boardBase.map((t) => t.task_id));
  }, [tasks, showSubtasks, columnVisibility, searchQuery]);

  // Filtered events for activity panel
  const filteredEvents = useMemo(() => {
    const keyword = activityKeyword.trim().toLowerCase();
    const effectiveKeyword = keyword.length >= 3 ? keyword : '';

    return events.filter((event: ActivityEvent) => {
      if (!visibleBoardTaskIds.has(event.task_id)) return false;
      if (effectiveKeyword) {
        const title = typeof event.task_title === 'string' ? event.task_title.toLowerCase() : '';
        const desc = typeof event.task_description === 'string' ? event.task_description.toLowerCase() : '';
        if (!title.includes(effectiveKeyword) && !desc.includes(effectiveKeyword)) return false;
      }
      if (activityAssignee) {
        const eventAssignee = getAssigneeValue(event.task_assignee) || getAssigneeValue(event.data?.assignee as string);
        if (eventAssignee !== activityAssignee) return false;
      }
      return true;
    });
  }, [events, visibleBoardTaskIds, activityAssignee, activityKeyword]);

  // Activity assignee options
  const activityAssigneeOptions = useMemo(() => {
    const assigneeTaskSets = new Map<string, Set<string>>();
    for (const event of events) {
      if (!visibleBoardTaskIds.has(event.task_id)) continue;
      const a = getAssigneeValue(event.task_assignee) || getAssigneeValue(event.data?.assignee as string);
      if (!a) continue;
      if (!assigneeTaskSets.has(a)) assigneeTaskSets.set(a, new Set());
      assigneeTaskSets.get(a)!.add(event.task_id);
    }

    return Array.from(assigneeTaskSets.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map(([name, taskIds]) => ({ name, count: taskIds.size }));
  }, [events, visibleBoardTaskIds]);

  // Parent task tracking
  const parentIds = useMemo(
    () => tasks.filter((t) => (t.subtask_total ?? 0) > 0).map((t) => t.task_id),
    [tasks],
  );

  const collapsedCount = useMemo(
    () => parentIds.filter((id) => collapsedParents.has(id)).length,
    [parentIds, collapsedParents],
  );

  const handleToggleCollapse = useCallback((parentId: string) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);

  const handleCollapseAll = useCallback(() => {
    setCollapsedParents(new Set(parentIds));
  }, [parentIds]);

  const handleExpandAll = useCallback(() => {
    setCollapsedParents(new Set());
  }, []);

  const handleViewChange = useCallback((v: ViewMode) => {
    setView(v);
    refreshAll();
  }, [refreshAll]);

  const handleSinceChange = useCallback((v: string) => {
    setSince(v);
  }, []);

  const handleProjectChange = useCallback((v: string) => {
    setProject(v);
  }, []);

  const handleCalendarNavigate = useCallback((y: number, m: number) => {
    setCalendarYear(y);
    setCalendarMonth(m);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (selectedTaskId) { setSelectedTaskId(null); return; }
        if (activityOpen) { setActivityOpen(false); return; }
        if (shortcutsOpen) { setShortcutsOpen(false); return; }
        return;
      }

      const target = e.target as Element | null;
      if (target?.closest('input, textarea, select') || (target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        const input = document.getElementById('taskSearchInput') as HTMLInputElement | null;
        input?.focus();
        input?.select();
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setActivityOpen((prev) => !prev);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskId, activityOpen, shortcutsOpen]);

  const projects = stats?.projects ?? [];

  return (
    <div className="app">
      <header className="header">
        <button
          className="hamburger"
          onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
        >
          &#9776;
        </button>
        <Header
          view={view}
          onViewChange={handleViewChange}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          showSubtasks={showSubtasks}
          onShowSubtasksChange={setShowSubtasks}
          parentCount={parentIds.length}
          collapsedCount={collapsedCount}
          onCollapseAll={handleCollapseAll}
          onExpandAll={handleExpandAll}
          onShowShortcuts={() => setShortcutsOpen(true)}
        />
        <FilterBar
          since={since}
          onSinceChange={handleSinceChange}
          projects={projects}
          project={project}
          onProjectChange={handleProjectChange}
          assignees={assigneeOptions}
          assignee={assignee}
          onAssigneeChange={setAssignee}
          searchQuery={searchQuery}
          onSearchChange={(v) => setSearchQuery(normalizeSearchQuery(v))}
          searchMatchCount={searchCounts.matched}
          searchTotalCount={searchCounts.total}
          showDateFilter={view !== 'calendar'}
          mobileFiltersOpen={mobileFiltersOpen}
        />
        <div className="header-right">
          <ConnectionStatus state={sseState} />
          <button className="activity-btn" onClick={() => setActivityOpen(true)}>
            Activity
          </button>
        </div>
      </header>

      {view === 'kanban' && (
        <>
          <MobileTabs
            tasks={filteredTasks}
            emojiMap={emojiMap}
            showSubtasks={showSubtasks}
            collapsedParents={collapsedParents}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onToggleCollapse={handleToggleCollapse}
            onCardClick={setSelectedTaskId}
            searchQuery={searchQuery}
          />
          <Board
            tasks={filteredTasks}
            emojiMap={emojiMap}
            showSubtasks={showSubtasks}
            collapsedParents={collapsedParents}
            columnVisibility={columnVisibility}
            searchQuery={searchQuery}
            onToggleCollapse={handleToggleCollapse}
            onCardClick={setSelectedTaskId}
          />
        </>
      )}

      {view === 'calendar' && (
        <CalendarView
          tasks={tasks}
          year={calendarYear}
          month={calendarMonth}
          onNavigate={handleCalendarNavigate}
          onTaskClick={setSelectedTaskId}
        />
      )}

      {view === 'graph' && (
        <GraphView
          tasks={tasks}
          onTaskClick={setSelectedTaskId}
        />
      )}

      {selectedTaskId && (
        <TaskModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      <ActivityPanel
        open={activityOpen}
        events={filteredEvents}
        assignees={activityAssigneeOptions}
        assignee={activityAssignee}
        onAssigneeChange={setActivityAssignee}
        keyword={activityKeyword}
        onKeywordChange={setActivityKeyword}
        onClose={() => setActivityOpen(false)}
        onEventClick={setSelectedTaskId}
      />

      {shortcutsOpen && (
        <div
          className="shortcuts-modal-overlay open"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShortcutsOpen(false);
          }}
        >
          <div className="shortcuts-modal">
            <div className="shortcuts-header">
              <span className="shortcuts-title">Keyboard Shortcuts</span>
              <button
                type="button"
                className="shortcuts-close"
                onClick={() => setShortcutsOpen(false)}
              >
                &times;
              </button>
            </div>
            <div className="shortcuts-body">
              <div className="shortcuts-list">
                <span className="shortcut-key">/</span>
                <span className="shortcut-desc">Focus task search</span>
                <span className="shortcut-key">a</span>
                <span className="shortcut-desc">Toggle activity panel</span>
                <span className="shortcut-key">?</span>
                <span className="shortcut-desc">Open this shortcuts dialog</span>
                <span className="shortcut-key">Esc</span>
                <span className="shortcut-desc">Close open dialogs/panels</span>
              </div>
              <div className="shortcuts-note">
                Shortcuts are disabled while typing in inputs.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
