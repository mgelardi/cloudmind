// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let currentUser    = null;
let currentProfile = null;
let thoughts       = [];
let tags           = new Set();
let dragging       = null;
let dragOffX       = 0;
let dragOffY       = 0;
let isTimeline     = false;
let activeTag      = '';
let activeMonth    = '';
let isOwner        = false;

const DEFAULT_EMPTY_MESSAGE = 'no thoughts here yet ☁️';
const floatClasses = ['float-1', 'float-2', 'float-3'];

// ─────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────
const sky            = document.getElementById('sky');
const timelineView   = document.getElementById('timeline-view');
const emptyMsg       = document.getElementById('empty-msg');
const hint           = document.getElementById('hint');
const addBtn         = document.getElementById('add-btn');
const authBtn        = document.getElementById('auth-btn');
const settingsBtn    = document.getElementById('settings-btn');
const userNameEl     = document.getElementById('user-name');
const loadingEl      = document.getElementById('loading');
const filterTagInput = document.getElementById('filter-tag');
const filterTagList  = document.getElementById('filter-tag-list');
const filterMonth    = document.getElementById('filter-month');
const sortBtn        = document.getElementById('sort-btn');

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────
const escHtml = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const formatDate = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthKey = iso => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = key => {
  const [y, m] = key.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};
const randomPos = () => ({
  x: 60 + Math.random() * (window.innerWidth - 280 - 120),
  y: 60 + Math.random() * (window.innerHeight - 180 - 120),
});
const openOverlay = id => document.getElementById(id).classList.add('open');
const closeOverlay = id => document.getElementById(id).classList.remove('open');
const hideLoading = () => { loadingEl.style.display = 'none'; };
const showFatalError = message => {
  emptyMsg.textContent = message;
  emptyMsg.style.display = 'block';
  authBtn.style.display = 'none';
};
const resetEmptyMessage = () => { emptyMsg.textContent = DEFAULT_EMPTY_MESSAGE; };

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const init = {
    credentials: 'include',
    ...options,
    headers,
  };

  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, init);
  const text = await res.text();
  const payload = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  })() : null;

  if (!res.ok) {
    const err = new Error(payload?.error || payload?.message || 'Request failed');
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

// ─────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────
async function init() {
  resetEmptyMessage();
  try {
    const session = await apiFetch('/api/auth/session');
    await applySession(session);
  } catch (error) {
    if (error.status === 401) {
      hideLoading();
      return;
    }
    console.error('init session error:', error);
    showFatalError('App failed to load. Please try again later.');
    hideLoading();
  }
}

// ─────────────────────────────────────────────
//  SIGN IN / OUT
// ─────────────────────────────────────────────
async function applySession(session) {
  currentUser = session.user;
  currentProfile = session.profile;
  isOwner = true;
  resetEmptyMessage();
  userNameEl.textContent = currentProfile.username;
  authBtn.style.display = 'none';
  settingsBtn.style.display = '';
  addBtn.classList.add('visible');
  closeOverlay('auth-overlay');
  await loadThoughts();
  hideLoading();
}

function handleSignOut() {
  currentUser = null;
  currentProfile = null;
  isOwner = false;
  isTimeline = false;
  activeTag = '';
  activeMonth = '';
  userNameEl.textContent = '';
  authBtn.style.display = '';
  authBtn.textContent = 'sign in';
  settingsBtn.style.display = 'none';
  addBtn.classList.remove('visible');
  sky.innerHTML = '';
  sky.style.display = 'block';
  timelineView.innerHTML = '';
  timelineView.classList.remove('active');
  filterTagInput.value = '';
  filterMonth.value = '';
  sortBtn.classList.remove('active');
  hint.style.display = '';
  thoughts = [];
  tags = new Set();
  resetEmptyMessage();
  refreshFilterOptions();
  emptyMsg.style.display = 'none';
  hideLoading();
}

// ─────────────────────────────────────────────
//  LOAD THOUGHTS
// ─────────────────────────────────────────────
async function loadThoughts() {
  sky.innerHTML = '';
  thoughts = [];
  tags = new Set();
  const data = await apiFetch('/api/thoughts');
  thoughts = data?.thoughts || [];
  thoughts.forEach(t => tags.add(t.tag));
  thoughts.forEach(makeCloud);
  refreshFilterOptions();
  applyFilters();
}

// ─────────────────────────────────────────────
//  AUTH PANEL
// ─────────────────────────────────────────────
let authMode = 'login';

function switchTab(mode) {
  authMode = mode;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('signup-extra').style.display = mode === 'signup' ? '' : 'none';
  document.getElementById('auth-title').textContent = mode === 'login' ? 'welcome back' : 'create your cloud';
  document.getElementById('auth-submit').textContent = mode === 'login' ? 'sign in' : 'sign up';
  document.getElementById('auth-error').textContent = '';
}
window.switchTab = switchTab;

authBtn.addEventListener('click', () => openOverlay('auth-overlay'));
document.getElementById('auth-overlay').addEventListener('click', e => {
  if (e.target.id === 'auth-overlay') closeOverlay('auth-overlay');
});

document.getElementById('auth-submit').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';

  if (!email || !password) {
    errEl.textContent = 'please fill in all fields';
    return;
  }

  try {
    if (authMode === 'login') {
      const session = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await applySession(session);
      return;
    }

    const username = document.getElementById('auth-username').value.trim();
    const isPublic = document.getElementById('auth-public').checked;
    if (!username) {
      errEl.textContent = 'please choose a username';
      return;
    }

    const availability = await apiFetch(`/api/profile/availability?username=${encodeURIComponent(username)}`);
    if (!availability.available) {
      errEl.textContent = 'username already taken';
      return;
    }

    const session = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, username, isPublic }),
    });
    await applySession(session);
  } catch (error) {
    errEl.textContent = error.message;
  }
});

