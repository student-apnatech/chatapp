// ── CONFIG ──────────────────────────────────────────────────────────
const EMOJIS = {
  smileys:['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱'],
  hands:['👍','👎','👏','🙌','🤝','🤜','✊','👊','🤚','✋','🖐','👋','🤙','💪','🖖','☝️','👆','👇','👈','👉','🤞','🤟','🤘','💅','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔'],
  animals:['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🐔','🐧','🐦','🦆','🦅','🦉','🐺','🐗','🦋','🐌','🐞','🐜','🦟','🐢','🦎','🐊','🐍'],
  food:['🍎','🍊','🍋','🍇','🍓','🫐','🍑','🍒','🥭','🍍','🥝','🍅','🥥','🥑','🍕','🍔','🍟','🌭','🥪','🍜','🍝','🍛','🍣','🍱','🥟','🍤','🍦','🍰','🎂','🧁','🍩','🍪','☕','🍵','🧃','🥤','🍺','🍻'],
  travel:['🚗','🚕','🚙','🚌','🏎','🚓','🚑','🚒','🛻','🏍','🚲','✈️','🚀','🛸','🚁','⛵','🚢','🏖','🏝','⛰','🏔','🏕','🌅','🌄','🗺','🗽','🗼','🏰','🏯','🗾'],
  objects:['💡','🔦','📱','💻','⌨️','🖥','📷','📸','📹','📞','☎️','📺','📻','🔋','🔌','💰','💳','💎','🔧','🔨','🔩','🔑','🗝','🔒','🔓','📦','📬','📝','📚','📖','🎵','🎶','🎤','🎮','🎯']
};
const ECATS = [{k:'smileys',e:'😀'},{k:'hands',e:'👍'},{k:'animals',e:'🐶'},{k:'food',e:'🍎'},{k:'travel',e:'🚗'},{k:'objects',e:'💡'}];
const QUICK_REACTS = ['❤️','😂','😮','😢','😠','👍','🎉','🔥'];

// ── STATE ────────────────────────────────────────────────────────────
let token = localStorage.getItem('ca_token');
let me = JSON.parse(localStorage.getItem('ca_me') || 'null');
let socket = null;
let convs = [];
let activeId = null;
let replyTo = null;
let emojiOpen = false;
let attachOpen = false;
let curEcat = 'smileys';
let curTab = 'all';
let searchQ = '';
let typingTimer = null;
let isTyping = false;
let groupSel = [];
let allUsers = [];
let foundUserData = null;

// ── INIT ─────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  if (token && me) startApp(); else showPage('splashPage');
});

// ── AUTH PAGES ────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.auth-page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

async function login() {
  const phone = document.getElementById('loginPhone').value.trim();
  const pass = document.getElementById('loginPass').value;
  const err = document.getElementById('loginError');
  err.textContent = '';
  if (!phone || !pass) return (err.textContent = 'Please fill in all fields');
  setLoading('loginBtn', true);
  try {
    const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ phone, password: pass }) });
    const data = await res.json();
    if (!res.ok) return (err.textContent = data.error || 'Login failed');
    saveAuth(data);
  } catch (e) { err.textContent = 'Cannot connect. Is the server running?'; }
  finally { setLoading('loginBtn', false); }
}

async function register() {
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const pass = document.getElementById('regPass').value;
  const about = document.getElementById('regAbout').value.trim();
  const err = document.getElementById('regError');
  err.textContent = '';
  if (!name || !phone || !pass) return (err.textContent = 'Please fill in all required fields');
  if (pass.length < 6) return (err.textContent = 'Password must be at least 6 characters');
  setLoading('regBtn', true);
  try {
    const res = await fetch('/api/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, phone, password: pass, about }) });
    const data = await res.json();
    if (!res.ok) return (err.textContent = data.error || 'Registration failed');
    saveAuth(data);
  } catch (e) { err.textContent = 'Cannot connect. Is the server running?'; }
  finally { setLoading('regBtn', false); }
}

function setLoading(btnId, on) {
  const btn = document.getElementById(btnId);
  btn.disabled = on;
  btn.style.opacity = on ? '0.7' : '1';
}

function saveAuth({ token: t, user }) {
  token = t; me = user;
  localStorage.setItem('ca_token', t);
  localStorage.setItem('ca_me', JSON.stringify(user));
  document.getElementById('authScreen').style.display = 'none';
  startApp();
}

// ── START APP ─────────────────────────────────────────────────────────
async function startApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'flex';
  renderMyAvatar();
  await Promise.all([loadConvs(), loadAllUsers()]);
  initSocket();
}

