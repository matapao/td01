import { launchBrowser as launchSharedBrowser } from '@zirbel/engineering/browser';
export const launchBrowser = () =>
  launchSharedBrowser({
    headless: true,
    // Hosted runners can start cold Chrome slowly; gameplay/readiness deadlines stay separate.
    startMs: process.env['CI'] ? 60000 : 20000,
    args: [
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
      ...(process.platform === 'darwin'
        ? ['--use-angle=metal']
        : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