// ─────────────────────────────────────────────
//  SETTINGS PANEL
// ─────────────────────────────────────────────
settingsBtn.addEventListener('click', async () => {
  if (!currentProfile) return;
  document.getElementById('set-username').value = currentProfile.username;
  document.getElementById('set-public').checked = currentProfile.is_public;
  document.getElementById('set-public-label').textContent = currentProfile.is_public ? 'public profile' : 'private profile';
  updateGrantsSection(currentProfile.is_public);
  await loadGrants();
  openOverlay('settings-overlay');
});

document.getElementById('set-public').addEventListener('change', function handlePublicToggle() {
  updateGrantsSection(this.checked);
  document.getElementById('set-public-label').textContent = this.checked ? 'public profile' : 'private profile';
});

function updateGrantsSection(isPublic) {
  const gs = document.getElementById('grants-section');
  gs.style.opacity = isPublic ? '0.4' : '1';
  gs.style.pointerEvents = isPublic ? 'none' : '';
}

document.getElementById('settings-save').addEventListener('click', async () => {
  const username = document.getElementById('set-username').value.trim();
  const isPublic = document.getElementById('set-public').checked;
  const errEl = document.getElementById('settings-error');
  errEl.textContent = '';

  if (!username) {
    errEl.textContent = 'username cannot be empty';
    return;
  }

  try {
    if (username !== currentProfile.username) {
      const availability = await apiFetch(`/api/profile/availability?username=${encodeURIComponent(username)}`);
      if (!availability.available) {
        errEl.textContent = 'username already taken';
        return;
      }
    }

    const data = await apiFetch('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ username, isPublic }),
    });

    currentProfile = data.profile;
    userNameEl.textContent = currentProfile.username;
    closeOverlay('settings-overlay');
  } catch (error) {
    errEl.textContent = error.message;
  }
});

document.getElementById('settings-cancel').addEventListener('click', () => closeOverlay('settings-overlay'));
document.getElementById('settings-overlay').addEventListener('click', e => {
  if (e.target.id === 'settings-overlay') closeOverlay('settings-overlay');
});
document.getElementById('signout-btn').addEventListener('click', async () => {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('signout error:', error);
  }
  closeOverlay('settings-overlay');
  handleSignOut();
});

// ── GRANTS ──────────────────────────────────
async function loadGrants() {
  const data = await apiFetch('/api/grants');
  const list = document.getElementById('grant-list');
  list.innerHTML = '';
  (data?.grants || []).forEach(g => {
    const item = document.createElement('div');
    item.className = 'grant-item';
    item.innerHTML = `<span>${escHtml(g.grantee_email)}</span><button class="grant-remove" data-id="${g.id}">×</button>`;
    item.querySelector('.grant-remove').addEventListener('click', async () => {
      try {
        await apiFetch(`/api/grants?id=${encodeURIComponent(g.id)}`, { method: 'DELETE' });
        item.remove();
      } catch (error) {
        console.error('remove grant error:', error);
      }
    });
    list.appendChild(item);
  });
}

