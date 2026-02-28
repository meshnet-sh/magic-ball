import { getDb } from './src/db/index';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';
import { getCloudflareContext } from '@opennextjs/cloudflare';

async function main() {
    const { env } = await getCloudflareContext();
    const db = getDb(env.DB);
    const user = await db.select().from(users).where(eq(users.email, 'meshnet@163.com')).get();
    console.log("User ID for meshnet@163.com:", user?.id);
}

main().catch(console.error);
