function jsString(value) {
  return JSON.stringify(String(value || ''));
}

function adminEmails(env) {
  const raw = String(env.JALASAI_ADMIN_EMAILS || '').trim();
  if (!raw) return ['1.priyannsh@gmail.com', 'jalasaiautogarage@gmail.com'];
  return raw
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/config.js') {
      const projectUrl = String(env.SUPABASE_URL || '').trim();
      const anonKey = String(env.SUPABASE_ANON_KEY || '').trim();
      // No env config (e.g. preview deployments without production env vars):
      // fall through to static assets so a bundled config.js can serve instead
      // of overriding it with empty values.
      if (!projectUrl && !anonKey) {
        return env.ASSETS.fetch(request);
      }
      const admins = adminEmails(env);
      const body = [
        'window.SUPABASE_URL = ' + jsString(projectUrl) + ';',
        'window.SUPABASE_ANON_KEY = ' + jsString(anonKey) + ';',
        'window.JALASAI_CLOUD_CONFIG = {',
        '  projectUrl: window.SUPABASE_URL,',
        '  anonKey: window.SUPABASE_ANON_KEY,',
        '  adminEmails: ' + JSON.stringify(admins),
        '};',
        '',
      ].join('\n');

      return new Response(body, {
        headers: {
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'no-store, max-age=0',
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