document.getElementById('grant-btn').addEventListener('click', async () => {
  const email = document.getElementById('grant-email').value.trim();
  const successEl = document.getElementById('grant-success');
  successEl.textContent = '';
  if (!email) return;

  try {
    await apiFetch('/api/grants', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    successEl.style.color = '#3a8a5c';
    successEl.textContent = `${email} can now view your thoughts`;
    document.getElementById('grant-email').value = '';
    await loadGrants();
  } catch (error) {
    successEl.style.color = '#c0513a';
    successEl.textContent = error.message;
  }
});

// ─────────────────────────────────────────────
//  ADD THOUGHT
// ─────────────────────────────────────────────
addBtn.addEventListener('click', () => { if (isOwner) openOverlay('thought-panel-overlay'); });
document.getElementById('cancel-btn').addEventListener('click', () => closeOverlay('thought-panel-overlay'));
document.getElementById('thought-panel-overlay').addEventListener('click', e => {
  if (e.target.id === 'thought-panel-overlay') closeOverlay('thought-panel-overlay');
});
document.getElementById('input-tag').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('save-btn').click();
});

document.getElementById('save-btn').addEventListener('click', async () => {
  if (!currentProfile) {
    console.error('save-btn: no currentProfile');
    return;
  }

  const text = document.getElementById('input-text').value.trim();
  const tag = document.getElementById('input-tag').value.trim() || 'thought';
  if (!text) {
    document.getElementById('input-text').focus();
    return;
  }

  try {
    const data = await apiFetch('/api/thoughts', {
      method: 'POST',
      body: JSON.stringify({ text, tag, date: new Date().toISOString(), ...randomPos() }),
    });

    thoughts.push(data.thought);
    tags.add(data.thought.tag);
    refreshFilterOptions();

    if (isTimeline) {
      renderTimeline();
    } else {
      const el = makeCloud(data.thought);
      el.style.opacity = '0';
      el.style.transform = 'scale(0.5)translateY(30px)';
      el.style.transition = 'opacity 0.5s,transform 0.5s';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = '';
      }));
    }

    closeOverlay('thought-panel-overlay');
    document.getElementById('input-text').value = '';
    document.getElementById('input-tag').value = '';
  } catch (error) {
    console.error('insert thought error:', error);
  }
});

// ─────────────────────────────────────────────
//  CLOUD FACTORY
// ─────────────────────────────────────────────
function makeCloud(t) {
  const el = document.createElement('div');
  el.className = `thought ${floatClasses[Math.floor(Math.random() * 3)]}`;
  el.dataset.id = t.id;
  el.style.left = `${t.x ?? randomPos().x}px`;
  el.style.top = `${t.y ?? randomPos().y}px`;
  el.innerHTML = `
    <div class="cloud-wrap">
      <div class="cloud-body">
        <div class="cloud-puff1"></div>
        <div class="thought-content">
          <p class="thought-text">${escHtml(t.text)}</p>
          <div class="thought-meta">
            <span class="thought-tag">#${escHtml(t.tag)}</span>
            <span class="thought-date">${formatDate(t.date)}</span>
          </div>
        </div>
      </div>
      <div class="cloud-tail"><span></span><span></span><span></span></div>
    </div>`;
  if (isOwner) {
    el.addEventListener('mousedown', startDrag);
    el.addEventListener('touchstart', startDrag, { passive: true });
  } else {
    el.style.cursor = 'default';
  }
  sky.appendChild(el);
  return el;
}

// ─────────────────────────────────────────────
//  DRAG
// ─────────────────────────────────────────────
function startDrag(e) {
  const el = e.currentTarget;
  el.classList.forEach(c => {
    if (c.startsWith('float-')) el.classList.remove(c);
  });
  el.style.zIndex = 50;
  const rect = el.getBoundingClientRect();
  dragOffX = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  dragOffY = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  dragging = el;
}

document.addEventListener('mousemove', e => {
  if (!dragging) return;
  e.preventDefault();
  dragging.style.left = `${e.clientX - dragOffX}px`;
  dragging.style.top = `${e.clientY - dragOffY}px`;
});

