import { describe, it, expect, vi } from 'vitest';
import { EventType } from './types.js';
import { UpcasterRegistry, type EventUpcaster } from './upcasters.js';

describe('UpcasterRegistry', () => {
  it('applies an ordered upcaster chain (v1 -> v2 -> v3)', () => {
    const upcasters: EventUpcaster[] = [
      {
        eventType: EventType.TaskCreated,
        fromVersion: 1,
        toVersion: 2,
        up(data) {
          return { ...data, project: data.project ?? 'inbox' };
        },
      },
      {
        eventType: EventType.TaskCreated,
        fromVersion: 2,
        toVersion: 3,
        up(data) {
          return { ...data, title: String(data.title).toUpperCase() };
        },
      },
    ];

    const registry = new UpcasterRegistry(upcasters, 3);
    const result = registry.upcast(EventType.TaskCreated, 1, { title: 'test task' });

    expect(result).toEqual({ title: 'TEST TASK', project: 'inbox' });
  });

  it('warns and returns partially-upcasted data when a chain step is missing', () => {
    const registry = new UpcasterRegistry(
      [
        {
          eventType: EventType.TaskCreated,
          fromVersion: 1,
          toVersion: 2,
          up(data) {
            return { ...data, project: 'inbox' };
          },
        },
      ],
      3
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // v1->v2 upcaster runs (adds project), then v2->v3 is missing so data returned as-is
    const result = registry.upcast(EventType.TaskCreated, 1, { title: 'missing v2->v3 upcaster' });

    expect(result).toEqual({ title: 'missing v2->v3 upcaster', project: 'inbox' });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing upcaster')
    );

    warnSpy.mockRestore();
  });
});