function renderMyAvatar() {
  const el = document.getElementById('myAvatarEl');
  el.textContent = me.avatar;
  el.style.background = me.color;
}

async function loadConvs() {
  try {
    const res = await api('/api/conversations');
    convs = await res.json();
    renderChatList();
  } catch (e) { console.error('loadConvs', e); }
}

async function loadAllUsers() {
  try {
    const res = await api('/api/users');
    allUsers = await res.json();
  } catch (e) {}
}

// ── SOCKET ────────────────────────────────────────────────────────────
function initSocket() {
  socket = io();
  socket.on('connect', () => { socket.emit('auth', { token }); hideBanner(); });
  socket.on('disconnect', () => showBanner('Reconnecting...'));
  socket.on('connect_error', () => showBanner('Connection lost. Retrying...'));
  socket.on('auth:error', () => { toast('Session expired. Please login again.'); setTimeout(logout, 2000); });

  socket.on('message:new', ({ conversationId, message }) => {
    const c = convs.find(x => x.id === conversationId);
    if (!c) { loadConvs(); return; }
    if (!c._msgs) c._msgs = [];
    c._msgs.push(message);
    c.lastMessage = { text: message.text, time: message.time, from: message.from };
    if (conversationId !== activeId) c.unread = (c.unread || 0) + 1;
    renderChatList();
    if (conversationId === activeId) { renderMsgs(); socket.emit('message:seen', { conversationId }); }
  });

  socket.on('message:status', ({ conversationId, messageId, status }) => {
    const c = convs.find(x => x.id === conversationId);
    const msg = c?._msgs?.find(m => m.id === messageId);
    if (msg) { if (!msg.status) msg.status = {}; msg.status[me.id] = status; }
    if (conversationId === activeId) renderMsgs();
  });

  socket.on('message:deleted', ({ conversationId, messageId, deleteFor }) => {
    const c = convs.find(x => x.id === conversationId);
    const msg = c?._msgs?.find(m => m.id === messageId);
    if (msg) { if (deleteFor === 'everyone') { msg.deleted = true; msg.text = 'This message was deleted'; } else msg._deletedForMe = true; }
    if (conversationId === activeId) renderMsgs();
  });

  socket.on('message:reacted', ({ conversationId, messageId, reactions }) => {
    const c = convs.find(x => x.id === conversationId);
    const msg = c?._msgs?.find(m => m.id === messageId);
    if (msg) msg.reactions = reactions;
    if (conversationId === activeId) renderMsgs();
  });

  socket.on('typing:update', ({ conversationId, name, typing }) => {
    if (conversationId !== activeId) return;
    const row = document.getElementById('typingRow');
    if (typing) { document.getElementById('typingName').textContent = name ? `${name} is typing` : 'Typing'; row.style.display = 'flex'; }
    else row.style.display = 'none';
    document.getElementById('messagesEl').scrollTop = 99999;
  });

  socket.on('user:status', ({ userId, online, lastSeen }) => {
    const c = convs.find(x => x.type === 'direct' && x.memberId === userId);
    if (c) { c.online = online; c.lastSeen = lastSeen; }
    renderChatList();
    if (activeId) {
      const ac = convs.find(x => x.id === activeId);
      if (ac?.memberId === userId) updateChatHeader(ac);
    }
  });

  socket.on('conversation:new', (conv) => {
    if (!convs.find(c => c.id === conv.id)) convs.unshift(conv);
    renderChatList();
  });

  socket.on('conversation:cleared', ({ conversationId }) => {
    const c = convs.find(x => x.id === conversationId);
    if (c) { c._msgs = []; c.lastMessage = null; }
    if (conversationId === activeId) renderMsgs();
    renderChatList();
  });
}

function showBanner(msg) {
  let b = document.getElementById('connBanner');
  if (!b) { b = document.createElement('div'); b.id = 'connBanner'; b.className = 'conn-banner'; document.body.prepend(b); }
  b.textContent = msg; b.classList.add('show');
}
function hideBanner() { document.getElementById('connBanner')?.classList.remove('show'); }

