#!/usr/bin/env node
import { program } from 'commander';
import { exitCodeFromError } from './errors/error-serializer.js';

program
  .name('pendo-automation')
  .description('Automates creation of Pendo release-note guides from JSON manifests')
  .version('1.0.0');

// ── pendo:auth ────────────────────────────────────────────────────────────────
program
  .command('pendo:auth')
  .description('Open browser for manual Pendo authentication')
  .option('--config <path>', 'Path to automation config file')
  .option('--slow', 'Enable slow motion for browser actions')
  .option('--debug', 'Enable verbose logging')
  .action(async (opts) => {
    const { runAuthCommand } = await import('./commands/auth-command.js');
    await runAuthCommand(opts).catch(handleError);
  });

// ── pendo:doctor ──────────────────────────────────────────────────────────────
program
  .command('pendo:doctor')
  .description('Verify Pendo connection, app, template fingerprint, and selectors')
  .option('--config <path>', 'Path to automation config file')
  .option('--slow', 'Enable slow motion for browser actions')
  .option('--debug', 'Enable verbose logging')
  .action(async (opts) => {
    const { runDoctorCommand } = await import('./commands/doctor-command.js');
    await runDoctorCommand(opts).catch(handleError);
  });

// ── release:validate ──────────────────────────────────────────────────────────
program
  .command('release:validate <manifest>')
  .description('Validate a release manifest without opening a browser')
  .option('--config <path>', 'Path to automation config file')
  .action(async (manifest, opts) => {
    const { runValidateCommand } = await import('./commands/validate-command.js');
    await runValidateCommand(manifest, opts).catch(handleError);
  });

// ── release:create ────────────────────────────────────────────────────────────
program
  .command('release:create <manifest>')
  .description('Create a Draft Pendo release-note guide from a manifest')
  .option('--config <path>', 'Path to automation config file')
  .option('--resume', 'Resume an incomplete run from its journal')
  .option('--slow', 'Enable slow motion for browser actions')
  .option('--debug', 'Enable verbose logging')
  .option('--keep-browser-open', 'Keep browser open after completion or failure')
  .action(async (manifest, opts) => {
    const { runCreateCommand } = await import('./commands/create-command.js');
    await runCreateCommand(manifest, {
      ...opts,
      keepBrowserOpen: opts.keepBrowserOpen,
    }).catch(handleError);
  });

function handleError(err: unknown): never {
  const code = exitCodeFromError(err);
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n✗ ${msg}\n`);
  process.exit(code);
}

program.parse(process.argv);
