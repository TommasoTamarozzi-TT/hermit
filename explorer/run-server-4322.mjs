import { startServer } from './dist/server/entry.mjs';

(async () => {
  try {
    await startServer({ port: 4322, host: '127.0.0.1' });
    console.log('Explorer server started on 127.0.0.1:4322');
  } catch (err) {
    console.error('Failed to start explorer server on 4322', err);
    process.exit(1);
  }
})();
