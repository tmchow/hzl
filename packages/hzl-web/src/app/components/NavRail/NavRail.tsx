import type { ViewMode } from '../../hooks/useUrlState';
import './NavRail.css';

interface NavRailProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const VIEW_ITEMS: Array<{ id: ViewMode; label: string; icon: JSX.Element }> = [
  {
    id: 'kanban',
    label: 'Kanban',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="1" width="4" height="14" rx="1" opacity="0.9" />
        <rect x="6" y="1" width="4" height="10" rx="1" opacity="0.7" />
        <rect x="11" y="1" width="4" height="6" rx="1" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="5.5" cy="4" r="2.5" />
        <circle cx="10.5" cy="4" r="2.5" />
        <path d="M0 13c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4" opacity="0.7" />
        <path d="M5 13c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4" opacity="0.7" />
      </svg>
    ),
  },
  {
    id: 'graph',
    label: 'Graph',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="4" cy="4" r="2.5" />
        <circle cx="12" cy="4" r="2.5" />
        <circle cx="8" cy="12" r="2.5" />
        <line x1="5.5" y1="5.5" x2="7" y2="10" stroke="currentColor" strokeWidth="1.5" />
        <line x1="10.5" y1="5.5" x2="9" y2="10" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 0a1 1 0 0 1 1 1v1h6V1a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h1V1a1 1 0 0 1 1-1zM1 6v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6H1z" />
      </svg>
    ),
  },
];

export default function NavRail({ view, onViewChange, collapsed, onToggleCollapse }: NavRailProps) {
  return (
    <>
      <nav className={`nav-rail${collapsed ? ' collapsed' : ''}`}>
        <div className="nav-rail-top">
          <div className="nav-rail-logo">
            {collapsed ? (
              <span className="logo-mark">H</span>
            ) : (
              <span className="logo-full">HZL</span>
            )}
          </div>
          <div className="nav-rail-items">
            {VIEW_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`nav-rail-item${view === item.id ? ' active' : ''}`}
                onClick={() => onViewChange(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <span className="nav-rail-icon">{item.icon}</span>
                {!collapsed && <span className="nav-rail-label">{item.label}</span>}
              </button>
            ))}
          </div>
        </div>
        <button
          className="nav-rail-toggle"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={collapsed ? 'chevron-right' : 'chevron-left'}
          >
            <polyline points={collapsed ? '5 2 10 7 5 12' : '9 2 4 7 9 12'} />
          </svg>
        </button>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="nav-bottom-bar">
        {VIEW_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-bottom-item${view === item.id ? ' active' : ''}`}
            onClick={() => onViewChange(item.id)}
          >
            <span className="nav-bottom-icon">{item.icon}</span>
            <span className="nav-bottom-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
