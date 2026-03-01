/** Emoji family system for parent/child task indicators */
const FAMILY_EMOJIS = [
  '\u{1F537}', '\u{1F536}', '\u{1F534}', '\u{1F7E2}', '\u{1F535}', '\u{1F7E1}', '\u{1F7E3}', '\u{1F7E0}',
  '\u2B1B', '\u2B1C', '\u{1F533}', '\u{1F532}', '\u25AA\uFE0F', '\u25AB\uFE0F', '\u25FE', '\u25FD',
  '\u{1F4A0}', '\u{1F539}', '\u{1F538}', '\u2666\uFE0F', '\u2660\uFE0F', '\u2663\uFE0F', '\u2665\uFE0F', '\u{1F0CF}',
  '\u2B50', '\u{1F31F}', '\u2728', '\u{1F4AB}', '\u{1F506}', '\u{1F505}', '\u2600\uFE0F', '\u{1F319}',
  '\u{1F3AF}', '\u{1F3EA}', '\u{1F3A8}', '\u{1F3AD}', '\u{1F3AC}', '\u{1F3AE}', '\u{1F3B2}', '\u{1F3B8}',
  '\u{1F511}', '\u{1F510}', '\u{1F512}', '\u{1F513}', '\u{1F5DD}\uFE0F', '\u26A1', '\u{1F4A1}', '\u{1F514}',
];

/** djb2 hash for deterministic emoji assignment */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash;
}

export function getTaskEmoji(taskId: string): string {
  return FAMILY_EMOJIS[Math.abs(djb2Hash(taskId)) % FAMILY_EMOJIS.length];
}

export function getTaskFamilyColor(taskId: string): string {
  const hue = Math.abs(djb2Hash(taskId)) % 360;
  return `hsl(${hue} 55% 55%)`;
}

export interface EmojiInfo {
  emoji: string;
  suffix: number | null;
}

/** Build emoji map with suffix numbers for children */
export function buildEmojiMap(
  taskList: Array<{ task_id: string; parent_id: string | null; subtask_total?: number }>,
): Map<string, EmojiInfo> {
  const taskIds = new Set(taskList.map((t) => t.task_id));
  const childrenByParent = new Map<string, typeof taskList>();

  for (const task of taskList) {
    if (task.parent_id && taskIds.has(task.parent_id)) {
      if (!childrenByParent.has(task.parent_id)) {
        childrenByParent.set(task.parent_id, []);
      }
      childrenByParent.get(task.parent_id)!.push(task);
    }
  }

  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.task_id.localeCompare(b.task_id));
  }

  const emojiMap = new Map<string, EmojiInfo>();

  for (const task of taskList) {
    if (task.parent_id) {
      const emoji = getTaskEmoji(task.parent_id);
      const siblings = childrenByParent.get(task.parent_id) || [];
      const idx = siblings.indexOf(task);
      const suffix = siblings.length > 0 && idx >= 0 ? idx + 1 : null;
      emojiMap.set(task.task_id, { emoji, suffix });
    } else {
      emojiMap.set(task.task_id, { emoji: getTaskEmoji(task.task_id), suffix: null });
    }
  }

  return emojiMap;
}
