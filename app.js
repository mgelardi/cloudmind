// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let currentUser = null;
let currentProfile = null;
let thoughts = [];
let tags = new Set();
let dragging = null;
let dragOffX = 0;
let dragOffY = 0;
let isTimeline = false;
let activeTag = '';
let activeStatus = '';
let activeDateRange = 'all';
let currentView = 'public';
let isOwner = false;

const PUBLIC_VIEW = 'public';
const MINE_VIEW = 'mine';
const DEFAULT_EMPTY_MESSAGE = 'no thoughts here yet ☁️';
const STATUS_OPTIONS = ['positive', 'neutral', 'negative'];
const floatClasses = ['float-1', 'float-2', 'float-3'];

// ─────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────
const sky = document.getElementById('sky');
const timelineView = document.getElementById('timeline-view');
const emptyMsg = document.getElementById('empty-msg');
const hint = document.getElementById('hint');
const addBtn = document.getElementById('add-btn');
const authBtn = document.getElementById('auth-btn');
const settingsBtn = document.getElementById('settings-btn');
const userNameEl = document.getElementById('user-name');
const loadingEl = document.getElementById('loading');
const filterTagInput = document.getElementById('filter-tag');
const filterTagList = document.getElementById('filter-tag-list');
const filterDate = document.getElementById('filter-date');
const filterStatus = document.getElementById('filter-status');
const filterScope = document.getElementById('filter-scope');
const filterScopeDivider = document.getElementById('filter-scope-divider');
const sortBtn = document.getElementById('sort-btn');
const thoughtOverlay = document.getElementById('thought-panel-overlay');
const thoughtErrorEl = document.getElementById('thought-error');

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────
const escHtml = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const formatDate = iso => new Date(iso).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const monthKey = iso => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = key => {
  const [year, month] = key.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
};

const randomPos = () => ({
  x: Math.max(24, 60 + Math.random() * Math.max(140, window.innerWidth - 400)),
  y: Math.max(24, 80 + Math.random() * Math.max(140, window.innerHeight - 260)),
});

const openOverlay = id => document.getElementById(id).classList.add('open');
const closeOverlay = id => document.getElementById(id).classList.remove('open');
const hideLoading = () => { loadingEl.style.display = 'none'; };

const showFatalError = message => {
  emptyMsg.textContent = message;
  emptyMsg.style.display = 'block';
  authBtn.style.display = 'none';
};

const normalizeStatus = status => STATUS_OPTIONS.includes(status) ? status : 'neutral';

const statusLabel = status => {
  const normalized = normalizeStatus(status);
  return normalized === 'positive' ? 'positive' : normalized === 'negative' ? 'negative' : 'neutral';
};

const isToday = iso => {
  const date = new Date(iso);
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
};

const getSelectedStatus = () => {
  const selected = document.querySelector('input[name="thought-status"]:checked');
  return normalizeStatus(selected?.value);
};

const resetThoughtComposer = () => {
  document.getElementById('input-text').value = '';
  document.getElementById('input-tag').value = '';
  const neutralOption = document.getElementById('status-neutral');
  if (neutralOption) neutralOption.checked = true;
  thoughtErrorEl.textContent = '';
};

const getEmptyMessage = () => {
  if (currentView === PUBLIC_VIEW) return 'no public thoughts match these filters yet ☁️';
  return DEFAULT_EMPTY_MESSAGE;
};

function resetEmptyMessage() {
  emptyMsg.textContent = getEmptyMessage();
}

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

function getPublicThoughtsPath() {
  const params = new URLSearchParams();
  if (activeTag) params.set('tag', activeTag);
  if (activeStatus) params.set('status', activeStatus);
  if (activeDateRange === 'today') params.set('date', 'today');
  params.set('limit', '18');
  return `/api/public-thoughts?${params.toString()}`;
}

function syncFilterUi() {
  filterTagInput.value = activeTag;
  filterStatus.value = activeStatus;
  filterDate.value = activeDateRange;
  filterScope.value = currentView;
}

function refreshHeaderState() {
  const signedIn = !!currentProfile;
  filterScope.style.display = signedIn ? '' : 'none';
  filterScopeDivider.style.display = signedIn ? '' : 'none';
  addBtn.classList.toggle('visible', signedIn && isOwner);
  hint.textContent = isOwner ? 'drag clouds · click + to add a thought' : 'browse the public sky · filter by hashtag, date, or mood';
}

