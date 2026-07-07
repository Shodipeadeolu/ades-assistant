const STORAGE_PASSWORD = 'ade-assistant:password';
const STORAGE_HISTORY = 'ade-assistant:history';

const gate = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const gatePasswordInput = document.getElementById('gate-password');
const gateError = document.getElementById('gate-error');

const appEl = document.getElementById('app');
const chatEl = document.getElementById('chat');
const emptyState = document.getElementById('empty-state');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');
const newChatBtn = document.getElementById('new-chat');

let messages = loadHistory();
let sending = false;

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem(STORAGE_HISTORY, JSON.stringify(messages));
}

function getPassword() {
  return localStorage.getItem(STORAGE_PASSWORD);
}

function renderMessages() {
  chatEl.innerHTML = '';
  if (messages.length === 0) {
    chatEl.appendChild(emptyState);
    return;
  }
  for (const m of messages) {
    chatEl.appendChild(buildBubble(m.role, m.content));
  }
  scrollToBottom();
}

function buildBubble(role, content) {
  const div = document.createElement('div');
  div.className = `bubble ${role}`;
  if (role === 'assistant' && window.marked) {
    div.innerHTML = window.marked.parse(content);
  } else {
    div.textContent = content;
  }
  return div;
}

function scrollToBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'typing-dots';
  div.id = 'typing-indicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  chatEl.appendChild(div);
  scrollToBottom();
}

function hideTyping() {
  document.getElementById('typing-indicator')?.remove();
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || sending) return;

  messages.push({ role: 'user', content: text });
  saveHistory();
  renderMessages();
  inputEl.value = '';
  autoGrow();
  sending = true;
  sendBtn.disabled = true;
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getPassword()}`,
      },
      body: JSON.stringify({ messages: messages.filter((m) => m.role === 'user' || m.role === 'assistant') }),
    });

    const data = await res.json();
    hideTyping();

    if (res.status === 401) {
      localStorage.removeItem(STORAGE_PASSWORD);
      showGate('Session expired. Enter the password again.');
      return;
    }

    if (!res.ok) {
      messages.push({ role: 'error', content: data.error || 'Something went wrong.' });
    } else {
      messages.push({ role: 'assistant', content: data.reply });
    }
    saveHistory();
    renderMessages();
  } catch (err) {
    hideTyping();
    messages.push({ role: 'error', content: 'Could not reach the server.' });
    saveHistory();
    renderMessages();
  } finally {
    sending = false;
    sendBtn.disabled = !inputEl.value.trim();
  }
}

function autoGrow() {
  inputEl.style.height = 'auto';
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 140)}px`;
}

inputEl.addEventListener('input', () => {
  autoGrow();
  sendBtn.disabled = !inputEl.value.trim();
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

newChatBtn.addEventListener('click', () => {
  messages = [];
  saveHistory();
  renderMessages();
});

function showGate(errorMessage) {
  gate.hidden = false;
  appEl.hidden = true;
  if (errorMessage) {
    gateError.textContent = errorMessage;
    gateError.hidden = false;
  } else {
    gateError.hidden = true;
  }
  gatePasswordInput.value = '';
  gatePasswordInput.focus();
}

function showApp() {
  gate.hidden = true;
  appEl.hidden = false;
  renderMessages();
  inputEl.focus();
}

gateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = gatePasswordInput.value;
  if (!password) return;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { Authorization: `Bearer ${password}` },
    });

    if (res.status === 401) {
      gateError.textContent = 'Wrong password.';
      gateError.hidden = false;
      return;
    }
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      gateError.textContent = data.error || 'Too many attempts. Try again later.';
      gateError.hidden = false;
      return;
    }
    if (!res.ok) {
      gateError.textContent = 'Could not reach the server.';
      gateError.hidden = false;
      return;
    }

    localStorage.setItem(STORAGE_PASSWORD, password);
    showApp();
  } catch (err) {
    gateError.textContent = 'Could not reach the server.';
    gateError.hidden = false;
  }
});

if (getPassword()) {
  showApp();
} else {
  showGate();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
