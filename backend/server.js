const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID: uuidv4 } = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

const JWT_SECRET = 'chatapp_secret_xK9mP_2024';
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// ─── PERSISTENT DATA ──────────────────────────────────────────────────
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return { users: data.users || [], conversations: data.conversations || [] };
    }
  } catch (e) { console.error('Load error:', e.message); }
  return { users: [], conversations: [] };
}

function saveData() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify({ users, conversations }, null, 2)); }
  catch (e) { console.error('Save error:', e.message); }
}

let { users, conversations } = loadData();
console.log(`📦 Loaded ${users.length} users, ${conversations.length} conversations`);

const socketUserMap = {};
const userSocketMap = {};

const COLORS = ['#d9775e','#c97b55','#7fb77e','#62a3bb','#9b8ec4','#bf6f6f','#4fa8a8','#c4936b','#5b8dd9','#d4a843','#6db56d','#c4607a'];
const getInitials = name => name.trim().split(/\s+/).map(w=>w[0]).join('').substring(0,2).toUpperCase();
const randomColor = () => COLORS[Math.floor(Math.random()*COLORS.length)];
const normalizePhone = p => p.replace(/[\s\-\.\(\)]/g,'');

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

function convForUser(userId) {
  return conversations
    .filter(c => c.members.includes(userId))
    .map(c => {
      const last = c.messages[c.messages.length - 1];
      const unread = c.messages.filter(m => m.from !== userId && m.status[userId] !== 'seen').length;
      let name, avatar, color, online=false, lastSeen=null, phone='', about='', memberId=null;
      if (c.type === 'direct') {
        const oid = c.members.find(m => m !== userId);
        const o = users.find(u => u.id === oid);
        name=o?.name||'Unknown'; avatar=o?.avatar||'?'; color=o?.color||'#888';
        online=o?.online||false; lastSeen=o?.lastSeen||null; phone=o?.phone||''; about=o?.about||''; memberId=oid;
      } else { name=c.name; avatar=c.avatar; color=c.color; }
      return {
        id:c.id, type:c.type, name, avatar, color, memberId, phone, about, online, lastSeen,
        members: c.type==='group' ? c.members.map(mid=>{const u=users.find(x=>x.id===mid);return u?{id:u.id,name:u.name,avatar:u.avatar,color:u.color}:null;}).filter(Boolean) : [],
        admin: c.admin||null,
        lastMessage: last ? {text:last.deleted?'This message was deleted':last.text, time:last.time, from:last.from} : null,
        unread, muted:c.muted?.[userId]||false, pinned:c.pinned?.[userId]||false,
      };
    })
    .sort((a,b) => {
      if(a.pinned&&!b.pinned) return -1; if(!a.pinned&&b.pinned) return 1;
      return (b.lastMessage?.time||0)-(a.lastMessage?.time||0);
    });
}

function getMsgs(convId, userId) {
  const c = conversations.find(x=>x.id===convId);
  if(!c) return [];
  return c.messages.filter(m=>!m.deletedFor?.includes(userId)).map(m=>{
    const s=users.find(u=>u.id===m.from);
    return {...m, text:m.deleted?'This message was deleted':m.text, senderName:s?.name||'Unknown', senderAvatar:s?.avatar||'?', senderColor:s?.color||'#888'};
  });
}

// ─── AUTH ─────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { name, phone, password, about } = req.body;
  if (!name?.trim()||!phone?.trim()||!password) return res.status(400).json({ error:'Name, phone and password are required' });
  if (password.length<6) return res.status(400).json({ error:'Password must be at least 6 characters' });
  if (name.trim().length<2) return res.status(400).json({ error:'Name must be at least 2 characters' });
  const norm = normalizePhone(phone);
  if (users.find(u=>normalizePhone(u.phone)===norm)) return res.status(409).json({ error:'This phone number is already registered' });
  const user = {
    id:uuidv4(), name:name.trim(), phone:phone.trim(),
    password:bcrypt.hashSync(password,10),
    avatar:getInitials(name.trim()), color:randomColor(),
    about:about?.trim()||'Hey there! I am using ChatApp',
    online:false, lastSeen:null, createdAt:Date.now()
  };
  users.push(user); saveData();
  console.log(`✅ Registered: ${user.name} (${user.phone})`);
  const token = jwt.sign({id:user.id,name:user.name}, JWT_SECRET, {expiresIn:'30d'});
  res.json({ token, user:{id:user.id,name:user.name,phone:user.phone,avatar:user.avatar,color:user.color,about:user.about} });
});

app.post('/api/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone||!password) return res.status(400).json({ error:'Phone and password required' });
  const norm = normalizePhone(phone);
  const user = users.find(u=>normalizePhone(u.phone)===norm);
  if (!user||!bcrypt.compareSync(password,user.password)) return res.status(401).json({ error:'Invalid phone number or password' });
  console.log(`✅ Login: ${user.name} (${user.phone})`);
  const token = jwt.sign({id:user.id,name:user.name}, JWT_SECRET, {expiresIn:'30d'});
  res.json({ token, user:{id:user.id,name:user.name,phone:user.phone,avatar:user.avatar,color:user.color,about:user.about} });
});