async function setView(view, { reload = true, keepTimeline = false } = {}) {
  currentView = view === MINE_VIEW && currentProfile ? MINE_VIEW : PUBLIC_VIEW;
  isOwner = currentView === MINE_VIEW;
  if (!keepTimeline && currentView === PUBLIC_VIEW) isTimeline = false;
  sortBtn.classList.toggle('active', isTimeline);
  sky.style.display = isTimeline ? 'none' : 'block';
  timelineView.classList.toggle('active', isTimeline);
  refreshHeaderState();
  syncFilterUi();
  if (reload) await loadThoughts();
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
      await loadSignedOutLanding();
      hideLoading();
      return;
    }

    console.error('init session error:', error);
    showFatalError('App failed to load. Please try again later.');
    hideLoading();
  }
}

async function loadSignedOutLanding() {
  currentUser = null;
  currentProfile = null;
  authBtn.style.display = '';
  authBtn.textContent = 'sign in';
  settingsBtn.style.display = 'none';
  userNameEl.textContent = '';
  await setView(PUBLIC_VIEW, { reload: true });
}

// ─────────────────────────────────────────────
//  SIGN IN / OUT
// ─────────────────────────────────────────────
async function applySession(session) {
  currentUser = session.user;
  currentProfile = session.profile;
  userNameEl.textContent = currentProfile.username;
  authBtn.style.display = 'none';
  settingsBtn.style.display = '';
  closeOverlay('auth-overlay');
  await setView(MINE_VIEW, { reload: true });
  hideLoading();
}

async function handleSignOut() {
  currentUser = null;
  currentProfile = null;
  thoughts = [];
  tags = new Set();
  isTimeline = false;
  activeTag = '';
  activeStatus = '';
  activeDateRange = 'all';
  sky.innerHTML = '';
  timelineView.innerHTML = '';
  await loadSignedOutLanding();
  hideLoading();
}

// ─────────────────────────────────────────────
//  LOAD THOUGHTS
// ─────────────────────────────────────────────
async function loadThoughts() {
  sky.innerHTML = '';
  timelineView.innerHTML = '';
  thoughts = [];
  tags = new Set();
  resetEmptyMessage();

  const endpoint = currentView === MINE_VIEW ? '/api/thoughts' : getPublicThoughtsPath();
  const data = await apiFetch(endpoint);
  thoughts = (data?.thoughts || []).map(thought => ({
    ...thought,
    status: normalizeStatus(thought.status),
  }));

  thoughts.forEach(thought => {
    if (thought.tag) tags.add(thought.tag);
  });

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
document.getElementById('auth-overlay').addEventListener('click', event => {
  if (event.target.id === 'auth-overlay') closeOverlay('auth-overlay');
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
function updateGrantsSection(isPublic) {
  const grantsSection = document.getElementById('grants-section');
  grantsSection.style.opacity = isPublic ? '0.4' : '1';
  grantsSection.style.pointerEvents = isPublic ? 'none' : '';
}

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
    if (currentView === PUBLIC_VIEW) await loadThoughts();
  } catch (error) {
    errEl.textContent = error.message;
  }
});

document.getElementById('settings-cancel').addEventListener('click', () => closeOverlay('settings-overlay'));
document.getElementById('settings-overlay').addEventListener('click', event => {
  if (event.target.id === 'settings-overlay') closeOverlay('settings-overlay');
});
document.getElementById('signout-btn').addEventListener('click', async () => {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('signout error:', error);
  }
  closeOverlay('settings-overlay');
  await handleSignOut();
});

