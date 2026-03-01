import type { SSEState } from './types';

export type { SSEState };

interface ConnectionStatusProps {
  state: SSEState;
}

export default function ConnectionStatus({ state }: ConnectionStatusProps) {
  let dotClass = 'connection-dot';
  let label = 'Connecting...';

  if (state === 'live') {
    dotClass += ' live';
    label = 'Live';
  } else if (state === 'reconnecting' || state === 'error') {
    dotClass += ' error';
    label = state === 'reconnecting' ? 'Reconnecting...' : 'Sync error';
  }

  return (
    <div className="connection-indicator">
      <div className={dotClass} />
      <span>{label}</span>
    </div>
  );
}
