import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const missing = [];
if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR_')) missing.push('SUPABASE_URL');
if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('YOUR_')) missing.push('SUPABASE_ANON_KEY');

export const CONFIGURED = missing.length === 0;

if (!CONFIGURED) {
  window.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.className = 'config-warning';
    banner.innerHTML = `<strong>Setup needed.</strong> Open <code>js/config.js</code> and paste your
      Supabase project URL and anon key (${missing.join(', ')}). See README.md step 2.`;
    document.body.prepend(banner);
  });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