// ── CHAT LIST ─────────────────────────────────────────────────────────
function renderChatList() {
  const el = document.getElementById('chatList');
  let list = [...convs];
  if (searchQ) list = list.filter(c => c.name?.toLowerCase().includes(searchQ.toLowerCase()));
  if (curTab === 'unread') list = list.filter(c => c.unread > 0);
  if (curTab === 'groups') list = list.filter(c => c.type === 'group');
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><div style="font-size:40px;">${searchQ ? '🔍' : '💬'}</div><p>${searchQ ? 'No results found' : 'No chats yet'}</p><small>${searchQ ? '' : 'Tap ➕ to add a contact'}</small></div>`;
    return;
  }
  el.innerHTML = list.map(c => {
    const last = c.lastMessage;
    const isMine = last?.from === me.id;
    const check = isMine ? `<span class="ci-check">✓✓</span>` : '';
    const prev = last ? esc(last.text.substring(0, 45)) : '<em>No messages</em>';
    return `<div class="chat-item${activeId === c.id ? ' active' : ''}" onclick="openConv('${c.id}')" oncontextmenu="chatCtx(event,'${c.id}')">
      <div class="ci-av" style="background:${c.color}">${c.avatar}${c.online ? '<div class="online-dot"></div>' : ''}</div>
      <div class="ci-info">
        <div class="ci-top"><span class="ci-name">${esc(c.name||'')}</span><span class="ci-time${c.unread?' green':''}">${last?fmtTime(last.time):''}</span></div>
        <div class="ci-bottom"><span class="ci-prev">${check} ${prev}</span>${c.unread?`<div class="ci-badge">${c.unread>99?'99+':c.unread}</div>`:''}</div>
      </div>
    </div>`;
  }).join('');
}

// ── OPEN CONVERSATION ─────────────────────────────────────────────────
async function openConv(id) {
  activeId = id;
  const c = convs.find(x => x.id === id);
  c.unread = 0;
  closeAll();
  document.getElementById('noChat').style.display = 'none';
  const cw = document.getElementById('chatWindow');
  cw.style.display = 'flex'; cw.style.flexDirection = 'column'; cw.style.flex = '1';
  updateChatHeader(c);
  renderChatList();
  if (!c._msgs) await fetchMsgs(id);
  renderMsgs();
  socket?.emit('message:seen', { conversationId: id });
  document.getElementById('msgInput').focus();
}

function updateChatHeader(c) {
  const av = document.getElementById('chatHdrAv');
  av.textContent = c.avatar; av.style.background = c.color;
  document.getElementById('chatHdrName').textContent = c.name || '';
  const st = document.getElementById('chatHdrStatus');
  if (c.type === 'group') { st.textContent = `${c.members?.length || ''} members`; st.className = 'ch-status'; }
  else if (c.online) { st.textContent = 'online'; st.className = 'ch-status online'; }
  else { st.textContent = c.lastSeen ? `last seen ${fmtTime(c.lastSeen)}` : ''; st.className = 'ch-status'; }
}

async function fetchMsgs(id) {
  try {
    const res = await api(`/api/conversations/${id}/messages`);
    const msgs = await res.json();
    const c = convs.find(x => x.id === id);
    if (c) c._msgs = msgs;
  } catch (e) { console.error('fetchMsgs', e); }
}

// ── RENDER MESSAGES ───────────────────────────────────────────────────
function renderMsgs() {
  const c = convs.find(x => x.id === activeId);
  const el = document.getElementById('messagesEl');
  if (!c?._msgs?.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--sub);font-size:14px;">No messages yet. Say hi! 👋</div>`;
    return;
  }
  let html = ''; let lastDate = '';
  c._msgs.forEach((m, i) => {
    if (m._deletedForMe) return;
    const mine = m.from === me.id;
    const d = fmtDate(m.time);
    if (d !== lastDate) { html += `<div class="date-div"><span>${d}</span></div>`; lastDate = d; }
    const isFirst = i === 0 || c._msgs[i-1].from !== m.from || c._msgs[i-1]._deletedForMe;
    const tail = isFirst ? (mine ? 'sent-tail' : 'recv-tail') : '';
    const tick = mine && !m.deleted ? getTickHtml(m, c) : '';
    const sndr = !mine && c.type === 'group' && m.senderName ? `<div class="sender-name" style="color:${m.senderColor||'#00a884'}">${esc(m.senderName)}</div>` : '';
    const rq = m.replyTo ? `<div class="reply-quote"><div class="rq-name">${esc(m.replyTo.senderName||'Unknown')}</div><div class="rq-text">${esc((m.replyTo.text||'').substring(0,80))}</div></div>` : '';
    const txt = m.deleted ? `<span class="msg-deleted">🚫 This message was deleted</span>` : `<span class="msg-text">${esc(m.text).replace(/\n/g,'<br>')}</span>`;
    const reacts = m.reactions?.length ? renderReacts(m) : '';
    html += `<div class="msg-row ${mine?'sent':'recv'}" id="m-${m.id}" oncontextmenu="msgCtx(event,'${m.id}')">
      <div class="bubble ${tail}">${sndr}${rq}${txt}${reacts}
        <div class="msg-meta"><span class="msg-time">${fmtClock(m.time)}</span>${tick}</div>
      </div>
    </div>`;
  });
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function getTickHtml(msg, conv) {
  if (!msg.status) return `<span class="tick">✓</span>`;
  const others = conv.type === 'group'
    ? (conv.members||[]).filter(m => (m.id||m) !== me.id).map(m => m.id||m)
    : [conv.memberId];
  if (others.every(uid => msg.status[uid] === 'seen')) return `<span class="tick seen">✓✓</span>`;
  if (others.every(uid => ['delivered','seen'].includes(msg.status[uid]))) return `<span class="tick">✓✓</span>`;
  return `<span class="tick">✓</span>`;
}

