import { Command } from 'commander';
import { GUIDE_CONTENT } from './guide-content.js';

export function createGuideCommand(): Command {
  return new Command('guide')
    .description('Output HZL workflow documentation for AI agents')
    .action(() => {
      console.log(GUIDE_CONTENT);
    });
}
