import { Command } from 'commander';
import { createAddCommand } from './add.js';
import { createListCommand } from './list.js';
import { createShowCommand } from './show.js';
import { createClaimCommand } from './claim.js';
import { createCompleteCommand } from './complete.js';
import { createReleaseCommand } from './release.js';
import { createArchiveCommand } from './archive.js';
import { createReopenCommand } from './reopen.js';
import { createStuckCommand } from './stuck.js';
import { createSetStatusCommand } from './set-status.js';
import { createUpdateCommand } from './update.js';
import { createMoveCommand } from './move.js';
import { createStealCommand } from './steal.js';
import { createAddDepCommand } from './add-dep.js';
import { createRemoveDepCommand } from './remove-dep.js';
import { createCommentCommand } from './comment.js';
import { createCheckpointCommand } from './checkpoint.js';
import { createHistoryCommand } from './history.js';
import { createSearchCommand } from './search.js';
import { createNextCommand } from './next.js';
import { createBlockCommand } from './block.js';
import { createUnblockCommand } from './unblock.js';
import { createProgressCommand } from './progress.js';

export function createTaskCommand(): Command {
  const command = new Command('task').description('Task management commands');

  command.addCommand(createAddCommand());
  command.addCommand(createListCommand());
  command.addCommand(createShowCommand());
  command.addCommand(createClaimCommand());
  command.addCommand(createCompleteCommand());
  command.addCommand(createReleaseCommand());
  command.addCommand(createArchiveCommand());
  command.addCommand(createReopenCommand());
  command.addCommand(createStuckCommand());
  command.addCommand(createSetStatusCommand());
  command.addCommand(createUpdateCommand());
  command.addCommand(createMoveCommand());
  command.addCommand(createStealCommand());
  command.addCommand(createAddDepCommand());
  command.addCommand(createRemoveDepCommand());
  command.addCommand(createCommentCommand());
  command.addCommand(createCheckpointCommand());
  command.addCommand(createHistoryCommand());
  command.addCommand(createSearchCommand());
  command.addCommand(createNextCommand());
  command.addCommand(createBlockCommand());
  command.addCommand(createUnblockCommand());
  command.addCommand(createProgressCommand());

  return command;
}