function renderReacts(msg) {
  const g = {};
  (msg.reactions||[]).forEach(r => { const [uid,e] = r.split(':'); if(!g[e])g[e]=[]; g[e].push(uid); });
  return `<div class="msg-reactions">${Object.entries(g).map(([e,u]) => `<span class="react-badge" onclick="reactMsg('${msg.id}','${e}')" title="${u.length}">${e}${u.length>1?' '+u.length:''}</span>`).join('')}</div>`;
}

// ── SEND MESSAGE ──────────────────────────────────────────────────────
function sendMsg() {
  const inp = document.getElementById('msgInput');
  const text = inp.value.trim();
  if (!text || !activeId) return;
  socket?.emit('message:send', {
    conversationId: activeId, text,
    replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, senderName: replyTo.senderName } : null
  });
  inp.value = ''; inp.style.height = '';
  cancelReply(); updateSendBtn(); stopTyping();
}

function onInput(el) {
  el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  updateSendBtn();
  if (!isTyping && activeId) { isTyping = true; socket?.emit('typing:start', { conversationId: activeId }); }
  clearTimeout(typingTimer); typingTimer = setTimeout(stopTyping, 2000);
}

function stopTyping() {
  if (isTyping && activeId) { isTyping = false; socket?.emit('typing:stop', { conversationId: activeId }); }
}

function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }
function updateSendBtn() {
  const v = document.getElementById('msgInput').value.trim();
  document.getElementById('sendBtn').style.display = v ? 'flex' : 'none';
  document.getElementById('micBtn').style.display = v ? 'none' : 'flex';
}

// ── REPLY ─────────────────────────────────────────────────────────────
function setReply(msgId) {
  const c = convs.find(x => x.id === activeId);
  const msg = c?._msgs?.find(m => m.id === msgId);
  if (!msg) return;
  replyTo = msg;
  document.getElementById('replyBar').style.display = 'flex';
  document.getElementById('rbName').textContent = msg.from === me.id ? 'You' : (msg.senderName || c.name);
  document.getElementById('rbText').textContent = (msg.text||'').substring(0, 80);
  document.getElementById('msgInput').focus();
}
function cancelReply() { replyTo = null; document.getElementById('replyBar').style.display = 'none'; }

// ── REACTIONS ─────────────────────────────────────────────────────────
function reactMsg(msgId, emoji) { socket?.emit('message:react', { conversationId: activeId, messageId: msgId, emoji }); }

function showReactPicker(msgId) {
  document.getElementById('reactPickerEl')?.remove();
  const pk = document.createElement('div');
  pk.id = 'reactPickerEl'; pk.className = 'react-picker';
  pk.innerHTML = QUICK_REACTS.map(e => `<span class="rp-em" onclick="reactMsg('${msgId}','${e}');this.closest('.react-picker').remove()">${e}</span>`).join('');
  const row = document.getElementById(`m-${msgId}`);
  const rect = row?.getBoundingClientRect();
  pk.style.top = (rect ? rect.top - 56 : 200) + 'px';
  pk.style.left = Math.max(10, rect ? rect.left : 100) + 'px';
  document.body.appendChild(pk);
  setTimeout(() => document.addEventListener('click', () => pk.remove(), { once: true }), 50);
}

