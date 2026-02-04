import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGuideCommand } from './guide.js';
import { GUIDE_CONTENT } from './guide-content.js';

describe('guide command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should output the guide content', async () => {
    const command = createGuideCommand();
    await command.parseAsync([], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalledWith(GUIDE_CONTENT);
  });

  it('should have guide content from HZL-GUIDE.md', () => {
    // Verify the content includes expected sections
    expect(GUIDE_CONTENT).toContain('HZL task ledger');
    expect(GUIDE_CONTENT).toContain('Use HZL when:');
    expect(GUIDE_CONTENT).toContain('Skip HZL when:');
    expect(GUIDE_CONTENT).toContain('hzl project list');
    expect(GUIDE_CONTENT).toContain('hzl task');
  });
});
