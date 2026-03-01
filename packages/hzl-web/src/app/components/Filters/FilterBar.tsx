import { useState, useRef, useEffect, useCallback } from 'react';
import type { ViewMode } from '../../hooks/useUrlState';
import { COLUMNS, STATUS_LABELS } from '../../utils/board';
import './FilterBar.css';

interface FilterBarProps {
  since: string;
  onSinceChange: (value: string) => void;
  projects: string[];
  project: string;
  onProjectChange: (value: string) => void;
  assignees: Array<{ name: string; count: number }>;
  assignee: string;
  onAssigneeChange: (value: string) => void;
  tags: Array<{ name: string; count: number }>;
  tag: string;
  onTagChange: (value: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchMatchCount: number;
  showDateFilter: boolean;
  mobileFiltersOpen: boolean;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  columnVisibility: string[];
  onColumnVisibilityChange: (cols: string[]) => void;
  showSubtasks: boolean;
  onShowSubtasksChange: (show: boolean) => void;
  parentCount: number;
  collapsedCount: number;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onShowShortcuts: () => void;
}

export default function FilterBar({
  since,
  onSinceChange,
  projects,
  project,
  onProjectChange,
  assignees,
  assignee,
  onAssigneeChange,
  tags,
  tag,
  onTagChange,
  searchQuery,
  onSearchChange,
  searchMatchCount,
  showDateFilter,
  mobileFiltersOpen,
  view,
  onViewChange,
  columnVisibility,
  onColumnVisibilityChange,
  showSubtasks,
  onShowSubtasksChange,
  parentCount,
  collapsedCount,
  onCollapseAll,
  onExpandAll,
  onShowShortcuts,
}: FilterBarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (settingsOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [settingsOpen, handleClickOutside]);

  const hasSearch = searchQuery.length > 0;
  const label = searchMatchCount === 1 ? 'task' : 'tasks';

  const collapseMetaText = parentCount === 0
    ? 'No parent tasks'
    : !showSubtasks
      ? 'Enable "Show subtasks" to expand by parent'
      : `${collapsedCount}/${parentCount} collapsed`;

  return (
    <div className={`header-filters${mobileFiltersOpen ? ' open' : ''}`}>
      {showDateFilter && (
        <div className="filter-group">
          <select id="dateFilter" value={since} onChange={(e) => onSinceChange(e.target.value)}>
            <option value="1d">Today</option>
            <option value="3d">Last 3 days</option>
            <option value="7d">Last 7 days</option>
            <option value="14d">Last 14 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
      )}
      <div className="filter-group">
        <select id="projectFilter" value={project} onChange={(e) => onProjectChange(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <select id="assigneeFilter" value={assignee} onChange={(e) => onAssigneeChange(e.target.value)}>
          <option value="">Any Agent</option>
          {assignees.map((a) => (
            <option key={a.name} value={a.name}>{a.name} ({a.count})</option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <select id="tagFilter" value={tag} onChange={(e) => onTagChange(e.target.value)}>
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.name} value={t.name}>{t.name} ({t.count})</option>
          ))}
        </select>
      </div>
      <div className={`filter-group task-search-group${hasSearch ? ' active' : ''}`}>
        <input
          ref={searchRef}
          type="search"
          id="taskSearchInput"
          className="task-search-input"
          placeholder="Find task (/)"
          aria-label="Search tasks"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {hasSearch && (
          <button
            type="button"
            className="task-search-clear"
            onClick={() => {
              onSearchChange('');
              searchRef.current?.focus();
            }}
          >
            &times;
          </button>
        )}
        <span className="task-search-meta">
          {hasSearch ? `${searchMatchCount} ${label}` : ''}
        </span>
      </div>
      <div className="filter-group settings-group" ref={settingsRef}>
        <button
          className="settings-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setSettingsOpen(!settingsOpen);
          }}
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" />
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" />
          </svg>
        </button>
        {settingsOpen && (
          <div className="settings-dropdown open" onClick={(e) => e.stopPropagation()}>
            <div className="settings-section">
              <label className="settings-label" htmlFor="viewFilter">View</label>
              <select
                id="viewFilter"
                className="settings-view-select"
                value={view}
                onChange={(e) => onViewChange(e.target.value as ViewMode)}
              >
                <option value="kanban">Kanban</option>
                <option value="calendar">Calendar</option>
                <option value="graph">Graph</option>
              </select>
            </div>
            <div className="settings-section">
              <label className="settings-label">Columns</label>
              <div className="column-checkboxes">
                {COLUMNS.map((col) => (
                  <label className="column-checkbox" key={col}>
                    <input
                      type="checkbox"
                      checked={columnVisibility.includes(col)}
                      onChange={() => {
                        const next = columnVisibility.includes(col)
                          ? columnVisibility.filter((c) => c !== col)
                          : [...columnVisibility, col];
                        onColumnVisibilityChange(next);
                      }}
                    />
                    {STATUS_LABELS[col]}
                  </label>
                ))}
              </div>
            </div>
            <div className="settings-section">
              <label className="column-checkbox">
                <input
                  type="checkbox"
                  checked={showSubtasks}
                  onChange={(e) => onShowSubtasksChange(e.target.checked)}
                />
                Show subtasks
              </label>
            </div>
            <div className="settings-section">
              <label className="settings-label">Parent View</label>
              <div className="collapse-parents-actions">
                <button
                  type="button"
                  className="collapse-parents-btn"
                  disabled={!showSubtasks || parentCount === 0 || collapsedCount === parentCount}
                  onClick={onCollapseAll}
                >
                  Collapse all
                </button>
                <button
                  type="button"
                  className="collapse-parents-btn"
                  disabled={!showSubtasks || collapsedCount === 0}
                  onClick={onExpandAll}
                >
                  Expand all
                </button>
              </div>
              <div className="collapse-parents-meta">{collapseMetaText}</div>
            </div>
            <div className="settings-section">
              <button
                type="button"
                className="settings-shortcuts-btn"
                onClick={onShowShortcuts}
              >
                Shortcuts (?)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