app.get('/api/me', authenticate, (req,res) => {
  const u=users.find(u=>u.id===req.user.id);
  if(!u) return res.status(404).json({error:'Not found'});
  res.json({id:u.id,name:u.name,phone:u.phone,avatar:u.avatar,color:u.color,about:u.about});
});

app.put('/api/me', authenticate, (req,res) => {
  const u=users.find(u=>u.id===req.user.id);
  if(!u) return res.status(404).json({error:'Not found'});
  const {name,about}=req.body;
  if(name?.trim()){u.name=name.trim();u.avatar=getInitials(name.trim());}
  if(about!==undefined) u.about=about.trim();
  saveData();
  res.json({id:u.id,name:u.name,phone:u.phone,avatar:u.avatar,color:u.color,about:u.about});
});

app.get('/api/users', authenticate, (req,res) => {
  const q=req.query.q?.toLowerCase()||'';
  res.json(users.filter(u=>u.id!==req.user.id&&(!q||u.name.toLowerCase().includes(q)||u.phone.includes(q)))
    .map(u=>({id:u.id,name:u.name,phone:u.phone,avatar:u.avatar,color:u.color,about:u.about,online:u.online})));
});

app.get('/api/users/find', authenticate, (req,res) => {
  const phone=req.query.phone?.trim();
  if(!phone) return res.status(400).json({error:'Phone required'});
  const norm=normalizePhone(phone);
  const u=users.find(u=>normalizePhone(u.phone)===norm&&u.id!==req.user.id);
  if(!u) return res.status(404).json({error:'No user found with this number. Ask them to register first.'});
  res.json({id:u.id,name:u.name,phone:u.phone,avatar:u.avatar,color:u.color,about:u.about,online:u.online});
});

app.get('/api/conversations', authenticate, (req,res) => res.json(convForUser(req.user.id)));

app.get('/api/conversations/:id/messages', authenticate, (req,res) => {
  const c=conversations.find(x=>x.id===req.params.id);
  if(!c||!c.members.includes(req.user.id)) return res.status(403).json({error:'Forbidden'});
  let changed=false;
  c.messages.forEach(m=>{if(m.from!==req.user.id&&m.status[req.user.id]!=='seen'){m.status[req.user.id]='seen';changed=true;}});
  if(changed) saveData();
  res.json(getMsgs(req.params.id,req.user.id));
});

app.post('/api/conversations/direct', authenticate, (req,res) => {
  const {targetUserId}=req.body; const myId=req.user.id;
  if(!users.find(u=>u.id===targetUserId)) return res.status(404).json({error:'User not found'});
  let c=conversations.find(c=>c.type==='direct'&&c.members.includes(myId)&&c.members.includes(targetUserId));
  if(!c){c={id:uuidv4(),type:'direct',members:[myId,targetUserId],messages:[],muted:{},pinned:{},createdAt:Date.now()};conversations.push(c);saveData();}
  res.json({conversationId:c.id});
});

app.post('/api/conversations/group', authenticate, (req,res) => {
  const {name,memberIds}=req.body;
  if(!name?.trim()) return res.status(400).json({error:'Group name required'});
  const myId=req.user.id;
  const all=[...new Set([myId,...(memberIds||[])])];
  const c={id:uuidv4(),type:'group',name:name.trim(),admin:myId,avatar:getInitials(name.trim()),color:randomColor(),members:all,messages:[],muted:{},pinned:{},createdAt:Date.now()};
  conversations.push(c); saveData();
  all.forEach(mid=>{if(userSocketMap[mid]){const d=convForUser(mid).find(x=>x.id===c.id);if(d)io.to(userSocketMap[mid]).emit('conversation:new',d);}});
  res.json({conversationId:c.id});
});

app.delete('/api/conversations/:id/messages', authenticate, (req,res) => {
  const c=conversations.find(x=>x.id===req.params.id);
  if(!c||!c.members.includes(req.user.id)) return res.status(403).json({error:'Forbidden'});
  c.messages=[]; saveData();
  io.to(req.params.id).emit('conversation:cleared',{conversationId:req.params.id});
  res.json({ok:true});
});

app.put('/api/conversations/:id/settings', authenticate, (req,res) => {
  const c=conversations.find(x=>x.id===req.params.id);
  if(!c||!c.members.includes(req.user.id)) return res.status(403).json({error:'Forbidden'});
  const {muted,pinned}=req.body;
  if(!c.muted)c.muted={}; if(!c.pinned)c.pinned={};
  if(muted!==undefined)c.muted[req.user.id]=muted;
  if(pinned!==undefined)c.pinned[req.user.id]=pinned;
  saveData(); res.json({ok:true});
});

