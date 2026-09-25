// Checks source links from the command line (same code as the cron).
//   npm run links:check -- --limit 20
import { parseArgs } from 'node:util';
import { closeDb } from '@/server/db/client';
import { checkLinks } from '@/server/system/link-check';

const { values } = parseArgs({ options: { limit: { type: 'string', default: '20' } } });
checkLinks({ limit: Number(values.limit), staleHours: 0 })
  .then((n) => console.log(`checked ${n} links`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
