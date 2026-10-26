import { openGameStatistics, type LocalStatisticsOptions } from './statistics.ts';
import type { ReportMetric } from './metrics.ts';
// Starts the LAN server: the game on http://<this computer>:7777 and the match on /ws.
// `npm run lan` builds the game and runs this under run.ts, which restarts it when the players
// switch to new code (or if it crashes), handing the running game over.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { TPS } from '../src/game/config.ts';
import { Room } from './room.ts';
import { loadRelease } from './release.ts';
import { openSaves, type SavedGame } from './saves.ts';
import { serveFiles } from './static.ts';
import { watchForUpdates } from './updates.ts';
import { allowedOrigin, LAN_LIMITS } from './security.ts';
import type { SaveStore } from './saves.ts';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Where `npm run lan` puts the built game. */
export const DIST = join(ROOT, '.lan', 'dist');

// Out of the way of the usual dev-server ports (3000, 5173, 8080), and easy to type at a party.
const DEFAULT_PORT = 7777;

export interface ServerOptions {
  statistics?: LocalStatisticsOptions;
  reportMetric?: ReportMetric;
  statisticsHttp?: (request: IncomingMessage, response: ServerResponse) => boolean;
  port?: number;
  host?: string;
  dist?: string;
  restore?: SavedGame | null;
  saves?: SaveStore;
  allowDevCommands?: boolean;
  /** With update, the server watches its own code and offers new versions to the players. */
  update?: (handover: { state: SavedGame; by: string | null }) => void;
}

export async function startServer({
  port = DEFAULT_PORT,
  host,
  dist = DIST,
  restore = null,
  update,
  saves: providedSaves,
  allowDevCommands = false,
  reportMetric,
  statisticsHttp,
  statistics: statisticsOptions,
}: ServerOptions = {}) {
  const release = await loadRelease(ROOT, dist);
  const saves = providedSaves ?? (await openSaves(ROOT));
  let statistics: Awaited<ReturnType<typeof openGameStatistics>> | null = null;
  try {
    if (statisticsOptions) statistics = await openGameStatistics(statisticsOptions, release.version);
  } catch (error) {
    if (!providedSaves) await saves.close?.();
    throw error;
  }
  const metrics: ReportMetric | undefined =
    statistics || reportMetric
      ? (name, value, labels) => {
          statistics?.report(name, value, labels);
          reportMetric?.(name, value, labels);
        }
      : undefined;
  let room: Room | null = null;
  let addresses: string[] = [];
  const files = serveFiles(release, () => ({ lan: true, version: release.version, addresses }));
  const server = createServer((request, response) => {
    if (!statistics?.http(request, response) && !statisticsHttp?.(request, response))
      files(request, response);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
  } catch (error) {
    await statistics?.close();
    if (!providedSaves) await saves.close?.();
    throw error;
  }
  const actualPort: number = (server.address() as { port: number }).port;
  addresses = lanAddresses().map((ip) => `http://${ip}:${actualPort}`);
  try {
    room = new Room({
      addresses,
      version: release.version,
      saves,
      restore,
      allowDevCommands,
      ...(metrics ? { reportMetric: metrics } : {}),
    });
  } catch (error) {
    server.close();
    await statistics?.close();
    if (!providedSaves) await saves.close?.();
    throw error;
  }
  const sockets = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: LAN_LIMITS.messageBytes,
    verifyClient: (info: { origin: string; req: IncomingMessage }) =>
      allowedOrigin(info.origin, info.req.headers.host),
  });
  sockets.on('connection', (socket) => room!.connect(socket));
  const ticker = setInterval(() => room!.tick(), 1000 / TPS);

  let watcher: ReturnType<typeof watchForUpdates> | null = null;
  const handle = {
    port: actualPort,
    addresses,
    room,
    saves,
    version: release.version,
    async close() {
      clearInterval(ticker);
      watcher?.stop();
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      try {
        await statistics?.close();
      } finally {
        if (!providedSaves) await saves.close?.();
      }
    },
  };

  if (update) {
    watcher = watchForUpdates({
      root: ROOT,
      version: release.version,
      offer: (version) => room!.offerUpdate(version !== null),
    });
    let switching = false;
    room.onUpdate = async (by) => {
      if (switching) return;
      switching = true;
      if (!(await watcher!.confirm())) {
        switching = false; // the code changed again; the watcher offers the newer version once it's checked
        return;
      }
      room!.broadcast({ type: 'updating', by });
      const state = room!.saveState();
      server.close(); // no new connections: browsers must reconnect to the new server, not this one
      // A clean close lets the message above arrive first; browsers reconnect and reload by themselves.
      for (const socket of sockets.clients) socket.close(1012, 'Updating');
      await delay(300);
      await handle.close();
      update({ state, by });
    };
  }
  return handle;
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a): a is NonNullable<typeof a> => !!a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = process.env['PORT'] ? Number(process.env['PORT']) : DEFAULT_PORT;
  // Under `npm run lan`, run.ts supervises this process over an IPC channel.
  const supervised = typeof process.send === 'function';
  const statePath = process.env['BROWSERDEFENSE_STATE_FILE'];
  const restore = statePath
    ? await readFile(statePath, 'utf8')
        .then((s) => JSON.parse(s) as SavedGame)
        .catch(() => null)
    : null;
  try {
    const server = await startServer({
      port,
      restore,
      statistics: {
        directory: process.env['TD01_STATISTICS_DIR'] ?? join(ROOT, 'saves', 'statistics'),
        instance: process.env['TD01_INSTANCE'] ?? `td01-${port}`,
      },
      ...(supervised
        ? {
            update: ({ state, by }: { state: SavedGame; by: string | null }) =>
              process.send!({ type: 'restart', state, by }, () => process.exit(0)),
          }
        : {}),
    });
    let shuttingDown = false;
    const shutdown = async (): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      try {
        await server.close();
        process.exit(0);
      } catch (error) {
        console.error('Server shutdown failed:', error instanceof Error ? error.message : 'unknown failure');
        process.exit(1);
      }
    };
    process.once('SIGINT', () => {
      void shutdown();
    });
    process.once('SIGTERM', () => {
      void shutdown();
    });
    if (supervised) {
      process.send!({ type: 'ready', port: server.port });
      // The supervisor keeps the latest game, so it survives a crash too.
      setInterval(
        () => process.connected && process.send!({ type: 'state', state: server.room.saveState() }),
        5000,
      ).unref();
      process.on('disconnect', () => {
        void shutdown();
      }); // the supervisor has stopped
    }
    if (!process.env['BROWSERDEFENSE_RESTARTED']) {
      console.log('\nBrowserDefense is running.\n');
      console.log(`  On this computer:  http://localhost:${server.port}`);
      for (const address of server.addresses) console.log(`  On the LAN:        ${address}`);
      console.log(
        `\nSaved games go to ${server.saves.kind === 'postgres' ? 'Postgres (DATABASE_URL)' : './saves'}.`,
      );
      console.log(`  Game statistics:   http://localhost:${server.port}/stats`);
      console.log('Give the LAN address to the other players. Press Ctrl+C to stop.');
      if (supervised)
        console.log('When the code changes, players get an Update button to switch to the new version.');
      console.log('');
    }
  } catch (error) {
    if ((error as { code?: string }).code !== 'EADDRINUSE') throw error;
    console.error(`Port ${port} is already in use. Start on another port with: PORT=${port + 1} npm run lan`);
    process.exit(1);
  }
}
