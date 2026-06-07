const JALASAI_RUNTIME_CLOUD_CONFIG = window.JALASAI_CLOUD_CONFIG || {};

window.JALASAI_CLOUD_CONFIG = {
  // Runtime config can come from Cloudflare Pages /config.js, or local config.js.
  projectUrl: JALASAI_RUNTIME_CLOUD_CONFIG.projectUrl
    || window.SUPABASE_URL
    || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : ''),
  anonKey: JALASAI_RUNTIME_CLOUD_CONFIG.anonKey
    || window.SUPABASE_ANON_KEY
    || (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : ''),
  adminEmails: Array.isArray(JALASAI_RUNTIME_CLOUD_CONFIG.adminEmails)
    ? JALASAI_RUNTIME_CLOUD_CONFIG.adminEmails
    : ['1.priyannsh@gmail.com', 'jalasaiautogarage@gmail.com'],
};
