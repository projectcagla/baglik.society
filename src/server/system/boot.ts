import { migrate } from '../../../scripts/migrate';
import { seed } from '../../../scripts/seed';
import { invalidEnvNames } from '../env-schema';

// Boot-time database preparation (MIGRATE_ON_BOOT=1). A failure stops the
// process: serving code that expects a newer schema is worse than not
// serving. Logs name variables and migration files, never values.
export async function prepareDatabase(log = (m: string) => console.log(`[açılış] ${m}`)) {
  const invalid = invalidEnvNames();
  if (invalid.length)
    throw new Error(`[açılış] eksik veya geçersiz ortam değişkenleri: ${invalid.join(', ')}`);
  const started = Date.now();
  await migrate(undefined, log);
  await seed(undefined, log);
  log(`veritabanı hazır (${Date.now() - started} ms)`);
}
