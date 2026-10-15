// js/login.js — magic-link sign in.
import { getSession, signInWithEmail } from './auth.js';

if (await getSession()) {
  window.location.href = 'index.html';
}

const form = document.getElementById('login-form');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const errEl = document.getElementById('email-error');
  const msgEl = document.getElementById('login-message');
  const btn = document.getElementById('login-btn');
  errEl.textContent = '';
  msgEl.innerHTML = '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Enter a valid email address.';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Sending…';
  const err = await signInWithEmail(email);
  btn.disabled = false;
  btn.textContent = 'Email me a sign-in link';
  if (err) {
    msgEl.innerHTML = `<div class="banner" style="border-color:var(--red); background:rgba(192,86,75,0.12);">
      <span>Could not send the link: ${err.message}</span></div>`;
  } else {
    msgEl.innerHTML = `<div class="banner"><span><b>Check your inbox.</b> Click the link in the email to enter your terminal. You can close this page.</span></div>`;
  }
});
