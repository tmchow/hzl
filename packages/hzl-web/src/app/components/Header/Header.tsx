import type { ViewMode } from '../../hooks/useUrlState';
import './Header.css';

interface HeaderProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export default function Header({ view, onViewChange }: HeaderProps) {
  return (
    <div className="header-left">
      <span className="logo">HZL</span>
      <select
        className="view-select"
        value={view}
        onChange={(e) => onViewChange(e.target.value as ViewMode)}
        aria-label="View mode"
      >
        <option value="kanban">Kanban</option>
        <option value="calendar">Calendar</option>
        <option value="graph">Graph</option>
        <option value="agents">Agents</option>
      </select>
    </div>
  );
}