// ── EMOJI ─────────────────────────────────────────────────────────────
function buildEmojiPicker() {
  const el = document.getElementById('emojiPicker');
  const cats = ECATS.map(c => `<button class="ep-cat${c.k===curEcat?' active':''}" onclick="setEcat('${c.k}')">${c.e}</button>`).join('');
  el.innerHTML = `<input class="ep-search" placeholder="Search emoji..." oninput="filterEmoji(this.value)"><div class="ep-cats">${cats}</div><div class="ep-grid" id="epGrid">${buildEmojiGrid(EMOJIS[curEcat])}</div>`;
}
function buildEmojiGrid(list) { return list.map(e => `<div class="ep-cell" onclick="insertEmoji('${e}')">${e}</div>`).join(''); }
function setEcat(k) { curEcat = k; buildEmojiPicker(); }
function filterEmoji(v) { const all = Object.values(EMOJIS).flat(); document.getElementById('epGrid').innerHTML = buildEmojiGrid(v ? all : EMOJIS[curEcat]); }
function insertEmoji(e) { const i = document.getElementById('msgInput'); i.value += e; i.focus(); updateSendBtn(); }
function toggleEmoji() {
  emojiOpen = !emojiOpen;
  document.getElementById('emojiPicker').style.display = emojiOpen ? 'block' : 'none';
  attachOpen = false; document.getElementById('attachMenu').style.display = 'none';
  if (emojiOpen) buildEmojiPicker();
}

// ── ATTACH ────────────────────────────────────────────────────────────
const ATTACH_OPTS = [
  {e:'📄',l:'Document',c:'#bf59cf'},{e:'📷',l:'Camera',c:'#02b1ed'},
  {e:'🖼️',l:'Photos',c:'#e84393'},{e:'🎵',l:'Audio',c:'#0da974'},
  {e:'📍',l:'Location',c:'#007bfc'},{e:'👤',l:'Contact',c:'#ff7143'},
];
function toggleAttach() {
  attachOpen = !attachOpen;
  const m = document.getElementById('attachMenu');
  m.style.display = attachOpen ? 'flex' : 'none';
  if (attachOpen) m.innerHTML = ATTACH_OPTS.map(o => `<div class="am-opt"><div class="am-icon" style="background:${o.c}" onclick="toast('${o.l} coming soon')">${o.e}</div><div class="am-label">${o.l}</div></div>`).join('');
  emojiOpen = false; document.getElementById('emojiPicker').style.display = 'none';
}

// ── ADD CONTACT ───────────────────────────────────────────────────────
function openAddContact() {
  document.getElementById('findPhone').value = '';
  document.getElementById('findError').textContent = '';
  document.getElementById('foundUser').style.display = 'none';
  foundUserData = null;
  renderAllUsersList();
  document.getElementById('addContactModal').style.display = 'flex';
}

function renderAllUsersList() {
  const el = document.getElementById('allUsersList');
  if (!allUsers.length) { el.innerHTML = `<p style="color:var(--sub);font-size:13px;text-align:center;padding:10px;">No other users yet</p>`; return; }
  el.innerHTML = allUsers.map(u => `<div class="ul-item" onclick="startDirectChat('${u.id}')">
    <div class="ul-av" style="background:${u.color}">${u.avatar}${u.online?'<div class="online-dot"></div>':''}</div>
    <div class="ul-info"><div class="uname">${esc(u.name)}</div><div class="uphone">${esc(u.phone)}</div><div class="uabout">${esc(u.about||'')}</div></div>
  </div>`).join('');
}

async function findUser() {
  const phone = document.getElementById('findPhone').value.trim();
  const err = document.getElementById('findError');
  err.textContent = '';
  if (!phone) return (err.textContent = 'Please enter a phone number');
  try {
    const res = await api(`/api/users/find?phone=${encodeURIComponent(phone)}`);
    const data = await res.json();
    if (!res.ok) return (err.textContent = data.error || 'User not found');
    foundUserData = data;
    const fu = document.getElementById('foundUser');
    document.getElementById('fuAv').textContent = data.avatar;
    document.getElementById('fuAv').style.background = data.color;
    document.getElementById('fuName').textContent = data.name;
    document.getElementById('fuPhone').textContent = data.phone;
    document.getElementById('fuAbout').textContent = data.about || '';
    fu.style.display = 'flex';
  } catch (e) { err.textContent = 'Error searching. Try again.'; }
}

