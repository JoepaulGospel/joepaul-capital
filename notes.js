// js/notes.js — personal notes CRUD.
import { requireAuth } from './auth.js';
import { fetchNotes, saveNote, deleteNote } from './db.js';
import { renderSidebar, setUserEmail, toast, fmtDate, escapeHtml } from './ui.js';

renderSidebar('notes');

const session = await requireAuth();
let notes = [];

if (session) init();

async function init() {
  setUserEmail(session.user.email);
  document.getElementById('note-form').addEventListener('submit', onSave);
  document.getElementById('n-cancel').addEventListener('click', cancelEdit);
  await reload();
}

async function reload() {
  try {
    notes = await fetchNotes(session.user.id);
  } catch (err) {
    toast('Could not load notes.', 'error');
    notes = [];
  }
  render();
}

function render() {
  const host = document.getElementById('notes-list');
  if (!notes.length) {
    host.innerHTML = '<div class="empty-state">No notes yet — write your first weekly review.</div>';
    return;
  }
  host.innerHTML = notes.map((n) => `
    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div style="font-family:'Cormorant Garamond',serif; font-size:21px;">${escapeHtml(n.title)}</div>
        <div style="display:flex; gap:8px; flex:none;">
          <button class="btn btn-ghost btn-small" data-edit="${n.id}">Edit</button>
          <button class="btn btn-danger btn-small" data-del="${n.id}">Delete</button>
        </div>
      </div>
      <div class="muted" style="white-space:pre-wrap; margin-top:8px;">${escapeHtml(n.body || '')}</div>
      <div class="hint" style="margin-top:10px;">Updated ${fmtDate(n.updated_at)}</div>
    </div>`).join('');
  host.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => startEdit(b.dataset.edit)));
  host.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => onDelete(b.dataset.del)));
}

function startEdit(id) {
  const n = notes.find((x) => x.id === id);
  if (!n) return;
  document.getElementById('n-id').value = n.id;
  document.getElementById('n-title').value = n.title;
  document.getElementById('n-body').value = n.body || '';
  document.getElementById('n-save').textContent = 'Save Changes';
  document.getElementById('n-cancel').style.display = 'inline-flex';
  document.getElementById('note-form-label').textContent = 'Edit Note';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
  document.getElementById('n-id').value = '';
  document.getElementById('note-form').reset();
  document.getElementById('n-save').textContent = 'Save Note';
  document.getElementById('n-cancel').style.display = 'none';
  document.getElementById('note-form-label').textContent = 'New Note';
  document.getElementById('n-e-title').textContent = '';
}

async function onSave(e) {
  e.preventDefault();
  const title = document.getElementById('n-title').value.trim();
  if (!title) {
    document.getElementById('n-e-title').textContent = 'Title is required.';
    return;
  }
  const payload = {
    id: document.getElementById('n-id').value || null,
    title,
    body: document.getElementById('n-body').value.trim(),
  };
  try {
    await saveNote(session.user.id, payload);
    toast('Note saved.', 'success');
    cancelEdit();
    await reload();
  } catch (err) {
    toast('Save failed: ' + (err.message || 'unknown error'), 'error');
  }
}

async function onDelete(id) {
  const n = notes.find((x) => x.id === id);
  if (!n || !confirm(`Delete note "${n.title}"?`)) return;
  try {
    await deleteNote(id);
    toast('Note deleted.', 'success');
    if (document.getElementById('n-id').value === id) cancelEdit();
    await reload();
  } catch (err) {
    toast('Delete failed.', 'error');
  }
}
