import { useRef } from 'react';
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
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchMatchCount: number;
  searchTotalCount: number;
  showDateFilter: boolean;
  mobileFiltersOpen: boolean;
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
  searchQuery,
  onSearchChange,
  searchMatchCount,
  searchTotalCount,
  showDateFilter,
  mobileFiltersOpen,
}: FilterBarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  const hasSearch = searchQuery.length > 0;
  const label = searchTotalCount === 1 ? 'task' : 'tasks';

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
          {hasSearch ? `${searchMatchCount}/${searchTotalCount} ${label}` : ''}
        </span>
      </div>
    </div>
  );
}