document.addEventListener('touchmove', e => {
  if (!dragging) return;
  e.preventDefault();
  dragging.style.left = `${e.touches[0].clientX - dragOffX}px`;
  dragging.style.top = `${e.touches[0].clientY - dragOffY}px`;
}, { passive: false });

document.addEventListener('mouseup', endDrag);
document.addEventListener('touchend', endDrag);

async function endDrag() {
  if (!dragging) return;
  const id = dragging.dataset.id;
  const x = parseInt(dragging.style.left, 10);
  const y = parseInt(dragging.style.top, 10);
  const t = thoughts.find(thought => thought.id === id);
  if (t) {
    t.x = x;
    t.y = y;
    try {
      await apiFetch(`/api/thoughts?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ x, y }),
      });
    } catch (error) {
      console.error('update thought position error:', error);
    }
  }
  dragging.classList.add(floatClasses[Math.floor(Math.random() * 3)]);
  dragging.style.zIndex = 10;
  dragging = null;
}

// ─────────────────────────────────────────────
//  FILTERS + TIMELINE
// ─────────────────────────────────────────────
const matches = t =>
  (!activeTag || t.tag.toLowerCase().includes(activeTag.toLowerCase())) &&
  (!activeMonth || monthKey(t.date) === activeMonth);

function applyFilters() {
  resetEmptyMessage();
  if (isTimeline) {
    renderTimeline();
    return;
  }

  let visible = 0;
  sky.querySelectorAll('.thought').forEach(el => {
    const t = thoughts.find(x => x.id === el.dataset.id);
    if (!t) return;
    if (matches(t)) {
      el.classList.remove('filtered-out');
      el.classList.add('filtered-in');
      visible += 1;
    } else {
      el.classList.add('filtered-out');
      el.classList.remove('filtered-in');
    }
  });
  emptyMsg.style.display = visible === 0 ? 'block' : 'none';
}

filterTagInput.addEventListener('input', () => {
  activeTag = filterTagInput.value.trim();
  applyFilters();
});
filterMonth.addEventListener('change', () => {
  activeMonth = filterMonth.value;
  applyFilters();
});

sortBtn.addEventListener('click', () => {
  isTimeline = !isTimeline;
  sortBtn.classList.toggle('active', isTimeline);
  sky.style.display = isTimeline ? 'none' : 'block';
  timelineView.classList.toggle('active', isTimeline);
  hint.style.display = isTimeline ? 'none' : '';
  if (isTimeline) renderTimeline();
  else applyFilters();
});

function renderTimeline() {
  resetEmptyMessage();
  timelineView.innerHTML = '';
  const filtered = thoughts.filter(matches).sort((a, b) => new Date(b.date) - new Date(a.date));
  emptyMsg.style.display = filtered.length ? 'none' : 'block';
  if (!filtered.length) return;

  const groups = {};
  filtered.forEach(t => {
    const key = monthKey(t.date);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  Object.keys(groups).sort().reverse().forEach(key => {
    const grp = document.createElement('div');
    grp.className = 'timeline-group';
    const lbl = document.createElement('div');
    lbl.className = 'timeline-month-label';
    lbl.textContent = monthLabel(key);
    grp.appendChild(lbl);
    const row = document.createElement('div');
    row.className = 'timeline-row';
    groups[key].forEach(t => {
      const el = document.createElement('div');
      el.className = 'timeline-cloud';
      el.innerHTML = `<div class="cloud-wrap"><div class="cloud-body"><div class="cloud-puff1"></div><div class="thought-content"><p class="thought-text">${escHtml(t.text)}</p><div class="thought-meta"><span class="thought-tag">#${escHtml(t.tag)}</span><span class="thought-date">${formatDate(t.date)}</span></div></div></div><div class="cloud-tail"><span></span><span></span><span></span></div></div>`;
      row.appendChild(el);
    });
    grp.appendChild(row);
    timelineView.appendChild(grp);
  });
}

function refreshFilterOptions() {
  [filterTagList, document.getElementById('tag-suggestions')].forEach(dl => {
    dl.innerHTML = '';
    tags.forEach(tag => {
      const o = document.createElement('option');
      o.value = tag;
      dl.appendChild(o);
    });
  });

  const months = [...new Set(thoughts.map(t => monthKey(t.date)))].sort().reverse();
  filterMonth.innerHTML = '<option value="">all time</option>';
  months.forEach(key => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = monthLabel(key);
    filterMonth.appendChild(o);
  });
}

init();
