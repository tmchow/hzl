import { useState, useCallback, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import type { AgentRosterItem } from '../../api/types';
import { formatDuration } from '../../utils/format';

function safeDateParse(value: string | null | undefined): number {
  if (!value) return Date.now();
  const ts = Date.parse(value);
  return isNaN(ts) ? Date.now() : ts;
}

interface AgentRosterProps {
  agents: AgentRosterItem[];
  selectedAgent: string | null;
  onSelectAgent: (agent: string | null) => void;
}

export default function AgentRoster({
  agents,
  selectedAgent,
  onSelectAgent,
}: AgentRosterProps) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const rosterRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Reset focused index when agents list changes
  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, agents.length);
  }, [agents.length]);

  // Scroll the focused row into view
  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < agents.length) {
      rowRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, agents.length]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (agents.length === 0) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev < 0 ? 0 : (prev + 1) % agents.length
          );
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev <= 0 ? agents.length - 1 : prev - 1
          );
          break;
        }
        case 'Home': {
          e.preventDefault();
          setFocusedIndex(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          setFocusedIndex(agents.length - 1);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < agents.length) {
            onSelectAgent(agents[focusedIndex].agent);
          }
          break;
        }
      }
    },
    [agents, focusedIndex, onSelectAgent]
  );

  // When the roster receives focus and no item is focused, focus the first item
  const handleFocus = useCallback(() => {
    if (focusedIndex < 0 && agents.length > 0) {
      setFocusedIndex(0);
    }
  }, [focusedIndex, agents.length]);

  // Clear focused index when roster loses focus
  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    // Only clear if focus is moving outside the roster entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setFocusedIndex(-1);
    }
  }, []);

  if (agents.length === 0) {
    return (
      <div className="agent-roster-empty">
        No agents found
      </div>
    );
  }

  return (
    <div
      className="agent-roster"
      role="listbox"
      aria-label="Agent roster"
      tabIndex={0}
      ref={rosterRef}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {agents.map((agent, index) => {
        const isSelected = selectedAgent === agent.agent;
        const isFocused = focusedIndex === index;
        const now = Date.now();

        return (
          <div
            key={agent.agent}
            role="option"
            aria-selected={isSelected}
            ref={(el) => { rowRefs.current[index] = el; }}
            className={`agent-roster-row${isSelected ? ' selected' : ''}${isFocused ? ' focused' : ''}`}
            onClick={() => onSelectAgent(agent.agent)}
          >
            <span
              className="agent-roster-dot"
              style={{
                background: agent.isActive
                  ? 'var(--status-in-progress)'
                  : 'var(--status-backlog)',
              }}
            />
            <div className="agent-roster-info">
              <span className="agent-roster-id">{agent.agent}</span>
              {agent.isActive && agent.tasks.length > 0 ? (
                <span className="agent-roster-task">
                  <span className="agent-roster-task-title">
                    {agent.tasks[0].title}
                  </span>
                  {agent.tasks.length > 1 && (
                    <span className="agent-roster-more">
                      (+{agent.tasks.length - 1} more)
                    </span>
                  )}
                </span>
              ) : (
                <span className="agent-roster-idle">
                  idle since {formatDuration(now - safeDateParse(agent.lastActivity))}
                </span>
              )}
            </div>
            <span className="agent-roster-duration">
              {agent.isActive && agent.tasks.length > 0
                ? formatDuration(now - safeDateParse(agent.tasks[0].claimedAt))
                : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
