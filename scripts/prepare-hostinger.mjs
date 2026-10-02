import nextEnv from '@next/env';
import {prepareHostinger} from '../lib/server/prepare-hostinger.mjs';
process.env.NODE_ENV ||= 'production';
nextEnv.loadEnvConfig(process.cwd());
try { await prepareHostinger(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
finally { const {db} = await import('../lib/server/database.ts'); await db.close(); }
