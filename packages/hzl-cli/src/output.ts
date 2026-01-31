// packages/hzl-cli/src/output.ts
export interface OutputFormatter {
  table(data: Record<string, unknown>[], columns?: string[]): void;
  json(data: unknown): void;
  text(message: string): void;
  success(message: string): void;
  error(message: string): void;
}

export function createFormatter(jsonMode: boolean): OutputFormatter {
  return {
    table(data: Record<string, unknown>[], columns?: string[]) {
      if (jsonMode) {
        console.log(JSON.stringify(data));
      } else {
        if (data.length === 0) {
          console.log('No results');
          return;
        }
        const cols = columns ?? Object.keys(data[0]);
        console.log(cols.join('\t'));
        for (const row of data) {
          console.log(
            cols
              .map((c) => {
                const value = row[c];
                if (value === null || value === undefined) return '';
                if (typeof value === 'string') return value;
                if (typeof value === 'number' || typeof value === 'boolean') {
                  return String(value);
                }
                return JSON.stringify(value);
              })
              .join('\t')
          );
        }
      }
    },
    json(data: unknown) {
      console.log(JSON.stringify(data, null, jsonMode ? 0 : 2));
    },
    text(message: string) {
      if (!jsonMode) console.log(message);
    },
    success(message: string) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: true, message }));
      } else {
        console.log(`✓ ${message}`);
      }
    },
    error(message: string) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: false, error: message }));
      } else {
        console.error(`✗ ${message}`);
      }
    },
  };
}

export function formatOutput(jsonMode: boolean, data: unknown): void {
  createFormatter(jsonMode).json(data);
}

export function printSuccess(message: string, jsonMode = false): void {
  createFormatter(jsonMode).success(message);
}

export function printError(message: string, jsonMode = false): void {
  createFormatter(jsonMode).error(message);
}

export function printTable(
  data: Record<string, unknown>[],
  columns?: string[],
  jsonMode = false
): void {
  createFormatter(jsonMode).table(data, columns);
}