async function startChatWithFound() {
  if (!foundUserData) return;
  await startDirectChat(foundUserData.id);
}

async function startDirectChat(userId) {
  try {
    const res = await api('/api/conversations/direct', 'POST', { targetUserId: userId });
    const { conversationId } = await res.json();
    closeModal('addContactModal');
    await loadConvs();
    openConv(conversationId);
  } catch (e) { toast('Error starting chat'); }
}

// ── NEW GROUP ─────────────────────────────────────────────────────────
function openNewGroup() {
  groupSel = [];
  document.getElementById('groupName').value = '';
  document.getElementById('groupError').textContent = '';
  document.getElementById('selectedChips').innerHTML = '';
  document.getElementById('groupUserList').innerHTML = buildGroupUserList();
  document.getElementById('newGroupModal').style.display = 'flex';
}

function buildGroupUserList() {
  return allUsers.map(u => {
    const sel = groupSel.includes(u.id);
    return `<div class="ul-item" onclick="toggleGroupSel('${u.id}','${esc(u.name)}','${u.avatar}','${u.color}')">
      <div class="ul-av" style="background:${u.color}">${u.avatar}</div>
      <div class="ul-info"><div class="uname">${esc(u.name)}</div><div class="uphone">${esc(u.phone)}</div></div>
      ${sel ? '<div class="ul-check">✓</div>' : ''}
    </div>`;
  }).join('');
}

function toggleGroupSel(id, name, avatar, color) {
  const idx = groupSel.indexOf(id);
  if (idx >= 0) groupSel.splice(idx, 1); else groupSel.push(id);
  document.getElementById('selectedChips').innerHTML = groupSel.map(uid => {
    const u = allUsers.find(x => x.id === uid);
    return `<div class="chip" style="background:${u?.color}20;border:1px solid ${u?.color}40;"><span>${u?.avatar||'?'}</span><span>${esc(u?.name||'')}</span><button onclick="toggleGroupSel('${uid}')">✕</button></div>`;
  }).join('');
  document.getElementById('groupUserList').innerHTML = buildGroupUserList();
}

async function createGroup() {
  const name = document.getElementById('groupName').value.trim();
  const err = document.getElementById('groupError');
  if (!name) return (err.textContent = 'Please enter a group name');
  if (groupSel.length < 1) return (err.textContent = 'Select at least 1 member');
  try {
    const res = await api('/api/conversations/group', 'POST', { name, memberIds: groupSel });
    const { conversationId } = await res.json();
    closeModal('newGroupModal');
    await loadConvs();
    openConv(conversationId);
    toast('Group created! 🎉');
  } catch (e) { err.textContent = 'Error creating group'; }
}

// ── CONTEXT MENUS ─────────────────────────────────────────────────────
function msgCtx(e, msgId) {
  e.preventDefault();
  const c = convs.find(x => x.id === activeId);
  const msg = c?._msgs?.find(m => m.id === msgId);
  if (!msg) return;
  const mine = msg.from === me.id;
  showCtx(e, [
    { l: '↩ Reply', fn: () => setReply(msgId) },
    { l: '😊 React', fn: () => showReactPicker(msgId) },
    { l: '📋 Copy', fn: () => { navigator.clipboard.writeText(msg.text||''); toast('Copied!'); } },
    { l: '↪ Forward', fn: () => toast('Forward coming soon') },
    { l: '⭐ Star', fn: () => toast('Starred ⭐') },
    ...(mine && !msg.deleted ? [
      { l: '🗑 Delete for me', fn: () => socket?.emit('message:delete', { conversationId: activeId, messageId: msgId, deleteFor: 'me' }) },
      { l: '🗑 Delete for everyone', fn: () => socket?.emit('message:delete', { conversationId: activeId, messageId: msgId, deleteFor: 'everyone' }), d: true },
    ] : [])
  ]);
}

function chatCtx(e, convId) {
  e.preventDefault();
  const c = convs.find(x => x.id === convId);
  showCtx(e, [
    { l: c.muted ? '🔔 Unmute' : '🔕 Mute', fn: () => toggleMute(convId) },
    { l: c.pinned ? '📌 Unpin' : '📌 Pin', fn: () => togglePin(convId) },
    { l: '✉ Mark unread', fn: () => { c.unread = 5; renderChatList(); } },
    { l: '🗑 Clear chat', fn: () => clearChat(convId), d: true },
  ]);
}