// ─── SOCKET.IO ────────────────────────────────────────────────────────
io.on('connection', socket => {
  socket.on('auth', ({token}) => {
    try {
      const dec=jwt.verify(token,JWT_SECRET);
      const user=users.find(u=>u.id===dec.id);
      if(!user) return socket.emit('auth:error','User not found');
      socketUserMap[socket.id]=user.id; userSocketMap[user.id]=socket.id;
      user.online=true; user.lastSeen=null;
      conversations.filter(c=>c.members.includes(user.id)).forEach(c=>socket.join(c.id));
      socket.emit('auth:success',{userId:user.id});
      io.emit('user:status',{userId:user.id,online:true,lastSeen:null});
      console.log(`🟢 ${user.name} online`);
    } catch(e){socket.emit('auth:error','Invalid token');}
  });

  socket.on('message:send', ({conversationId,text,replyTo}) => {
    const userId=socketUserMap[socket.id]; if(!userId||!text?.trim()) return;
    const conv=conversations.find(c=>c.id===conversationId);
    if(!conv||!conv.members.includes(userId)) return;
    const msg={id:uuidv4(),from:userId,text:text.trim(),time:Date.now(),replyTo:replyTo||null,status:{},reactions:[],deleted:false};
    conv.members.forEach(mid=>{msg.status[mid]=mid===userId?'sent':'pending';});
    conv.messages.push(msg); saveData();
    const s=users.find(u=>u.id===userId);
    io.to(conversationId).emit('message:new',{conversationId,message:{...msg,senderName:s?.name,senderAvatar:s?.avatar,senderColor:s?.color}});
    conv.members.forEach(mid=>{
      if(mid!==userId&&userSocketMap[mid]){msg.status[mid]='delivered';saveData();
        io.to(userSocketMap[mid]).emit('message:status',{conversationId,messageId:msg.id,status:'delivered'});}
    });
  });

  socket.on('message:seen', ({conversationId}) => {
    const userId=socketUserMap[socket.id]; if(!userId) return;
    const conv=conversations.find(c=>c.id===conversationId); if(!conv) return;
    let ch=false;
    conv.messages.forEach(m=>{if(m.from!==userId&&m.status[userId]!=='seen'){m.status[userId]='seen';ch=true;if(userSocketMap[m.from])io.to(userSocketMap[m.from]).emit('message:status',{conversationId,messageId:m.id,status:'seen'});}});
    if(ch) saveData();
  });

  socket.on('typing:start', ({conversationId}) => {
    const userId=socketUserMap[socket.id]; if(!userId) return;
    const u=users.find(u=>u.id===userId);
    socket.to(conversationId).emit('typing:update',{conversationId,userId,name:u?.name,typing:true});
  });
  socket.on('typing:stop', ({conversationId}) => {
    const userId=socketUserMap[socket.id]; if(!userId) return;
    socket.to(conversationId).emit('typing:update',{conversationId,userId,typing:false});
  });

  socket.on('message:react', ({conversationId,messageId,emoji}) => {
    const userId=socketUserMap[socket.id]; if(!userId) return;
    const conv=conversations.find(c=>c.id===conversationId);
    const msg=conv?.messages.find(m=>m.id===messageId); if(!msg) return;
    if(!msg.reactions)msg.reactions=[];
    const key=`${userId}:${emoji}`; const idx=msg.reactions.indexOf(key);
    if(idx>=0)msg.reactions.splice(idx,1); else msg.reactions.push(key);
    saveData(); io.to(conversationId).emit('message:reacted',{conversationId,messageId,reactions:msg.reactions});
  });

  socket.on('message:delete', ({conversationId,messageId,deleteFor}) => {
    const userId=socketUserMap[socket.id]; if(!userId) return;
    const conv=conversations.find(c=>c.id===conversationId);
    const msg=conv?.messages.find(m=>m.id===messageId); if(!msg||msg.from!==userId) return;
    if(deleteFor==='everyone'){msg.deleted=true;msg.text='This message was deleted';saveData();io.to(conversationId).emit('message:deleted',{conversationId,messageId,deleteFor:'everyone'});}
    else{if(!msg.deletedFor)msg.deletedFor=[];msg.deletedFor.push(userId);saveData();socket.emit('message:deleted',{conversationId,messageId,deleteFor:'me'});}
  });

  socket.on('disconnect', () => {
    const userId=socketUserMap[socket.id];
    if(userId){
      const u=users.find(u=>u.id===userId);
      if(u){u.online=false;u.lastSeen=Date.now();}
      delete socketUserMap[socket.id]; delete userSocketMap[userId];
      io.emit('user:status',{userId,online:false,lastSeen:Date.now()});
      if(u) console.log(`🔴 ${u.name} offline`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 ChatApp running at http://localhost:${PORT}`);
  console.log(`👥 Users registered: ${users.length}\n`);
});
