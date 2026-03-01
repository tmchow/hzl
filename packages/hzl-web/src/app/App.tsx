import { useStats } from './hooks/useStats';
import { useSSE } from './hooks/useSSE';

export default function App() {
  const { stats, refresh: refreshStats } = useStats();

  useSSE(() => {
    refreshStats();
  });

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="logo">
            <span className="logo-accent">HZL</span> Dashboard
          </h1>
        </div>
        <div className="header-right">
          <span className="status-indicator" title="Connected" />
        </div>
      </header>

      <main className="main">
        <section className="stats-bar">
          {stats ? (
            <>
              <div className="stat">
                <span className="stat-value">{stats.total}</span>
                <span className="stat-label">Total</span>
              </div>
              {Object.entries(stats.by_status).map(([status, count]) => (
                <div className="stat" key={status}>
                  <span className={`stat-value status-${status}`}>{count}</span>
                  <span className="stat-label">{status}</span>
                </div>
              ))}
            </>
          ) : (
            <div className="stat">
              <span className="stat-label">Loading...</span>
            </div>
          )}
        </section>

        <section className="placeholder-content">
          <div className="placeholder-card">
            <h2>Kanban Board</h2>
            <p>Task board will be rendered here.</p>
          </div>
          <div className="placeholder-card">
            <h2>Activity Feed</h2>
            <p>Recent events will be rendered here.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