function showCtx(e, items) {
  const m = document.getElementById('ctxMenu');
  m.style.cssText = `display:block;left:${Math.min(e.clientX, window.innerWidth-200)}px;top:${Math.min(e.clientY, window.innerHeight-items.length*44)}px;`;
  m.innerHTML = items.map(it => `<div class="ctx-item${it.d?' danger':''}" onclick="(${it.fn.toString()})();closeCtx()">${it.l}</div>`).join('');
}
function closeCtx() { document.getElementById('ctxMenu').style.display = 'none'; }

async function toggleMute(id) {
  const c = convs.find(x => x.id === id);
  c.muted = !c.muted;
  await api(`/api/conversations/${id}/settings`, 'PUT', { muted: c.muted });
  toast(c.muted ? '🔕 Muted' : '🔔 Unmuted');
  renderChatList();
}
async function togglePin(id) {
  const c = convs.find(x => x.id === id);
  c.pinned = !c.pinned;
  await api(`/api/conversations/${id}/settings`, 'PUT', { pinned: c.pinned });
  toast(c.pinned ? '📌 Pinned' : 'Unpinned');
  renderChatList();
}
async function clearChat(id) {
  await api(`/api/conversations/${id}/messages`, 'DELETE');
  const c = convs.find(x => x.id === id);
  if (c) c._msgs = [];
  if (activeId === id) renderMsgs();
  renderChatList();
  toast('Chat cleared');
}

// ── SIDE MENU ─────────────────────────────────────────────────────────
function showSideMenu(e) {
  showCtx(e, [
    { l: '👤 My Profile', fn: () => openMyProfile() },
    { l: '➕ Add Contact', fn: () => openAddContact() },
    { l: '👥 New Group', fn: () => openNewGroup() },
    { l: '⭐ Starred', fn: () => toast('No starred messages') },
    { l: '🔒 Logout', fn: () => logout(), d: true },
  ]);
}

function showChatMenu(e) {
  const c = convs.find(x => x.id === activeId);
  if (!c) return;
  showCtx(e, [
    { l: 'ℹ️ Info', fn: () => openContactInfo() },
    { l: c.muted ? '🔔 Unmute' : '🔕 Mute', fn: () => toggleMute(activeId) },
    { l: '🗑 Clear messages', fn: () => clearChat(activeId), d: true },
  ]);
}

// ── CONTACT INFO PANEL ────────────────────────────────────────────────
function openContactInfo() {
  const c = convs.find(x => x.id === activeId);
  if (!c) return;
  document.getElementById('panelTitle').textContent = c.type === 'group' ? 'Group Info' : 'Contact Info';
  const pb = document.getElementById('panelBody');
  const membersHtml = c.type === 'group' ? `
    <div class="pp-section"><div class="pp-label">Members (${c.members?.length||0})</div>
    <div class="pp-members">${(c.members||[]).map(m=>`<div class="pp-member"><div class="pm-av" style="background:${m.color}">${m.avatar}</div><div><div class="pm-name">${esc(m.name||'')}</div>${m.id===c.admin?'<div class="pm-role">Admin</div>':''}</div></div>`).join('')}</div></div>` : '';
  pb.innerHTML = `
    <div class="pp-av" style="background:${c.color}">${c.avatar}</div>
    <div class="pp-name">${esc(c.name||'')}</div>
    <div class="pp-phone">${esc(c.phone||'')}</div>
    <div class="pp-status-badge">${c.online?'<span class="pp-online">🟢 Online</span>':(c.lastSeen?`Last seen ${fmtTime(c.lastSeen)}`:'Offline')}</div>
    ${c.type!=='group'?`<div class="pp-section"><div class="pp-label">About</div><div class="pp-val">${esc(c.about||'Hey there!')}</div></div>`:''}
    ${membersHtml}
    <div class="pp-section"><div class="pp-label">Media</div><div class="pp-media">${['🖼️','📄','🎵','📷','🎬','🖼️'].map(e=>`<div class="pp-media-cell" onclick="toast('Opening...')">${e}</div>`).join('')}</div></div>
    <button class="pp-action" onclick="toggleMute('${c.id}');closePanel()">${c.muted?'🔔 Unmute':'🔕 Mute'}</button>
    <button class="pp-action danger" onclick="clearChat('${c.id}');closePanel()">🗑 Clear Chat</button>
    <button class="pp-action danger" onclick="toast('Blocked');closePanel()">🚫 Block</button>
  `;
  document.getElementById('contactPanel').style.display = 'flex';
}
function closePanel() { document.getElementById('contactPanel').style.display = 'none'; }

