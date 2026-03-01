import { CURRENT_SCHEMA_VERSION, EventType } from './types.js';

export interface EventUpcaster {
  eventType: EventType;
  fromVersion: number;
  toVersion: number;
  up(data: Record<string, unknown>): Record<string, unknown>;
}

export class UpcasterRegistry {
  private readonly index = new Map<string, EventUpcaster>();

  constructor(
    private readonly upcasters: EventUpcaster[] = [],
    private readonly currentVersion: number = CURRENT_SCHEMA_VERSION
  ) {
    for (const upcaster of upcasters) {
      this.index.set(this.key(upcaster.eventType, upcaster.fromVersion, upcaster.toVersion), upcaster);
    }
  }

  upcast(type: EventType, fromVersion: number, data: Record<string, unknown>): Record<string, unknown> {
    if (fromVersion >= this.currentVersion) {
      return data;
    }

    let version = fromVersion;
    let currentData = data;

    while (version < this.currentVersion) {
      const nextVersion = version + 1;
      const upcaster = this.index.get(this.key(type, version, nextVersion));
      if (!upcaster) {
        console.warn(
          `Missing upcaster for event type "${type}" from schema v${version} to v${nextVersion}; returning data unchanged`
        );
        return currentData;
      }
      currentData = upcaster.up(currentData);
      version = nextVersion;
    }

    return currentData;
  }

  private key(type: EventType, fromVersion: number, toVersion: number): string {
    return `${type}:${fromVersion}:${toVersion}`;
  }
}
