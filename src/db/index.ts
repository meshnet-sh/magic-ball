import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

// This function takes the Cloudflare D1 binding and returns the Drizzle instance
export function getDb(d1: any) {
    return drizzle(d1, { schema });
}