// ── MY PROFILE ────────────────────────────────────────────────────────
function openMyProfile() {
  const el = document.getElementById('myProfileBody');
  el.innerHTML = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:90px;height:90px;border-radius:50%;background:${me.color};display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#111b21;margin:0 auto 12px;">${me.avatar}</div>
    </div>
    <div class="edit-group"><label>👤 Name</label><input id="epName" value="${esc(me.name)}"></div>
    <div class="edit-group"><label>📱 Phone</label><input value="${esc(me.phone)}" disabled style="opacity:.6;cursor:not-allowed;"></div>
    <div class="edit-group"><label>💬 About</label><input id="epAbout" value="${esc(me.about||'')}"></div>
    <button class="btn-primary full" onclick="saveProfile()">💾 Save Changes</button>
    <button class="btn-primary full" style="background:var(--danger);margin-top:10px;" onclick="logout()">🚪 Logout</button>
  `;
  document.getElementById('myProfileModal').style.display = 'flex';
}

async function saveProfile() {
  const name = document.getElementById('epName').value.trim();
  const about = document.getElementById('epAbout').value.trim();
  try {
    const res = await api('/api/me', 'PUT', { name, about });
    const updated = await res.json();
    me = { ...me, ...updated };
    localStorage.setItem('ca_me', JSON.stringify(me));
    renderMyAvatar();
    closeModal('myProfileModal');
    toast('Profile updated ✅');
  } catch (e) { toast('Error saving'); }
}

// ── SEARCH & TABS ─────────────────────────────────────────────────────
function filterChats(q) { searchQ = q; document.getElementById('searchClear').style.display = q ? 'block' : 'none'; renderChatList(); }
function clearSearch() { document.getElementById('searchInput').value = ''; searchQ = ''; document.getElementById('searchClear').style.display = 'none'; renderChatList(); }
function setTab(el, tab) { document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active')); el.classList.add('active'); curTab = tab; renderChatList(); }

// ── MODALS ────────────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// ── LOGOUT ────────────────────────────────────────────────────────────
function logout() { localStorage.removeItem('ca_token'); localStorage.removeItem('ca_me'); socket?.disconnect(); location.reload(); }

// ── HELPERS ───────────────────────────────────────────────────────────
function closeAll() {
  emojiOpen = false; attachOpen = false;
  document.getElementById('emojiPicker').style.display = 'none';
  document.getElementById('attachMenu').style.display = 'none';
  closeCtx();
  document.getElementById('reactPickerEl')?.remove();
}

function toast(msg) {
  const el = document.getElementById('toastEl');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) return fmtClock(ts);
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtClock(ts) {
  const d = new Date(ts); let h = d.getHours(), m = d.getMinutes(), a = 'AM';
  if (h >= 12) { a = 'PM'; if (h > 12) h -= 12; } if (h === 0) h = 12;
  return `${h}:${m<10?'0'+m:m} ${a}`;
}
function fmtDate(ts) {
  const d = new Date(ts), now = new Date(), diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
  return res;
}

// ── CLICK OUTSIDE ─────────────────────────────────────────────────────
document.addEventListener('click', e => {
  if (!e.target.closest('#emojiPicker') && !e.target.closest('.ibtn') && emojiOpen) { emojiOpen = false; document.getElementById('emojiPicker').style.display = 'none'; }
  if (!e.target.closest('#attachMenu') && !e.target.closest('.ibtn') && attachOpen) { attachOpen = false; document.getElementById('attachMenu').style.display = 'none'; }
  if (!e.target.closest('.ctx-menu') && !e.target.closest('.chat-item') && !e.target.closest('.msg-row') && !e.target.closest('.icon-btn')) closeCtx();
  if (e.target.classList.contains('modal-overlay')) e.target.style.display = 'none';
});

// Enter key on auth inputs
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.getElementById('loginPage').classList.contains('active')) login();
    else if (document.getElementById('registerPage').classList.contains('active')) register();
  }
});