// ── GRANTS ──────────────────────────────────
async function loadGrants() {
  const data = await apiFetch('/api/grants');
  const list = document.getElementById('grant-list');
  list.innerHTML = '';

  (data?.grants || []).forEach(grant => {
    const item = document.createElement('div');
    item.className = 'grant-item';
    item.innerHTML = `<span>${escHtml(grant.grantee_email)}</span><button class="grant-remove" data-id="${grant.id}">×</button>`;
    item.querySelector('.grant-remove').addEventListener('click', async () => {
      try {
        await apiFetch(`/api/grants?id=${encodeURIComponent(grant.id)}`, { method: 'DELETE' });
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
addBtn.addEventListener('click', () => {
  if (!isOwner) return;
  resetThoughtComposer();
  openOverlay('thought-panel-overlay');
});

document.getElementById('cancel-btn').addEventListener('click', () => {
  resetThoughtComposer();
  closeOverlay('thought-panel-overlay');
});

thoughtOverlay.addEventListener('click', event => {
  if (event.target.id === 'thought-panel-overlay') {
    resetThoughtComposer();
    closeOverlay('thought-panel-overlay');
  }
});

document.getElementById('input-tag').addEventListener('keydown', event => {
  if (event.key === 'Enter') document.getElementById('save-btn').click();
});

document.getElementById('save-btn').addEventListener('click', async () => {
  if (!currentProfile || !isOwner) return;

  const text = document.getElementById('input-text').value.trim();
  const tag = document.getElementById('input-tag').value.trim() || 'thought';
  const status = getSelectedStatus();

  thoughtErrorEl.textContent = '';
  if (!text) {
    thoughtErrorEl.textContent = 'please write a thought before saving';
    document.getElementById('input-text').focus();
    return;
  }

  try {
    const data = await apiFetch('/api/thoughts', {
      method: 'POST',
      body: JSON.stringify({
        text,
        tag,
        status,
        date: new Date().toISOString(),
        ...randomPos(),
      }),
    });

    thoughts.push({
      ...data.thought,
      status: normalizeStatus(data.thought.status),
    });
    tags.add(data.thought.tag);
    refreshFilterOptions();

    if (isTimeline) {
      renderTimeline();
    } else {
      const element = makeCloud(data.thought);
      element.style.opacity = '0';
      element.style.transform = 'scale(0.5)translateY(30px)';
      element.style.transition = 'opacity 0.5s, transform 0.5s';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        element.style.opacity = '1';
        element.style.transform = '';
      }));
      applyFilters();
    }

    resetThoughtComposer();
    closeOverlay('thought-panel-overlay');
  } catch (error) {
    thoughtErrorEl.textContent = error.message;
  }
});

// ─────────────────────────────────────────────
//  CLOUD FACTORY
// ─────────────────────────────────────────────
function cloudMarkup(thought) {
  const status = normalizeStatus(thought.status);
  const username = thought.username ? `<span class="thought-user">@${escHtml(thought.username)}</span>` : '';

  return `
    <div class="cloud-wrap">
      <div class="cloud-body">
        <div class="cloud-puff1"></div>
        <div class="thought-content">
          <p class="thought-text">${escHtml(thought.text)}</p>
          <div class="thought-meta">
            <span class="thought-tag">#${escHtml(thought.tag || 'thought')}</span>
            <span class="thought-status thought-status-${status}">${statusLabel(status)}</span>
            ${username}
            <span class="thought-date">${formatDate(thought.date)}</span>
          </div>
        </div>
      </div>
      <div class="cloud-tail"><span></span><span></span><span></span></div>
    </div>`;
}

function makeCloud(thought) {
  const element = document.createElement('div');
  element.className = `thought ${floatClasses[Math.floor(Math.random() * floatClasses.length)]}`;
  element.dataset.id = thought.id;
  const position = isOwner
    ? { x: thought.x ?? randomPos().x, y: thought.y ?? randomPos().y }
    : randomPos();
  element.style.left = `${position.x}px`;
  element.style.top = `${position.y}px`;
  element.innerHTML = cloudMarkup(thought);

  if (isOwner) {
    element.addEventListener('mousedown', startDrag);
    element.addEventListener('touchstart', startDrag, { passive: true });
  } else {
    element.style.cursor = 'default';
  }

  sky.appendChild(element);
  return element;
}

// ─────────────────────────────────────────────
//  DRAG
// ─────────────────────────────────────────────
function startDrag(event) {
  if (!isOwner) return;

  const element = event.currentTarget;
  element.classList.forEach(className => {
    if (className.startsWith('float-')) element.classList.remove(className);
  });
  element.style.zIndex = 50;
  const rect = element.getBoundingClientRect();
  dragOffX = (event.touches ? event.touches[0].clientX : event.clientX) - rect.left;
  dragOffY = (event.touches ? event.touches[0].clientY : event.clientY) - rect.top;
  dragging = element;
}

document.addEventListener('mousemove', event => {
  if (!dragging) return;
  event.preventDefault();
  dragging.style.left = `${event.clientX - dragOffX}px`;
  dragging.style.top = `${event.clientY - dragOffY}px`;
});

document.addEventListener('touchmove', event => {
  if (!dragging) return;
  event.preventDefault();
  dragging.style.left = `${event.touches[0].clientX - dragOffX}px`;
  dragging.style.top = `${event.touches[0].clientY - dragOffY}px`;
}, { passive: false });

document.addEventListener('mouseup', endDrag);
document.addEventListener('touchend', endDrag);

async function endDrag() {
  if (!dragging) return;

  const id = dragging.dataset.id;
  const x = parseInt(dragging.style.left, 10);
  const y = parseInt(dragging.style.top, 10);
  const thought = thoughts.find(entry => entry.id === id);

  if (thought) {
    thought.x = x;
    thought.y = y;
    try {
      await apiFetch(`/api/thoughts?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ x, y }),
      });
    } catch (error) {
      console.error('update thought position error:', error);
    }
  }

  dragging.classList.add(floatClasses[Math.floor(Math.random() * floatClasses.length)]);
  dragging.style.zIndex = 10;
  dragging = null;
}

// ─────────────────────────────────────────────
//  FILTERS + TIMELINE
// ─────────────────────────────────────────────
const matches = thought =>
  (!activeTag || String(thought.tag || '').toLowerCase().includes(activeTag.toLowerCase())) &&
  (!activeStatus || normalizeStatus(thought.status) === activeStatus) &&
  (activeDateRange !== 'today' || isToday(thought.date));

function applyFilters() {
  resetEmptyMessage();

  if (isTimeline) {
    renderTimeline();
    return;
  }

  let visible = 0;
  sky.querySelectorAll('.thought').forEach(element => {
    const thought = thoughts.find(entry => entry.id === element.dataset.id);
    if (!thought) return;

    if (matches(thought)) {
      element.classList.remove('filtered-out');
      element.classList.add('filtered-in');
      visible += 1;
    } else {
      element.classList.add('filtered-out');
      element.classList.remove('filtered-in');
    }
  });

  emptyMsg.style.display = visible === 0 ? 'block' : 'none';
}

filterTagInput.addEventListener('input', async () => {
  activeTag = filterTagInput.value.trim();
  if (currentView === PUBLIC_VIEW) {
    await loadThoughts();
    return;
  }
  applyFilters();
});

filterStatus.addEventListener('change', async () => {
  activeStatus = filterStatus.value;
  if (currentView === PUBLIC_VIEW) {
    await loadThoughts();
    return;
  }
  applyFilters();
});

filterDate.addEventListener('change', async () => {
  activeDateRange = filterDate.value;
  if (currentView === PUBLIC_VIEW) {
    await loadThoughts();
    return;
  }
  applyFilters();
});

filterScope.addEventListener('change', async () => {
  await setView(filterScope.value, { reload: true });
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

  const filtered = thoughts
    .filter(matches)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  emptyMsg.style.display = filtered.length ? 'none' : 'block';
  if (!filtered.length) return;

  const groups = {};
  filtered.forEach(thought => {
    const key = monthKey(thought.date);
    if (!groups[key]) groups[key] = [];
    groups[key].push(thought);
  });

  Object.keys(groups).sort().reverse().forEach(key => {
    const group = document.createElement('div');
    group.className = 'timeline-group';

    const label = document.createElement('div');
    label.className = 'timeline-month-label';
    label.textContent = monthLabel(key);
    group.appendChild(label);

    const row = document.createElement('div');
    row.className = 'timeline-row';

    groups[key].forEach(thought => {
      const element = document.createElement('div');
      element.className = 'timeline-cloud';
      element.innerHTML = cloudMarkup(thought);
      row.appendChild(element);
    });

    group.appendChild(row);
    timelineView.appendChild(group);
  });
}

function refreshFilterOptions() {
  [filterTagList, document.getElementById('tag-suggestions')].forEach(list => {
    list.innerHTML = '';
    tags.forEach(tag => {
      const option = document.createElement('option');
      option.value = tag;
      list.appendChild(option);
    });
  });
}

init();
