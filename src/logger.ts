import * as fs from 'node:fs';
import * as path from 'node:path';

const LOG_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(LOG_DIR, 'agent.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp(): string {
  return new Date().toISOString();
}

function write(level: string, message: string): void {
  const line = `[${timestamp()}] [${level}] ${message}`;
  console.log(line);

  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Ignore logging failures so the agent can keep running.
  }
}

export function info(message: string): void {
  write('INFO ', message);
}

export function warn(message: string): void {
  write('WARN ', message);
}

export function error(message: string): void {
  write('ERROR', message);
}
