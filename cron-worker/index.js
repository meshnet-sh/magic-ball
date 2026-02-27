// Magic Ball Cron Worker
// Deployed as a separate Cloudflare Worker with cron trigger
// Calls the main app's /api/scheduler/cron endpoint every minute

export default {
    async scheduled(event, env, ctx) {
        const CRON_SECRET = 'mb-cron-2026-secret';
        const APP_URL = 'https://magic-ball.meshnets.org';

        try {
            const res = await fetch(`${APP_URL}/api/scheduler/cron?key=${CRON_SECRET}`);
            const data = await res.json();
            console.log(`Cron triggered: ${data.triggered || 0} tasks executed`);
        } catch (err) {
            console.error('Cron trigger failed:', err);
        }
    },

    // Also support manual trigger via HTTP for testing
    async fetch(request, env, ctx) {
        const CRON_SECRET = 'mb-cron-2026-secret';
        const APP_URL = 'https://magic-ball.meshnets.org';

        try {
            const res = await fetch(`${APP_URL}/api/scheduler/cron?key=${CRON_SECRET}`);
            const data = await res.json();
            return new Response(JSON.stringify(data, null, 2), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
    }
};
