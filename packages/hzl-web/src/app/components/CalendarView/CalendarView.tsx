import { useState, useMemo, useCallback } from 'react';
import type { TaskListItem } from '../../api/types';
import './CalendarView.css';

interface CalendarViewProps {
  tasks: TaskListItem[];
  year: number;
  month: number; // 0-indexed
  onNavigate: (year: number, month: number) => void;
  onTaskClick: (taskId: string) => void;
}

const MAX_CARDS = 3;

function MiniCard({ task, onClick }: { task: TaskListItem; onClick: (id: string) => void }) {
  return (
    <div
      className="calendar-mini-card"
      data-status={task.status}
      onClick={(e) => {
        e.stopPropagation();
        onClick(task.task_id);
      }}
    >
      <span className="calendar-mini-title">{task.title}</span>
      <span className="calendar-mini-project">{task.project}</span>
    </div>
  );
}

export default function CalendarView({ tasks, year, month, onNavigate, onTaskClick }: CalendarViewProps) {
  const [popoverDate, setPopoverDate] = useState<number | null>(null);

  const tasksByDay = useMemo(() => {
    const map: Record<number, TaskListItem[]> = {};
    for (const t of tasks) {
      if (!t.due_at) continue;
      const d = new Date(t.due_at);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      if (!map[day]) map[day] = [];
      map[day].push(t);
    }
    return map;
  }, [tasks, year, month]);

  const monthLabel = new Date(year, month, 1)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const totalCells = firstDow + daysInMonth;
  const trailingDays = (7 - (totalCells % 7)) % 7;

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const todayDate = now.getDate();

  const monthTaskCount = Object.values(tasksByDay).reduce((sum, arr) => sum + arr.length, 0);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const navPrev = useCallback(() => {
    let m = month - 1;
    let y = year;
    if (m < 0) { m = 11; y--; }
    onNavigate(y, m);
  }, [month, year, onNavigate]);

  const navNext = useCallback(() => {
    let m = month + 1;
    let y = year;
    if (m > 11) { m = 0; y++; }
    onNavigate(y, m);
  }, [month, year, onNavigate]);

  const navToday = useCallback(() => {
    const today = new Date();
    onNavigate(today.getFullYear(), today.getMonth());
  }, [onNavigate]);

  const leadingDays = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    leadingDays.push(daysInPrevMonth - i);
  }

  const trailing = [];
  for (let d = 1; d <= trailingDays; d++) {
    trailing.push(d);
  }

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <button className="calendar-nav-btn" onClick={navPrev}>&larr;</button>
        <div className="calendar-month-label">{monthLabel}</div>
        <button className="calendar-nav-btn" onClick={navNext}>&rarr;</button>
        <button className="calendar-nav-btn" onClick={navToday}>Today</button>
      </div>

      {monthTaskCount === 0 && (
        <div className="calendar-empty-state">No tasks with due dates in {monthLabel}</div>
      )}

      <div className="calendar-grid">
        {dayNames.map((d) => (
          <div className="calendar-day-header" key={d}>{d}</div>
        ))}

        {leadingDays.map((day) => (
          <div className="calendar-day other-month" key={`prev-${day}`}>
            <span className="calendar-day-number">{day}</span>
          </div>
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const isToday = isCurrentMonth && day === todayDate;
          const dayTasks = tasksByDay[day] || [];
          const visible = dayTasks.slice(0, MAX_CARDS);
          const overflow = dayTasks.length - MAX_CARDS;

          return (
            <div
              className={`calendar-day${isToday ? ' today' : ''}`}
              key={day}
              style={{ position: 'relative' }}
            >
              <span className="calendar-day-number">{day}</span>
              <div className="calendar-day-tasks">
                {visible.map((t) => (
                  <MiniCard key={t.task_id} task={t} onClick={onTaskClick} />
                ))}
                {overflow > 0 && (
                  <div
                    className="calendar-more-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPopoverDate(popoverDate === day ? null : day);
                    }}
                  >
                    +{overflow} more
                  </div>
                )}
              </div>
              {popoverDate === day && (
                <div className="calendar-popover">
                  <div className="calendar-popover-header">
                    {new Date(year, month, day).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                  </div>
                  {dayTasks.map((t) => (
                    <MiniCard key={t.task_id} task={t} onClick={(id) => { setPopoverDate(null); onTaskClick(id); }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {trailing.map((day) => (
          <div className="calendar-day other-month" key={`next-${day}`}>
            <span className="calendar-day-number">{day}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
