// ============================================================
//  MCPATCH BOT + DASHBOARD — Cloudflare Workers
//  KV Keys: chats | menu | cfg | pending:{id}
// ============================================================

const TG = (token, method, params = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then(r => r.json());

async function getCfg(env) {
  const d = await env.BOT_KV.get("cfg");
  const cfg = d ? JSON.parse(d) : {};
  if (!cfg._migrated) {
    const [bi, yi, an] = await Promise.all([
      env.BOT_KV.get("bot_info"), env.BOT_KV.get("youtube_info"), env.BOT_KV.get("latest_announcement")
    ]);
    if (bi) cfg.bot_info = bi;
    if (yi) cfg.youtube_info = yi;
    if (an) cfg.ann = an;
    cfg._migrated = true;
    await saveCfg(env, cfg);
    await Promise.all([
      env.BOT_KV.delete("bot_info"), env.BOT_KV.delete("youtube_info"), env.BOT_KV.delete("latest_announcement")
    ]);
  }
  if (!cfg.custom_buttons) cfg.custom_buttons = [];
  if (!cfg.custom_commands) cfg.custom_commands = {};
  return cfg;
}
async function saveCfg(env, cfg) { await env.BOT_KV.put("cfg", JSON.stringify(cfg)); }
async function getChats(env) { const d = await env.BOT_KV.get("chats"); return d ? JSON.parse(d) : {}; }
async function saveChats(env, c) { await env.BOT_KV.put("chats", JSON.stringify(c)); }
async function addChat(env, chat) {
  const chats = await getChats(env);
  if (!chats[String(chat.id)]) {
    chats[String(chat.id)] = { id: chat.id, type: chat.type, title: chat.title || chat.first_name || "Unknown", username: chat.username || null, added_at: new Date().toISOString(), notes: "" };
    await saveChats(env, chats);
  }
}
async function removeChat(env, id) { const c = await getChats(env); delete c[String(id)]; await saveChats(env, c); }
async function getMenu(env) { const d = await env.BOT_KV.get("menu"); return d ? JSON.parse(d) : {}; }
async function saveMenu(env, m) { await env.BOT_KV.put("menu", JSON.stringify(m)); }
async function getPending(env, uid) { const d = await env.BOT_KV.get("p:"+uid); return d ? JSON.parse(d) : null; }
async function setPending(env, uid, data) {
  if (!data) return env.BOT_KV.delete("p:"+uid);
  return env.BOT_KV.put("p:"+uid, JSON.stringify(data), { expirationTtl: 600 });
}

function buildMainKeyboard(cfg) {
  const fixed = [
    [{ text: "📱 Download Aplikasi", callback_data: "menu:apps" }, { text: "📢 Pengumuman", callback_data: "menu:announcements" }],
    [{ text: "📺 Channel YouTube", callback_data: "menu:youtube" }, { text: "ℹ️ Tentang Kami", callback_data: "menu:info" }],
    [{ text: "🌐 Kunjungi Website mcpatch.me", url: "https://mcpatch.me" }],
  ];
  const customs = (cfg.custom_buttons || []).map(b => {
    if (b.type === "url") return [{ text: b.text, url: b.url }];
    if (b.type === "callback") return [{ text: b.text, callback_data: b.data }];
    return [{ text: b.text, callback_data: "cmd:" + b.trigger }];
  });
  return { inline_keyboard: [...fixed, ...customs] };
}

function adminKB() {
  return { inline_keyboard: [
    [{ text: "📤 Broadcast", callback_data: "admin:broadcast" }, { text: "📊 Statistik", callback_data: "admin:stats" }],
    [{ text: "📢 Atur Pengumuman", callback_data: "admin:setann" }, { text: "📺 Atur YouTube", callback_data: "admin:setyoutube" }],
    [{ text: "ℹ️ Atur Info Bot", callback_data: "admin:setinfo" }, { text: "📁 Kelola File", callback_data: "admin:files" }],
    [{ text: "👥 Daftar Pengguna", callback_data: "admin:users" }, { text: "🗑️ Hapus Data", callback_data: "admin:delete" }],
    [{ text: "🔙 Menu Utama", callback_data: "menu:main" }],
  ]};
}

function delKB() {
  return { inline_keyboard: [
    [{ text: "🗑️ Hapus Pengumuman", callback_data: "admindel:ann" }, { text: "🗑️ Hapus YouTube", callback_data: "admindel:youtube" }],
    [{ text: "🗑️ Hapus Info Bot", callback_data: "admindel:info" }],
    [{ text: "🔙 Panel Admin", callback_data: "admin:main" }],
  ]};
}

function catKB(menu) {
  const cats = Object.keys(menu);
  if (!cats.length) return { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu:main" }]] };
  const rows = [];
  for (let i = 0; i < cats.length; i += 2) {
    const row = [{ text: "📂 " + cats[i], callback_data: "cat:" + cats[i] }];
    if (cats[i+1]) row.push({ text: "📂 " + cats[i+1], callback_data: "cat:" + cats[i+1] });
    rows.push(row);
  }
  rows.push([{ text: "🔙 Menu Utama", callback_data: "menu:main" }]);
  return { inline_keyboard: rows };
}

function verKB(cat, vers) {
  const rows = Object.keys(vers).map(v => [{ text: "📦 " + v, callback_data: "f:" + cat + "||" + v }]);
  rows.push([{ text: "🔙 Kembali", callback_data: "menu:apps" }]);
  return { inline_keyboard: rows };
}

function backKB(d = "menu:main") { return { inline_keyboard: [[{ text: "🔙 Kembali ke Menu Utama", callback_data: d }]] }; }

function fmtDate(iso) { return new Date(iso).toLocaleDateString("id-ID", { day:"numeric", month:"long", year:"numeric" }); }

async function broadcast(token, env, text, mode, extra) {
  const chats = await getChats(env);
  let ok = 0, fail = 0;
  for (const c of Object.values(chats)) {
    try {
      let r;
      if (mode === "text") r = await TG(token, "sendMessage", { chat_id: c.id, text, parse_mode: "HTML" });
      else if (mode === "photo") r = await TG(token, "sendPhoto", { chat_id: c.id, photo: extra.photo, caption: extra.caption, parse_mode: "HTML" });
      else if (mode === "video") r = await TG(token, "sendVideo", { chat_id: c.id, video: extra.video, caption: extra.caption, parse_mode: "HTML" });
      if (r && r.ok) ok++; else { fail++; if (r && r.error_code === 403) await removeChat(env, c.id); }
    } catch { fail++; }
  }
  return { ok, fail };
}

async function handlePending(token, msg, env, adminId) {
  const uid = String(msg.from.id);
  if (uid !== String(adminId)) return false;
  const p = await getPending(env, uid);
  if (!p) return false;
  const chatId = msg.chat.id;
  const text = msg.text || "";
  if (p.action === "broadcast") {
    await setPending(env, uid, null);
    const { ok, fail } = await broadcast(token, env, text, "text");
    return TG(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: "✅ <b>Broadcast Selesai!</b>\n\n📤 Berhasil: <b>"+ok+"</b>\n❌ Gagal: <b>"+fail+"</b>", reply_markup: adminKB() });
  }
  if (p.action === "setann" || p.action === "setyoutube" || p.action === "setinfo") {
    const cfg = await getCfg(env);
    const keyMap = { setann: "ann", setyoutube: "youtube_info", setinfo: "bot_info" };
    const labelMap = { setann: "Pengumuman", setyoutube: "Info YouTube", setinfo: "Info Bot" };
    cfg[keyMap[p.action]] = text;
    await saveCfg(env, cfg);
    await setPending(env, uid, null);
    return TG(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: "✅ <b>" + labelMap[p.action] + " berhasil diperbarui!</b>", reply_markup: adminKB() });
  }
  if (p.action === "add_file") {
    let fileId = null, fileType = null;
    const caption = msg.caption || "";
    if (msg.document) { fileId = msg.document.file_id; fileType = "document"; }
    else if (msg.video) { fileId = msg.video.file_id; fileType = "video"; }
    else if (msg.photo) { fileId = msg.photo[msg.photo.length-1].file_id; fileType = "photo"; }
    else if (msg.audio) { fileId = msg.audio.file_id; fileType = "audio"; }
    else if (msg.animation) { fileId = msg.animation.file_id; fileType = "animation"; }
    if (!fileId) return false;
    const menu = await getMenu(env);
    if (!menu[p.cat]) menu[p.cat] = {};
    menu[p.cat][p.ver] = { file_id: fileId, file_type: fileType, caption, added_at: new Date().toISOString() };
    await saveMenu(env, menu);
    await setPending(env, uid, null);
    return TG(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: "✅ <b>File disimpan!</b>\n📁 "+p.cat+" — "+p.ver, reply_markup: adminKB() });
  }
  return false;
}

async function handleCB(token, q, env, adminId) {
  const { id, data, message, from } = q;
  const chatId = message.chat.id, msgId = message.message_id;
  const isAdmin = String(from.id) === String(adminId);
  await TG(token, "answerCallbackQuery", { callback_query_id: id });
  const edit = (text, kb) => TG(token, "editMessageText", { chat_id: chatId, message_id: msgId, text, parse_mode: "HTML", reply_markup: kb });

  if (data.startsWith("cmd:")) {
    const trigger = data.slice(4);
    const cfg = await getCfg(env);
    const resp = cfg.custom_commands && cfg.custom_commands[trigger];
    return TG(token, "sendMessage", { chat_id: chatId, text: resp || "Tidak ada respons.", parse_mode: "HTML" });
  }
  if (data === "menu:main") {
    const cfg = await getCfg(env);
    return edit("🏠 <b>Menu Utama</b>\n\nHalo, <b>"+(from.first_name||"Pengguna")+"</b>! Pilih menu yang kamu inginkan:", buildMainKeyboard(cfg));
  }
  if (data === "menu:apps") {
    const menu = await getMenu(env);
    return edit("📱 <b>Download Aplikasi</b>\n\nPilih kategori aplikasi yang tersedia:", catKB(menu));
  }
  if (data === "menu:announcements") {
    const cfg = await getCfg(env);
    return edit("📢 <b>Pengumuman Terbaru</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\n"+(cfg.ann||"Belum ada pengumuman saat ini. 🔔")+"\n\n━━━━━━━━━━━━━━━━━━━━", backKB());
  }
  if (data === "menu:youtube") {
    const cfg = await getCfg(env);
    return edit("📺 <b>Channel YouTube Kami</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\n"+(cfg.youtube_info||"Info YouTube belum tersedia.")+"\n\n━━━━━━━━━━━━━━━━━━━━", backKB());
  }
  if (data === "menu:info") {
    const cfg = await getCfg(env);
    return edit("ℹ️ <b>Tentang Kami</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\n"+(cfg.bot_info||"MCPatch — platform distribusi aplikasi mod.\n\n🌐 mcpatch.me")+"\n\n━━━━━━━━━━━━━━━━━━━━", { inline_keyboard: [[{ text: "🌐 Kunjungi mcpatch.me", url: "https://mcpatch.me" }],[{ text: "🔙 Kembali", callback_data: "menu:main" }]] });
  }
  if (data.startsWith("cat:")) {
    const cat = data.slice(4), menu = await getMenu(env), vers = menu[cat] || {};
    if (!Object.keys(vers).length) return edit("📂 <b>"+cat+"</b>\n\nBelum ada file tersedia di kategori ini.", backKB());
    return edit("📂 <b>"+cat+"</b>\n\nPilih versi yang ingin diunduh:", verKB(cat, vers));
  }
  if (data.startsWith("f:")) {
    const rest = data.slice(2);
    const sepIdx = rest.indexOf("||");
    if (sepIdx === -1) return TG(token, "sendMessage", { chat_id: chatId, text: "❌ Format tidak valid." });
    const cat = rest.slice(0, sepIdx);
    const ver = rest.slice(sepIdx + 2);
    const menu = await getMenu(env), file = menu[cat] && menu[cat][ver];
    if (!file) return TG(token, "sendMessage", { chat_id: chatId, text: "❌ File tidak ditemukan." });
    const mm = { document: ["sendDocument","document"], video: ["sendVideo","video"], photo: ["sendPhoto","photo"], audio: ["sendAudio","audio"], animation: ["sendAnimation","animation"] };
    const [method, key] = mm[file.file_type] || ["sendDocument","document"];
    const p = { chat_id: chatId, caption: file.caption || "📦 <b>"+cat+"</b> — "+ver, parse_mode: "HTML" };
    p[key] = file.file_id;
    try {
      await TG(token, method, p);
      return TG(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: "✅ <b>File terkirim!</b>\n📦 "+ver+" | 📁 "+cat, reply_markup: backKB() });
    } catch { return TG(token, "sendMessage", { chat_id: chatId, text: "❌ Gagal mengirim file." }); }
  }
  if (!isAdmin) return;
  if (data === "admin:main") {
    const chats = Object.values(await getChats(env));
    return edit("⚙️ <b>Panel Administrator</b>\n\n━━━━━━━━━━━━━━━━━━━━\n👤 Pengguna: <b>"+chats.filter(c=>c.type==="private").length+"</b>  👥 Grup: <b>"+chats.filter(c=>c.type==="group"||c.type==="supergroup").length+"</b>\n📢 Channel: <b>"+chats.filter(c=>c.type==="channel").length+"</b>  📋 Total: <b>"+chats.length+"</b>\n━━━━━━━━━━━━━━━━━━━━\nPilih aksi:", adminKB());
  }
  if (data === "admin:stats") {
    const chats = Object.values(await getChats(env)), menu = await getMenu(env);
    const totalF = Object.values(menu).reduce((a,c)=>a+Object.keys(c).length, 0);
    return edit("📊 <b>Statistik Bot</b>\n\n━━━━━━━━━━━━━━━━━━━━\n👤 Pengguna: <b>"+chats.filter(c=>c.type==="private").length+"</b>\n👥 Grup: <b>"+chats.filter(c=>c.type==="group"||c.type==="supergroup").length+"</b>\n📢 Channel: <b>"+chats.filter(c=>c.type==="channel").length+"</b>\n📋 Total: <b>"+chats.length+"</b>\n━━━━━━━━━━━━━━━━━━━━\n📁 Kategori: <b>"+Object.keys(menu).length+"</b>  📦 File: <b>"+totalF+"</b>\n━━━━━━━━━━━━━━━━━━━━", { inline_keyboard: [[{ text: "🔙 Panel Admin", callback_data: "admin:main" }]] });
  }
  const pendingActions = { "admin:broadcast": "broadcast", "admin:setann": "setann", "admin:setyoutube": "setyoutube", "admin:setinfo": "setinfo" };
  if (pendingActions[data]) {
    const labels = { broadcast: "📤 Broadcast\n\nKetik pesan yang ingin dikirim ke semua pengguna:", setann: "📢 Atur Pengumuman\n\nKetik teks pengumuman baru:", setyoutube: "📺 Atur YouTube\n\nKetik info YouTube baru:", setinfo: "ℹ️ Atur Info Bot\n\nKetik info bot baru:" };
    await setPending(env, String(from.id), { action: pendingActions[data] });
    return edit(labels[data], { inline_keyboard: [[{ text: "❌ Batalkan", callback_data: "admin:main" }]] });
  }
  if (data === "admin:users") {
    const chats = Object.values(await getChats(env)).filter(c=>c.type==="private").slice(0,15);
    const lines = chats.map((u,i)=>(i+1)+". <b>"+(u.title||"?")+"</b>"+(u.username?" @"+u.username:"")+(u.notes?" — <i>"+u.notes+"</i>":"")+"\n   <code>"+u.id+"</code>").join("\n");
    return edit("👥 <b>Daftar Pengguna</b> ("+chats.length+")\n━━━━━━━━━━━━━━━━━━━━\n"+(lines||"Kosong.")+"\n━━━━━━━━━━━━━━━━━━━━\nℹ️ Kelola lengkap di Web Dashboard.", { inline_keyboard: [[{ text: "🔙 Panel Admin", callback_data: "admin:main" }]] });
  }
  if (data === "admin:files") {
    const menu = await getMenu(env), cats = Object.keys(menu);
    const lines = cats.length ? cats.map(c=>"📁 <b>"+c+"</b> — "+Object.keys(menu[c]).length+" file").join("\n") : "Belum ada kategori.";
    return edit("📁 <b>Kelola File</b>\n━━━━━━━━━━━━━━━━━━━━\n"+lines+"\n━━━━━━━━━━━━━━━━━━━━\n/addcat /delcat /addfile /listcat", { inline_keyboard: [[{ text: "🔙 Panel Admin", callback_data: "admin:main" }]] });
  }
  if (data === "admin:delete") return edit("🗑️ <b>Hapus Data</b>\n\n⚠️ Tidak dapat dibatalkan!", delKB());
  if (data.startsWith("admindel:")) {
    const key = data.slice(9), km = { ann: ["ann","Pengumuman"], youtube: ["youtube_info","YouTube"], info: ["bot_info","Info Bot"] };
    const [cfgKey, label] = km[key] || [];
    if (!cfgKey) return;
    const cfg = await getCfg(env); delete cfg[cfgKey]; await saveCfg(env, cfg);
    return edit("✅ <b>"+label+" berhasil dihapus!</b>", { inline_keyboard: [[{ text: "🔙 Panel Admin", callback_data: "admin:main" }]] });
  }
}

async function handleWebhook(req, env) {
  if (req.method !== "POST") return new Response("", { status: 405 });
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) return new Response("", { status: 401 });
  const token = env.BOT_TOKEN, adminId = String(env.ADMIN_ID);
  let u; try { u = await req.json(); } catch { return new Response("OK"); }

  if (u.message) {
    const msg = u.message, chat = msg.chat, user = msg.from;
    const isAdmin = String(user && user.id) === adminId, text = msg.text || "";

    if (msg.new_chat_members) {
      const me = await TG(token, "getMe");
      if (msg.new_chat_members.some(m => m.id === (me.result && me.result.id))) {
        await addChat(env, chat);
        TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "👋 <b>MCPatch Bot aktif!</b>\nGrup ini akan menerima pengumuman dari admin.\n🌐 mcpatch.me" });
      }
    }
    if (msg.left_chat_member) {
      const me = await TG(token, "getMe");
      if (msg.left_chat_member.id === (me.result && me.result.id)) await removeChat(env, chat.id);
    }

    const handled = await handlePending(token, msg, env, adminId);
    if (handled) return new Response("OK");

    const cfg = await getCfg(env);

    for (const [trigger, resp] of Object.entries(cfg.custom_commands || {})) {
      if (text.toLowerCase() === trigger.toLowerCase() || text.toLowerCase().startsWith(trigger.toLowerCase()+" ")) {
        await addChat(env, chat);
        TG(token, "sendMessage", { chat_id: chat.id, text: resp, parse_mode: "HTML" });
        return new Response("OK");
      }
    }

    if (text.match(/^\/start/i) || text.match(/^\/menu/i)) {
      await addChat(env, chat);
      const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Pengguna";
      const chats = await getChats(env);
      const joinDate = chats[String(user.id)] && chats[String(user.id)].added_at ? fmtDate(chats[String(user.id)].added_at) : "Hari ini";
      const status = isAdmin ? "👑 Administrator" : "⭐ Pengguna Standar";
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML",
        text: "✨ <b>Selamat Datang di MCPatch Bot!</b>\n\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Profil Kamu</b>\n━━━━━━━━━━━━━━━━━━━━\n🏷️ <b>Nama</b>         : "+name+"\n🔖 <b>Username</b>   : "+(user.username?"@"+user.username:"Tidak disetel")+"\n🪪 <b>ID Telegram</b>  : <code>"+user.id+"</code>\n🎖️ <b>Status</b>       : "+status+"\n📅 <b>Bergabung</b>  : "+joinDate+"\n━━━━━━━━━━━━━━━━━━━━\n\nSelamat datang! Gunakan menu di bawah untuk menjelajahi semua fitur. 🚀",
        reply_markup: buildMainKeyboard(cfg) });
    } else if (text.match(/^\/admin/i)) {
      if (!isAdmin) return TG(token, "sendMessage", { chat_id: chat.id, text: "⛔ Akses ditolak." });
      const chats = Object.values(await getChats(env));
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "⚙️ <b>Panel Administrator</b>\n\n📊 Pengguna: <b>"+chats.filter(c=>c.type==="private").length+"</b> | Grup: <b>"+chats.filter(c=>c.type==="group"||c.type==="supergroup").length+"</b> | Channel: <b>"+chats.filter(c=>c.type==="channel").length+"</b>\n\nPilih aksi:", reply_markup: adminKB() });
    } else if (text.match(/^\/broadcast /i) && isAdmin) {
      const bc = text.replace(/^\/broadcast /i,"").trim();
      const { ok, fail } = await broadcast(token, env, bc, "text");
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "✅ Broadcast selesai!\n📤 Berhasil: <b>"+ok+"</b>  ❌ Gagal: <b>"+fail+"</b>" });
    } else if (text.match(/^\/addcat /i) && isAdmin) {
      const name = text.replace(/^\/addcat /i,"").trim();
      const menu = await getMenu(env); if (!menu[name]) { menu[name] = {}; await saveMenu(env, menu); }
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "✅ Kategori <b>"+name+"</b> ditambahkan!" });
    } else if (text.match(/^\/delcat /i) && isAdmin) {
      const name = text.replace(/^\/delcat /i,"").trim();
      const menu = await getMenu(env); delete menu[name]; await saveMenu(env, menu);
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "✅ Kategori <b>"+name+"</b> dihapus." });
    } else if (text.match(/^\/addfile /i) && isAdmin) {
      const raw = text.replace(/^\/addfile /i,"").trim(), pts = raw.split("|");
      if (pts.length < 2) return TG(token, "sendMessage", { chat_id: chat.id, text: "Format: /addfile <kategori> | <versi>" });
      await setPending(env, String(user.id), { action: "add_file", cat: pts[0].trim(), ver: pts[1].trim() });
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "✅ Siap! Kirim file untuk:\n📁 <b>"+pts[0].trim()+"</b> — <b>"+pts[1].trim()+"</b>" });
    } else if (text.match(/^\/listcat/i) && isAdmin) {
      const menu = await getMenu(env), cats = Object.keys(menu);
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: cats.length ? "📋 <b>Kategori:</b>\n"+cats.map((c,i)=>(i+1)+". "+c+" ("+Object.keys(menu[c]).length+" file)").join("\n") : "Belum ada kategori." });
    } else if (text.match(/^\/help/i)) {
      const adm = isAdmin ? "\n\n<b>🔑 Admin:</b>\n/admin — Panel admin\n/broadcast &lt;pesan&gt; — Broadcast\n/addcat /delcat /addfile /listcat" : "";
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "<b>📖 Bantuan MCPatch Bot</b>\n\n/start — Menu utama\n/menu — Menu utama\n/help — Bantuan ini"+adm });
    }
  }

  if (u.callback_query) await handleCB(token, u.callback_query, env, adminId);
  if (u.my_chat_member) {
    const { chat, new_chat_member: nm } = u.my_chat_member;
    if (nm && (nm.status==="member"||nm.status==="administrator")) await addChat(env, chat);
    else if (nm && (nm.status==="kicked"||nm.status==="left")) await removeChat(env, chat.id);
  }
  return new Response("OK");
}

function checkAuth(req, env) {
  const url = new URL(req.url), h = req.headers.get("X-Pw"), q = url.searchParams.get("k"), c = env.DASHBOARD_PASSWORD;
  return c && (h===c||q===c);
}
function jn(data, s) { return new Response(JSON.stringify(data), { status: s||200, headers: {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}}); }

async function handleAPI(req, env, url) {
  const path = url.pathname.replace(/^\/api\//,"");
  if (path==="check") return jn({ pw: !!env.DASHBOARD_PASSWORD, token: !!env.BOT_TOKEN, kv: !!env.BOT_KV });
  if (!checkAuth(req, env)) return jn({ ok:false, error:"Unauthorized" }, 401);
  const token = env.BOT_TOKEN;
  if (path==="chats") return jn({ ok:true, chats: await getChats(env) });
  if (path==="update-chat") { const { id, notes, display_name } = await req.json(); const chats = await getChats(env); if (chats[String(id)]) { if (notes !== undefined) chats[String(id)].notes = notes; if (display_name !== undefined) chats[String(id)].display_name = display_name; await saveChats(env, chats); } return jn({ ok:true }); }
  if (path==="remove-chat") { const { id } = await req.json(); await removeChat(env, id); return jn({ ok:true }); }
  if (path==="files") return jn({ ok:true, menu: await getMenu(env) });
  if (path==="add-cat") { const { name } = await req.json(); const m = await getMenu(env); if(!m[name]){m[name]={};await saveMenu(env,m);} return jn({ok:true}); }
  if (path==="del-cat") { const { name } = await req.json(); const m = await getMenu(env); delete m[name]; await saveMenu(env,m); return jn({ok:true}); }
  if (path==="add-file") { const b = await req.json(); const m = await getMenu(env); if (!m[b.cat]) m[b.cat]={}; m[b.cat][b.ver] = { file_id:b.file_id, file_type:b.file_type||"document", caption:b.caption||"", added_at:new Date().toISOString() }; await saveMenu(env,m); return jn({ok:true}); }
  if (path==="edit-file") { const b = await req.json(); const m = await getMenu(env); if (m[b.cat] && m[b.cat][b.ver]) { if (b.caption !== undefined) m[b.cat][b.ver].caption = b.caption; if (b.new_ver && b.new_ver !== b.ver) { m[b.cat][b.new_ver] = m[b.cat][b.ver]; delete m[b.cat][b.ver]; } await saveMenu(env,m); } return jn({ok:true}); }
  if (path==="del-file") { const { cat,ver } = await req.json(); const m = await getMenu(env); if(m[cat]) delete m[cat][ver]; await saveMenu(env,m); return jn({ok:true}); }
  if (path==="cfg") return jn({ ok:true, cfg: await getCfg(env) });
  if (path==="save-cfg") { const b = await req.json(); const cfg = await getCfg(env); for (const k of ["bot_info","youtube_info","ann"]) { if (b[k]!==undefined) cfg[k] = b[k]; } await saveCfg(env, cfg); return jn({ok:true}); }
  if (path==="del-cfg") { const { key } = await req.json(); const cfg = await getCfg(env); delete cfg[key]; await saveCfg(env, cfg); return jn({ok:true}); }
  if (path==="menu-buttons") { const cfg = await getCfg(env); return jn({ok:true, buttons: cfg.custom_buttons||[]}); }
  if (path==="add-button") { const b = await req.json(); const cfg = await getCfg(env); if (!cfg.custom_buttons) cfg.custom_buttons = []; cfg.custom_buttons.push({ text:b.text, type:b.type, url:b.url||"", data:b.data||"", trigger:b.trigger||"", response:b.response||"" }); if (b.type==="command" && b.trigger && b.response) { if (!cfg.custom_commands) cfg.custom_commands = {}; cfg.custom_commands[b.trigger] = b.response; } await saveCfg(env, cfg); return jn({ok:true}); }
  if (path==="del-button") { const { idx } = await req.json(); const cfg = await getCfg(env); if (cfg.custom_buttons && cfg.custom_buttons[idx]) { const btn = cfg.custom_buttons[idx]; if (btn.trigger && cfg.custom_commands) delete cfg.custom_commands[btn.trigger]; cfg.custom_buttons.splice(idx, 1); await saveCfg(env, cfg); } return jn({ok:true}); }
  if (path==="commands") { const cfg = await getCfg(env); return jn({ok:true, commands: cfg.custom_commands||{}}); }
  if (path==="add-command") { const { trigger, response } = await req.json(); const cfg = await getCfg(env); if (!cfg.custom_commands) cfg.custom_commands = {}; cfg.custom_commands[trigger] = response; await saveCfg(env, cfg); return jn({ok:true}); }
  if (path==="del-command") { const { trigger } = await req.json(); const cfg = await getCfg(env); if (cfg.custom_commands) delete cfg.custom_commands[trigger]; await saveCfg(env, cfg); return jn({ok:true}); }
  if (path==="broadcast") {
    const b = await req.json();
    let list;
    if (b.chat_ids && b.chat_ids.length) {
      const allC = await getChats(env);
      list = b.chat_ids.map(function(id){ return allC[String(id)]; }).filter(Boolean);
    } else {
      list = Object.values(await getChats(env));
      if (b.target==="users") list = list.filter(c=>c.type==="private");
      else if (b.target==="groups") list = list.filter(c=>c.type==="group"||c.type==="supergroup");
      else if (b.target==="channels") list = list.filter(c=>c.type==="channel");
    }
    let ok=0, fail=0;
    for (const chat of list) {
      try {
        let r;
        if (b.mode==="text") r = await TG(token,"sendMessage",{chat_id:chat.id,text:b.text,parse_mode:"HTML"});
        else if (b.mode==="photo") r = await TG(token,"sendPhoto",{chat_id:chat.id,photo:b.photo,caption:b.caption,parse_mode:"HTML"});
        else if (b.mode==="video") r = await TG(token,"sendVideo",{chat_id:chat.id,video:b.video,caption:b.caption,parse_mode:"HTML"});
        if (r&&r.ok) ok++; else { fail++; if(r&&r.error_code===403) await removeChat(env,chat.id); }
      } catch { fail++; }
    }
    return jn({ok:true, success:ok, failed:fail});
  }
  if (path==="setup-webhook") { const r = await TG(token,"setWebhook",{ url:url.origin+"/webhook", secret_token:env.WEBHOOK_SECRET, allowed_updates:["message","callback_query","my_chat_member"] }); return jn({ok:r.ok, result:r}); }
  return jn({ok:false,error:"Not found"},404);
}

function loginHTML(origin) {
  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCPatch Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Plus Jakarta Sans",sans-serif;background:#060d1f;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background-image:radial-gradient(ellipse at 20% 50%,rgba(59,130,246,.1) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(139,92,246,.1) 0%,transparent 60%)}
.box{background:rgba(13,20,38,.9);backdrop-filter:blur(20px);border:1px solid rgba(59,130,246,.2);border-radius:1.5rem;padding:2.5rem;width:100%;max-width:400px}
.logo{width:56px;height:56px;margin:0 auto 1rem;display:block}
h1{font-size:1.5rem;font-weight:800;text-align:center;background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:.25rem}
p{color:#64748b;text-align:center;font-size:.85rem;margin-bottom:1.75rem}
label{display:block;font-size:.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.4rem}
input{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:.75rem;color:#e2e8f0;padding:.8rem 1rem;font-size:.95rem;font-family:inherit;margin-bottom:1.25rem;transition:.2s}
input:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
button{width:100%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;border:none;border-radius:.75rem;padding:.875rem;font-size:.95rem;font-weight:700;font-family:inherit;cursor:pointer}
.hint{margin-top:1rem;font-size:.75rem;color:#475569;text-align:center}code{background:rgba(255,255,255,.06);padding:.1rem .4rem;border-radius:.3rem;color:#93c5fd}</style></head><body>
<div class="box"><svg class="logo" viewBox="0 0 56 56" fill="none"><rect width="56" height="56" rx="14" fill="url(#g)"/><path d="M14 28L22 20L30 28L38 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 36L22 28L30 36L38 28" stroke="rgba(255,255,255,.45)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="g" x1="0" y1="0" x2="56" y2="56"><stop stop-color="#3b82f6"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs></svg>
<h1>MCPatch Dashboard</h1><p>Login untuk mengakses panel admin</p>
<form method="GET" action="${origin}/dashboard"><label>Password</label><input type="password" name="k" placeholder="••••••••" autofocus autocomplete="current-password"><button type="submit">Masuk ke Dashboard →</button></form>
<div class="hint">Gunakan variabel <code>DASHBOARD_PASSWORD</code> di Cloudflare</div></div></body></html>`;
}

function dashboardHTML(origin, k) {
  var ek = k.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,'');
  var JS = `
var K='${ek}',ORIGIN='${origin}',BASE=ORIGIN+'/api',allChats=[],curMode='text',selectedBCIds=[],bcTM='filter',editChatId=null,editFileData=null;
function api(p,b){var s=p.indexOf('?')>-1?'&':'?';return fetch(BASE+'/'+p+s+'k='+encodeURIComponent(K),b).then(function(r){return r.json();});}
function apiG(p){return api(p,{method:'GET'});}
function apiP(p,d){return api(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function alert2(m,t){var b=document.getElementById('ga');b.innerHTML='<div class="alert alert-'+(t||'ok')+'">'+m+'</div>';setTimeout(function(){b.innerHTML='';},4000);}
function go(p){document.querySelectorAll('.nav').forEach(function(n){n.classList.remove('active');});document.querySelectorAll('.page').forEach(function(x){x.classList.remove('active');});var ni=document.getElementById('n-'+p);if(ni)ni.classList.add('active');var pi=document.getElementById('p-'+p);if(pi)pi.classList.add('active');var L={chats:loadChats,files:loadFiles,content:loadContent,menu:loadMenu,commands:loadCommands};if(L[p])L[p]();}
function loadStats(){apiG('chats').then(function(d){if(!d.ok)return;var cs=Object.values(d.chats);allChats=cs;document.getElementById('st0').textContent=cs.length;document.getElementById('st1').textContent=cs.filter(function(c){return c.type==='private';}).length;document.getElementById('st2').textContent=cs.filter(function(c){return c.type==='group'||c.type==='supergroup';}).length;document.getElementById('st3').textContent=cs.filter(function(c){return c.type==='channel';}).length;}).catch(function(){});}
function loadChats(){apiG('chats').then(function(d){if(!d.ok)return;allChats=Object.values(d.chats);renderChats(allChats);});}
function filterChats(){var q=document.getElementById('cq').value.toLowerCase();renderChats(allChats.filter(function(c){return(c.title||c.display_name||'').toLowerCase().indexOf(q)>-1||(c.username||'').toLowerCase().indexOf(q)>-1||String(c.id).indexOf(q)>-1;}));}
function renderChats(list){var el=document.getElementById('chatTbl');if(!list.length){el.innerHTML='<div class="empty">Belum ada chat terdaftar.</div>';return;}el.innerHTML='<div class="tbl-wrap"><table><thead><tr><th>Nama</th><th>Tipe</th><th>Username</th><th>Notes</th><th>Bergabung</th><th>Aksi</th></tr></thead><tbody>'+list.map(function(c){return'<tr><td><b>'+esc(c.display_name||c.title||'?')+'</b><br><small style="color:var(--m)">'+c.id+'</small></td><td><span class="badge badge-'+c.type+'">'+c.type+'</span></td><td style="color:var(--m)">'+(c.username?'@'+c.username:'-')+'</td><td style="font-size:.78rem;max-width:120px;word-break:break-word">'+esc(c.notes||'')+'</td><td style="font-size:.75rem;color:var(--m);white-space:nowrap">'+new Date(c.added_at).toLocaleDateString('id-ID')+'</td><td style="white-space:nowrap"><button class="btn btn-ghost btn-icon" onclick="openEditChat('+c.id+')" title="Edit">✏️</button> <button class="btn btn-danger btn-icon" onclick="delChat('+c.id+')" title="Hapus">🗑</button></td></tr>';}).join('')+'</tbody></table></div>';}
function openEditChat(id){var c=allChats.find(function(x){return x.id===id||x.id===String(id);});if(!c)return;editChatId=id;document.getElementById('editChatName').value=c.display_name||c.title||'';document.getElementById('editChatNotes').value=c.notes||'';document.getElementById('editChatModal').style.display='flex';}
function closeEditChat(){document.getElementById('editChatModal').style.display='none';editChatId=null;}
function saveEditChat(){if(!editChatId)return;apiP('update-chat',{id:editChatId,display_name:document.getElementById('editChatName').value.trim(),notes:document.getElementById('editChatNotes').value.trim()}).then(function(d){if(d.ok){alert2('User diperbarui!');closeEditChat();loadChats();loadStats();}else alert2('Gagal!','err');});}
function delChat(id){if(!confirm('Hapus chat '+id+'?'))return;apiP('remove-chat',{id:id}).then(function(d){if(d.ok){alert2('Dihapus.');loadChats();loadStats();}else alert2('Gagal','err');});}
function loadFiles(){apiG('files').then(function(d){if(!d.ok)return;renderTree(d.menu);var s=document.getElementById('fCat');s.innerHTML=Object.keys(d.menu).map(function(c){return'<option value="'+esc(c)+'">'+esc(c)+'</option>';}).join('');});}
function renderTree(menu){var el=document.getElementById('ftree');var cats=Object.keys(menu);if(!cats.length){el.innerHTML='<div class="empty">Belum ada kategori.</div>';return;}el.innerHTML=cats.map(function(cat){var vers=Object.keys(menu[cat]);return'<div class="tcat"><div class="tcath"><span>📂 '+esc(cat)+' <span class="chip">'+vers.length+'</span></span><button class="btn btn-danger btn-sm" onclick="delCat(\\''+encodeURIComponent(cat)+'\\'')">🗑 Hapus</button></div>'+(vers.length?vers.map(function(v){var f=menu[cat][v];return'<div class="tfile"><div><b>📦 '+esc(v)+'</b> <small style="color:var(--m)">['+f.file_type+']</small>'+(f.caption?'<br><small style="color:var(--m)">'+esc(f.caption.substring(0,60))+(f.caption.length>60?'...':'')+'</small>':'')+'</div><div style="white-space:nowrap"><button class="btn btn-ghost btn-sm" onclick="openEditFile(\\''+encodeURIComponent(cat)+'\\',\\''+encodeURIComponent(v)+'\\',\\''+encodeURIComponent(f.caption||'')+'\\'')">✏️ Edit</button> <button class="btn btn-danger btn-sm" onclick="delFile(\\''+encodeURIComponent(cat)+'\\',\\''+encodeURIComponent(v)+'\\'')">🗑</button></div></div>';}).join(''):'<div class="tfile" style="color:var(--m)">Belum ada file.</div>')+'</div>';}).join('');}
function addCat(){var n=document.getElementById('newCat').value.trim();if(!n)return alert2('Isi nama kategori!','err');apiP('add-cat',{name:n}).then(function(d){if(d.ok){alert2('Kategori ditambahkan!');document.getElementById('newCat').value='';loadFiles();}else alert2('Error','err');});}
function delCat(enc){var n=decodeURIComponent(enc);if(!confirm('Hapus kategori "'+n+'"?'))return;apiP('del-cat',{name:n}).then(function(d){if(d.ok){alert2('Dihapus!');loadFiles();}});}
function addFile(){var cat=document.getElementById('fCat').value,ver=document.getElementById('fVer').value.trim(),fid=document.getElementById('fId').value.trim(),ft=document.getElementById('fType').value,cap=document.getElementById('fCap').value.trim();if(!cat||!ver||!fid)return alert2('Lengkapi field!','err');apiP('add-file',{cat:cat,ver:ver,file_id:fid,file_type:ft,caption:cap}).then(function(d){if(d.ok){alert2('File disimpan!');loadFiles();}else alert2('Error','err');});}
function delFile(ce,ve){var cat=decodeURIComponent(ce),ver=decodeURIComponent(ve);if(!confirm('Hapus "'+ver+'"?'))return;apiP('del-file',{cat:cat,ver:ver}).then(function(d){if(d.ok){alert2('Dihapus!');loadFiles();}});}
function openEditFile(ce,ve,cape){editFileData={cat:decodeURIComponent(ce),ver:decodeURIComponent(ve)};document.getElementById('efVer').value=decodeURIComponent(ve);document.getElementById('efCap').value=decodeURIComponent(cape);document.getElementById('editFileModal').style.display='flex';}
function closeEditFile(){document.getElementById('editFileModal').style.display='none';editFileData=null;}
function saveEditFile(){if(!editFileData)return;apiP('edit-file',{cat:editFileData.cat,ver:editFileData.ver,new_ver:document.getElementById('efVer').value.trim(),caption:document.getElementById('efCap').value.trim()}).then(function(d){if(d.ok){alert2('File diperbarui!');closeEditFile();loadFiles();}else alert2('Gagal!','err');});}
function loadContent(){apiG('cfg').then(function(d){if(!d.ok)return;var c=d.cfg;document.getElementById('sAnn').value=c.ann||'';document.getElementById('sYt').value=c.youtube_info||'';document.getElementById('sInfo').value=c.bot_info||'';});}
function saveCfgKey(key,elId,label){apiP('save-cfg',{}).then(function(){});var d={};d[key]=document.getElementById(elId).value;apiP('save-cfg',d).then(function(r){if(r.ok)alert2(label+' disimpan! ✅');else alert2('Gagal','err');});}
function delCfgKey(key,elId,label){if(!confirm('Hapus '+label+'?'))return;apiP('del-cfg',{key:key}).then(function(d){if(d.ok){document.getElementById(elId).value='';alert2(label+' dihapus!');}});}
function saveAndBC(){var t=document.getElementById('sAnn').value.trim();if(!t)return alert2('Tulis pengumuman dulu!','err');apiP('save-cfg',{ann:t}).then(function(){apiP('broadcast',{mode:'text',target:'all',text:t}).then(function(d){if(d.ok)alert2('📢 Disimpan & dikirim ke '+d.success+' penerima!');else alert2('Disimpan, broadcast gagal','err');});});}
function setMode(m){curMode=m;['text','photo','video'].forEach(function(x){document.getElementById('m-'+x).style.display=x===m?'block':'none';document.getElementById('mt-'+x).classList.toggle('active',x===m);});}
function setBCTargetMode(m){bcTM=m;document.getElementById('btm-filter').style.display=m==='filter'?'block':'none';document.getElementById('btm-manual').style.display=m==='manual'?'block':'none';document.getElementById('btf-filter').classList.toggle('active',m==='filter');document.getElementById('btf-manual').classList.toggle('active',m==='manual');if(m==='manual'){loadBCTargets();}}
function loadBCTargets(){if(!allChats.length)apiG('chats').then(function(d){if(d.ok){allChats=Object.values(d.chats);renderBCTargets();}});else renderBCTargets();}
function renderBCTargets(){var el=document.getElementById('bcTargetList');var ft=document.getElementById('bcManualType').value;var q=document.getElementById('bcSearchQ').value.toLowerCase();var list=allChats.filter(function(c){if(ft!=='all'){if(ft==='private'&&c.type!=='private')return false;if(ft==='group'&&(c.type!=='group'&&c.type!=='supergroup'))return false;if(ft==='channel'&&c.type!=='channel')return false;}if(q&&(c.title||c.display_name||'').toLowerCase().indexOf(q)<0&&(c.username||'').toLowerCase().indexOf(q)<0&&String(c.id).indexOf(q)<0)return false;return true;});if(!list.length){el.innerHTML='<div class="empty">Tidak ditemukan.</div>';updateBCCnt();return;}var typeLabel={private:'👤',group:'👥',supergroup:'👥',channel:'📢'};el.innerHTML=list.map(function(c){var chk=selectedBCIds.indexOf(c.id)>-1?'checked':'';return'<label class="bcitem'+(chk?' bcitem-sel':'')+'"><input type="checkbox" value="'+c.id+'" '+chk+' onchange="toggleBCId('+c.id+')"><div class="bcitem-info"><b>'+esc(typeLabel[c.type]||'')+' '+esc(c.display_name||c.title||'?')+'</b>'+(c.username?' <span style="color:var(--m)">@'+esc(c.username)+'</span>':'')+'<br><small style="color:var(--m)">ID: '+c.id+(c.notes?' • '+esc(c.notes):'')+'</small></div><span class="badge badge-'+c.type+'">'+c.type+'</span></label>';}).join('');updateBCCnt();}
function toggleBCId(id){var i=selectedBCIds.indexOf(id);if(i>-1)selectedBCIds.splice(i,1);else selectedBCIds.push(id);renderBCTargets();}
function toggleAllBC(sel){var ft=document.getElementById('bcManualType').value;var q=document.getElementById('bcSearchQ').value.toLowerCase();var vis=allChats.filter(function(c){if(ft!=='all'){if(ft==='private'&&c.type!=='private')return false;if(ft==='group'&&(c.type!=='group'&&c.type!=='supergroup'))return false;if(ft==='channel'&&c.type!=='channel')return false;}if(q&&(c.title||c.display_name||'').toLowerCase().indexOf(q)<0&&(c.username||'').toLowerCase().indexOf(q)<0&&String(c.id).indexOf(q)<0)return false;return true;});if(sel){vis.forEach(function(c){if(selectedBCIds.indexOf(c.id)<0)selectedBCIds.push(c.id);});}else{vis.forEach(function(c){var i=selectedBCIds.indexOf(c.id);if(i>-1)selectedBCIds.splice(i,1);});}renderBCTargets();}
function updateBCCnt(){document.getElementById('bcSelCount').textContent=selectedBCIds.length+' dipilih';}
function sendBC(){var p={mode:curMode};if(curMode==='text'){p.text=document.getElementById('bcText').value.trim();if(!p.text)return alert2('Tulis pesan!','err');}else if(curMode==='photo'){p.photo=document.getElementById('bcPhoto').value.trim();p.caption=document.getElementById('bcPC').value.trim();if(!p.photo)return alert2('Isi URL foto!','err');}else{p.video=document.getElementById('bcVideo').value.trim();p.caption=document.getElementById('bcVC').value.trim();if(!p.video)return alert2('Isi URL video!','err');}if(bcTM==='manual'){if(!selectedBCIds.length)return alert2('Pilih minimal 1 target!','err');p.chat_ids=selectedBCIds;}else{p.target=document.getElementById('bcTarget').value;}document.getElementById('bcProg').style.display='block';document.getElementById('bcBar').style.width='20%';document.getElementById('bcSt').textContent='Mengirim...';apiP('broadcast',p).then(function(d){document.getElementById('bcBar').style.width='100%';document.getElementById('bcSt').textContent=d.ok?'✅ Selesai! Berhasil: '+d.success+', Gagal: '+d.failed:'❌ Error';if(d.ok)alert2('Broadcast selesai! '+d.success+' terkirim.');else alert2('Gagal!','err');});}
function loadMenu(){apiG('menu-buttons').then(function(d){if(!d.ok)return;renderMenu(d.buttons);});}
function renderMenu(buttons){var el=document.getElementById('btnList');var fixed=[{text:'📱 Download Aplikasi',type:'callback',info:'menu:apps'},{text:'📢 Pengumuman',type:'callback',info:'menu:announcements'},{text:'📺 Channel YouTube',type:'callback',info:'menu:youtube'},{text:'ℹ️ Tentang Kami',type:'callback',info:'menu:info'},{text:'🌐 Kunjungi mcpatch.me',type:'url',info:'https://mcpatch.me'}];el.innerHTML='<div style="margin-bottom:.75rem"><small style="color:var(--m)">Tombol bawaan:</small></div>'+fixed.map(function(b){return'<div class="btnrow fixed"><span class="btntxt">'+esc(b.text)+'</span><span class="chip chip-'+b.type+'">'+b.type+'</span><span style="color:var(--m);font-size:.75rem">'+esc(b.info)+'</span></div>';}).join('')+(buttons.length?'<div style="margin:.75rem 0"><small style="color:var(--m)">Tombol custom:</small></div>'+buttons.map(function(b,i){var info=b.type==='url'?b.url:b.type==='callback'?b.data:b.trigger;return'<div class="btnrow"><span class="btntxt">'+esc(b.text)+'</span><span class="chip chip-'+b.type+'">'+b.type+'</span><span style="color:var(--m);font-size:.75rem">'+esc(info)+'</span><button class="btn btn-danger btn-icon" onclick="delBtn('+i+')">🗑</button></div>';}).join(''):'<div style="color:var(--m);font-size:.85rem;padding:.5rem 0">Belum ada tombol custom.</div>');}
function addBtn(){var text=document.getElementById('btnText').value.trim(),type=document.getElementById('btnType').value;if(!text)return alert2('Isi teks tombol!','err');var d={text:text,type:type};if(type==='url'){d.url=document.getElementById('btnUrl').value.trim();if(!d.url)return alert2('Isi URL!','err');}else if(type==='callback'){d.data=document.getElementById('btnData').value.trim();if(!d.data)return alert2('Isi callback data!','err');}else{d.trigger=document.getElementById('btnTrigger').value.trim();d.response=document.getElementById('btnResponse').value.trim();if(!d.trigger||!d.response)return alert2('Isi trigger & respons!','err');}apiP('add-button',d).then(function(r){if(r.ok){alert2('Tombol ditambahkan!');document.getElementById('btnText').value='';loadMenu();}else alert2('Error','err');});}
function delBtn(i){if(!confirm('Hapus tombol ini?'))return;apiP('del-button',{idx:i}).then(function(d){if(d.ok){alert2('Dihapus!');loadMenu();}});}
function toggleBtnFields(){var t=document.getElementById('btnType').value;document.getElementById('fUrl').style.display=t==='url'?'block':'none';document.getElementById('fCb').style.display=t==='callback'?'block':'none';document.getElementById('fCmd').style.display=t==='command'?'block':'none';}
function loadCommands(){apiG('commands').then(function(d){if(!d.ok)return;renderCommands(d.commands);});}
function renderCommands(cmds){var el=document.getElementById('cmdList');var keys=Object.keys(cmds);if(!keys.length){el.innerHTML='<div class="empty">Belum ada command custom.</div>';return;}el.innerHTML='<table><thead><tr><th>Trigger</th><th>Respons</th><th></th></tr></thead><tbody>'+keys.map(function(k){return'<tr><td><code>'+esc(k)+'</code></td><td style="font-size:.82rem;max-width:200px;word-break:break-word">'+esc(cmds[k].substring(0,80))+(cmds[k].length>80?'...':'')+'</td><td><button class="btn btn-danger btn-icon" onclick="delCmd(\\''+encodeURIComponent(k)+'\\'')">🗑</button></td></tr>';}).join('')+'</tbody></table>';}
function addCmd(){var t=document.getElementById('cmdTrig').value.trim(),r=document.getElementById('cmdResp').value.trim();if(!t||!r)return alert2('Isi trigger & respons!','err');apiP('add-command',{trigger:t,response:r}).then(function(d){if(d.ok){alert2('Command ditambahkan!');document.getElementById('cmdTrig').value='';document.getElementById('cmdResp').value='';loadCommands();}});}
function delCmd(enc){var t=decodeURIComponent(enc);if(!confirm('Hapus command "'+t+'"?'))return;apiP('del-command',{trigger:t}).then(function(d){if(d.ok){alert2('Dihapus!');loadCommands();}});}
function setupWebhook(){apiP('setup-webhook',{}).then(function(d){if(d.ok)alert2('✅ Webhook aktif!');else alert2('Gagal: '+JSON.stringify(d.result),'err');});}
function init(){document.getElementById('wUrl').value=ORIGIN+'/webhook';document.getElementById('wh2').value=ORIGIN+'/webhook';document.getElementById('dashUrl').value=ORIGIN+'/dashboard?k='+encodeURIComponent(K);loadStats();}
window.onload=init;
`;

  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCPatch Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}:root{--bg:#060d1f;--c:#111827;--b:rgba(59,130,246,.15);--b2:rgba(255,255,255,.06);--a:#3b82f6;--p:#8b5cf6;--g:#22c55e;--r:#ef4444;--t:#e2e8f0;--m:#64748b}
body{font-family:"Plus Jakarta Sans",sans-serif;background:var(--bg);color:var(--t);min-height:100vh;background-image:radial-gradient(ellipse at 0% 0%,rgba(59,130,246,.07) 0%,transparent 50%),radial-gradient(ellipse at 100% 100%,rgba(139,92,246,.07) 0%,transparent 50%)}
.top{background:rgba(13,20,38,.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--b);padding:.8rem 1.5rem;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.brand{display:flex;align-items:center;gap:.65rem}.brand svg{width:30px;height:30px}
.brand h1{font-size:.95rem;font-weight:800;background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.online{display:flex;align-items:center;gap:.4rem;font-size:.75rem;color:var(--g);font-weight:600}
.dot{width:6px;height:6px;background:var(--g);border-radius:50%;animation:pulse 2s infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.layout{display:grid;grid-template-columns:220px 1fr;min-height:calc(100vh - 50px)}@media(max-width:720px){.layout{grid-template-columns:1fr}.sidebar{display:none}}
.sidebar{background:rgba(13,20,38,.7);border-right:1px solid var(--b);padding:1rem .75rem;overflow-y:auto}
.sg{font-size:.65rem;font-weight:800;color:var(--m);letter-spacing:.1em;text-transform:uppercase;padding:.4rem .75rem;margin-top:.875rem;margin-bottom:.15rem}.sg:first-child{margin-top:0}
.nav{display:flex;align-items:center;gap:.55rem;padding:.6rem .85rem;border-radius:.625rem;cursor:pointer;color:var(--m);font-size:.82rem;font-weight:500;transition:.15s;margin-bottom:.1rem;user-select:none}
.nav:hover{background:rgba(59,130,246,.08);color:var(--t)}.nav.active{background:rgba(59,130,246,.15);color:var(--a);font-weight:700}
main{padding:1.5rem;overflow-y:auto}.page{display:none}.page.active{display:block}
.ph{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.25rem;flex-wrap:wrap;gap:.5rem}
.pt{font-size:1.15rem;font-weight:800;display:flex;align-items:center;gap:.4rem}.ps{font-size:.78rem;color:var(--m);margin-top:.2rem}
.card{background:var(--c);border:1px solid var(--b2);border-radius:.875rem;padding:1.25rem;margin-bottom:1rem}
.ct{font-size:.8rem;font-weight:700;color:var(--a);margin-bottom:1rem;display:flex;align-items:center;gap:.35rem;text-transform:uppercase;letter-spacing:.04em}
.sg2{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:.875rem;margin-bottom:1.25rem}
.stat{background:var(--c);border:1px solid var(--b2);border-radius:.75rem;padding:1rem;text-align:center;transition:.2s}.stat:hover{border-color:rgba(59,130,246,.3);transform:translateY(-2px)}
.sn{font-size:1.85rem;font-weight:800;background:linear-gradient(135deg,var(--a),var(--p));-webkit-background-clip:text;-webkit-text-fill-color:transparent}.sl{font-size:.72rem;color:var(--m);margin-top:.2rem;font-weight:500}
label{display:block;font-size:.7rem;font-weight:700;color:var(--m);margin-bottom:.35rem;letter-spacing:.06em;text-transform:uppercase}
input,textarea,select{width:100%;background:rgba(255,255,255,.04);border:1px solid var(--b2);border-radius:.575rem;color:var(--t);padding:.65rem .875rem;font-size:.85rem;font-family:inherit;transition:.2s}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--a);box-shadow:0 0 0 3px rgba(59,130,246,.1)}
textarea{resize:vertical;min-height:90px}.fg{margin-bottom:.875rem}.row{display:flex;gap:.75rem;flex-wrap:wrap}.row .fg{flex:1;min-width:150px}
.btn{padding:.6rem 1.1rem;border:none;border-radius:.575rem;cursor:pointer;font-size:.8rem;font-weight:700;font-family:inherit;transition:.15s;display:inline-flex;align-items:center;gap:.35rem}.btn:active{transform:scale(.97)}
.btn-primary{background:linear-gradient(135deg,var(--a),var(--p));color:#fff}.btn-primary:hover{opacity:.9;box-shadow:0 4px 12px rgba(59,130,246,.35)}
.btn-success{background:linear-gradient(135deg,var(--g),#16a34a);color:#fff}.btn-success:hover{opacity:.9}
.btn-danger{background:rgba(239,68,68,.12);color:var(--r);border:1px solid rgba(239,68,68,.25)}.btn-danger:hover{background:var(--r);color:#fff;border-color:var(--r)}
.btn-ghost{background:rgba(255,255,255,.05);color:var(--t);border:1px solid var(--b2)}.btn-ghost:hover{border-color:var(--a);color:var(--a)}
.btn-sm{padding:.35rem .75rem;font-size:.75rem}.btn-icon{width:30px;height:30px;padding:0;justify-content:center;border-radius:.5rem}
.alert{padding:.75rem 1rem;border-radius:.575rem;font-size:.82rem;margin-bottom:.875rem;font-weight:500}
.alert-ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);color:#86efac}
.alert-err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:#fca5a5}
.alert-info{background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.25);color:#93c5fd}
.mtabs{display:flex;gap:.35rem;margin-bottom:.875rem;flex-wrap:wrap}
.mtab{padding:.4rem .9rem;border-radius:.5rem;border:1px solid var(--b2);cursor:pointer;font-size:.78rem;font-weight:600;color:var(--m);transition:.15s;font-family:inherit}.mtab:hover{border-color:var(--a);color:var(--a)}.mtab.active{background:rgba(59,130,246,.15);border-color:var(--a);color:var(--a)}
.tbl-wrap{overflow-x:auto;border-radius:.575rem}table{width:100%;border-collapse:collapse;font-size:.8rem}
th{color:var(--m);font-weight:700;padding:.6rem .9rem;border-bottom:1px solid var(--b2);text-align:left;font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
td{padding:.6rem .9rem;border-bottom:1px solid rgba(255,255,255,.035)}tr:last-child td{border:none}tr:hover td{background:rgba(255,255,255,.015)}
.badge{padding:.15rem .55rem;border-radius:1rem;font-size:.67rem;font-weight:700}.badge-private{background:rgba(59,130,246,.15);color:#93c5fd}.badge-group{background:rgba(34,197,94,.15);color:#86efac}.badge-supergroup{background:rgba(245,158,11,.15);color:#fcd34d}.badge-channel{background:rgba(239,68,68,.15);color:#fca5a5}
.chip{padding:.15rem .55rem;border-radius:1rem;font-size:.67rem;font-weight:700;background:rgba(255,255,255,.08);color:var(--m)}.chip-url{background:rgba(34,197,94,.12);color:#86efac}.chip-callback{background:rgba(59,130,246,.12);color:#93c5fd}.chip-command{background:rgba(245,158,11,.12);color:#fcd34d}
.prog-wrap{background:rgba(255,255,255,.05);border-radius:1rem;height:5px;overflow:hidden}.prog{height:100%;background:linear-gradient(90deg,var(--a),var(--p));border-radius:1rem;transition:width .4s}
.tcat{background:rgba(255,255,255,.025);border:1px solid var(--b2);border-radius:.75rem;overflow:hidden;margin-bottom:.625rem}.tcat:hover{border-color:rgba(59,130,246,.2)}
.tcath{padding:.6rem 1rem;background:rgba(59,130,246,.07);display:flex;justify-content:space-between;align-items:center}.tcath span{font-weight:700;color:var(--a);font-size:.82rem}
.tfile{padding:.5rem 1rem;border-top:1px solid rgba(255,255,255,.04);display:flex;justify-content:space-between;align-items:center;gap:.5rem;font-size:.8rem}
.btnrow{display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem;border-radius:.5rem;border:1px solid var(--b2);margin-bottom:.35rem;flex-wrap:wrap}.btnrow.fixed{opacity:.6}.btntxt{font-weight:600;font-size:.82rem;flex:1;min-width:100px}
.empty{text-align:center;padding:2rem;color:var(--m);font-size:.85rem}hr{border:none;border-top:1px solid var(--b2);margin:1rem 0}code{background:rgba(255,255,255,.07);padding:.15rem .4rem;border-radius:.35rem;color:#93c5fd;font-size:.8rem}.sw{display:flex;gap:.5rem;margin-bottom:.875rem}.sw input{flex:1}
.bcitem{display:flex;align-items:center;gap:.6rem;padding:.5rem .6rem;border-radius:.5rem;border:1px solid var(--b2);margin-bottom:.3rem;cursor:pointer;transition:.15s;font-size:.82rem}
.bcitem:hover{border-color:rgba(59,130,246,.25)}.bcitem-sel{background:rgba(59,130,246,.08);border-color:rgba(59,130,246,.3)}
.bcitem input[type=checkbox]{width:16px;height:16px;accent-color:var(--a);flex-shrink:0}
.bcitem-info{flex:1;min-width:0;overflow:hidden}
.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:200;align-items:center;justify-content:center;padding:1rem}.modal-box{background:#111827;border:1px solid var(--b);border-radius:1rem;padding:1.5rem;width:100%;max-width:420px}.modal-title{font-weight:800;font-size:1rem;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center}.close-btn{background:none;border:none;color:var(--m);font-size:1.25rem;cursor:pointer;line-height:1}
</style></head><body>
<div class="top"><div class="brand"><svg viewBox="0 0 30 30" fill="none"><rect width="30" height="30" rx="7" fill="url(#tg)"/><path d="M7 15L11 11L15 15L19 11" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 19L11 15L15 19L19 15" stroke="rgba(255,255,255,.4)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="tg" x1="0" y1="0" x2="30" y2="30"><stop stop-color="#3b82f6"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs></svg><h1>MCPatch Dashboard</h1></div><div class="online"><div class="dot"></div>Online</div></div>
<div class="layout"><nav class="sidebar"><div class="sg">Utama</div><div class="nav active" id="n-overview" onclick="go('overview')">📊 Overview</div><div class="nav" id="n-broadcast" onclick="go('broadcast')">📢 Broadcast</div><div class="sg">Data</div><div class="nav" id="n-chats" onclick="go('chats')">👥 User List</div><div class="nav" id="n-files" onclick="go('files')">📁 File Manager</div><div class="sg">Bot Config</div><div class="nav" id="n-content" onclick="go('content')">✏️ Atur Konten</div><div class="nav" id="n-menu" onclick="go('menu')">🔘 Menu Builder</div><div class="nav" id="n-commands" onclick="go('commands')">⚡ Auto Reply</div><div class="sg">Sistem</div><div class="nav" id="n-settings" onclick="go('settings')">⚙️ Settings</div></nav>
<main><div id="ga"></div>
<div class="page active" id="p-overview"><div class="ph"><div><div class="pt">📊 Overview</div><div class="ps">Ringkasan statistik bot</div></div></div><div class="sg2"><div class="stat"><div class="sn" id="st0">0</div><div class="sl">Total Chat</div></div><div class="stat"><div class="sn" id="st1">0</div><div class="sl">Pengguna</div></div><div class="stat"><div class="sn" id="st2">0</div><div class="sl">Grup</div></div><div class="stat"><div class="sn" id="st3">0</div><div class="sl">Channel</div></div></div><div class="card"><div class="ct">🔗 Sistem</div><div class="fg"><label>Webhook URL</label><div style="display:flex;gap:.4rem"><input id="wUrl" readonly><button class="btn btn-success btn-sm" onclick="setupWebhook()">⚡ Setup</button></div></div><div class="fg"><label>Dashboard URL (Bookmark ini!)</label><input id="dashUrl" readonly></div></div></div>
<div class="page" id="p-broadcast"><div class="ph"><div><div class="pt">📢 Broadcast</div><div class="ps">Kirim pesan ke semua atau pilih target manual</div></div></div>
<div class="card"><div class="ct">✏️ Buat Pesan</div>
<div class="mtabs"><div class="mtab active" id="mt-text" onclick="setMode('text')">📝 Teks</div><div class="mtab" id="mt-photo" onclick="setMode('photo')">🖼️ Foto</div><div class="mtab" id="mt-video" onclick="setMode('video')">🎬 Video</div></div>
<div id="m-text"><div class="fg"><label>Pesan (HTML)</label><textarea id="bcText" placeholder="Tulis pesan broadcast..."></textarea></div></div>
<div id="m-photo" style="display:none"><div class="fg"><label>URL Foto / File ID</label><input id="bcPhoto" placeholder="https://... atau file_id"></div><div class="fg"><label>Caption</label><textarea id="bcPC" style="min-height:60px"></textarea></div></div>
<div id="m-video" style="display:none"><div class="fg"><label>URL Video / File ID</label><input id="bcVideo" placeholder="https://... atau file_id"></div><div class="fg"><label>Caption</label><textarea id="bcVC" style="min-height:60px"></textarea></div></div>
<div class="mtabs"><div class="mtab active" id="btf-filter" onclick="setBCTargetMode('filter')">🌐 Filter Tipe</div><div class="mtab" id="btf-manual" onclick="setBCTargetMode('manual')">🎯 Pilih Manual</div></div>
<div id="btm-filter"><div class="fg"><label>Target</label><select id="bcTarget"><option value="all">🌐 Semua</option><option value="users">👤 Pengguna</option><option value="groups">👥 Grup</option><option value="channels">📢 Channel</option></select></div></div>
<div id="btm-manual" style="display:none">
<div class="fg"><label>Filter Tipe</label><select id="bcManualType" onchange="renderBCTargets()"><option value="all">Semua</option><option value="private">👤 Pengguna</option><option value="group">👥 Grup</option><option value="channel">📢 Channel</option></select></div>
<div class="sw"><input id="bcSearchQ" placeholder="🔍 Cari nama, username, ID..." oninput="renderBCTargets()"></div>
<div style="display:flex;gap:.4rem;margin-bottom:.5rem;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" onclick="toggleAllBC(true)">✅ Pilih Semua</button><button class="btn btn-ghost btn-sm" onclick="toggleAllBC(false)">❌ Batal Pilih</button><span style="font-size:.78rem;color:var(--m);align-self:center" id="bcSelCount">0 dipilih</span></div>
<div id="bcTargetList" style="max-height:320px;overflow-y:auto;border:1px solid var(--b2);border-radius:.575rem;padding:.5rem"><div class="empty">Memuat...</div></div>
</div>
<button class="btn btn-primary" onclick="sendBC()">📤 Kirim Sekarang</button>
<div id="bcProg" style="display:none;margin-top:.875rem"><div style="font-size:.78rem;color:var(--m);margin-bottom:.4rem" id="bcSt"></div><div class="prog-wrap"><div class="prog" id="bcBar" style="width:0%"></div></div></div></div></div>
<div class="page" id="p-chats"><div class="ph"><div><div class="pt">👥 User List</div><div class="ps">Semua pengguna, grup, dan channel</div></div><button class="btn btn-ghost btn-sm" onclick="loadChats()">🔄 Refresh</button></div><div class="card"><div class="sw"><input id="cq" placeholder="🔍 Cari nama, username, ID..." oninput="filterChats()"></div><div id="chatTbl"><div class="empty">Memuat...</div></div></div></div>
<div class="page" id="p-files"><div class="ph"><div><div class="pt">📁 File Manager</div><div class="ps">Kelola kategori dan file</div></div></div><div class="card"><div class="ct">📂 Tambah Kategori</div><div style="display:flex;gap:.5rem"><input id="newCat" placeholder="Nama kategori..." style="flex:1"><button class="btn btn-success" onclick="addCat()">+ Tambah</button></div></div><div class="card"><div class="ct">🗂️ Kategori & File</div><div id="ftree"><div class="empty">Memuat...</div></div></div><div class="card"><div class="ct">➕ Tambah File</div><div class="alert alert-info">💡 Kirim <code>/addfile Kategori | Versi</code> ke bot, lalu kirim filenya.</div><div class="row"><div class="fg"><label>Kategori</label><select id="fCat"></select></div><div class="fg"><label>Versi</label><input id="fVer" placeholder="v1.21.50"></div></div><div class="row"><div class="fg"><label>File ID Telegram</label><input id="fId" placeholder="BQACAgIAAxkB..."></div><div class="fg"><label>Tipe</label><select id="fType"><option value="document">📄 Document/APK</option><option value="video">🎬 Video</option><option value="photo">🖼️ Foto</option><option value="audio">🎵 Audio</option></select></div></div><div class="fg"><label>Caption</label><textarea id="fCap" style="min-height:60px" placeholder="Deskripsi file..."></textarea></div><button class="btn btn-primary" onclick="addFile()">💾 Simpan File</button></div></div>
<div class="page" id="p-content"><div class="ph"><div><div class="pt">✏️ Atur Konten</div><div class="ps">Edit teks menu bot</div></div></div><div class="card"><div class="ct">📢 Pengumuman</div><div class="fg"><textarea id="sAnn" placeholder="Teks pengumuman..."></textarea></div><div style="display:flex;gap:.4rem;flex-wrap:wrap"><button class="btn btn-primary" onclick="saveCfgKey('ann','sAnn','Pengumuman')">💾 Simpan</button><button class="btn btn-success" onclick="saveAndBC()">📤 Simpan + Kirim</button><button class="btn btn-danger" onclick="delCfgKey('ann','sAnn','Pengumuman')">🗑️ Hapus</button></div></div><div class="card"><div class="ct">📺 Info YouTube</div><div class="fg"><textarea id="sYt" placeholder="Link & deskripsi YouTube..."></textarea></div><div style="display:flex;gap:.4rem"><button class="btn btn-primary" onclick="saveCfgKey('youtube_info','sYt','YouTube')">💾 Simpan</button><button class="btn btn-danger" onclick="delCfgKey('youtube_info','sYt','YouTube')">🗑️ Hapus</button></div></div><div class="card"><div class="ct">ℹ️ Tentang Kami</div><div class="fg"><textarea id="sInfo" placeholder="Info bot, kontak, deskripsi..."></textarea></div><div style="display:flex;gap:.4rem"><button class="btn btn-primary" onclick="saveCfgKey('bot_info','sInfo','Info Bot')">💾 Simpan</button><button class="btn btn-danger" onclick="delCfgKey('bot_info','sInfo','Info Bot')">🗑️ Hapus</button></div></div></div>
<div class="page" id="p-menu"><div class="ph"><div><div class="pt">🔘 Menu Builder</div><div class="ps">Kelola tombol menu utama</div></div></div><div class="card"><div class="ct">📋 Tombol Saat Ini</div><div id="btnList"><div class="empty">Memuat...</div></div></div><div class="card"><div class="ct">➕ Tambah Tombol Baru</div><div class="row"><div class="fg"><label>Teks Tombol</label><input id="btnText" placeholder="Emoji + nama tombol"></div><div class="fg"><label>Tipe</label><select id="btnType" onchange="toggleBtnFields()"><option value="url">🔗 URL</option><option value="callback">⚡ Callback</option><option value="command">💬 Command</option></select></div></div><div id="fUrl" class="fg"><label>URL Tujuan</label><input id="btnUrl" placeholder="https://..."></div><div id="fCb" class="fg" style="display:none"><label>Callback Data</label><input id="btnData" placeholder="menu:apps atau cat:NamaKategori"></div><div id="fCmd" style="display:none"><div class="fg"><label>Trigger</label><input id="btnTrigger" placeholder="/halo atau promo"></div><div class="fg"><label>Respons Bot</label><textarea id="btnResponse" style="min-height:70px" placeholder="Respons bot..."></textarea></div></div><button class="btn btn-primary" onclick="addBtn()">+ Tambah Tombol</button></div></div>
<div class="page" id="p-commands"><div class="ph"><div><div class="pt">⚡ Auto Reply</div><div class="ps">Bot auto balas ketika user kirim trigger</div></div></div><div class="card"><div class="ct">📋 Command Aktif</div><div id="cmdList"><div class="empty">Memuat...</div></div></div><div class="card"><div class="ct">➕ Tambah Auto Reply</div><div class="fg"><label>Trigger</label><input id="cmdTrig" placeholder="/halo atau info harga"></div><div class="fg"><label>Respons Bot</label><textarea id="cmdResp" placeholder="Respons yang akan dikirim bot..."></textarea></div><button class="btn btn-primary" onclick="addCmd()">+ Tambah</button><div class="alert alert-info" style="margin-top:.875rem">💡 Bot membalas jika user mengirim teks yang <b>sama persis</b> dengan trigger.</div></div></div>
<div class="page" id="p-settings"><div class="ph"><div><div class="pt">⚙️ Settings</div></div></div><div class="card"><div class="ct">🔗 Webhook</div><div class="fg"><label>Webhook URL</label><input id="wh2" readonly></div><button class="btn btn-success" onclick="setupWebhook()">⚡ Setup Webhook</button></div></div>
</main></div>
<div class="modal" id="editChatModal"><div class="modal-box"><div class="modal-title">✏️ Edit User <button class="close-btn" onclick="closeEditChat()">✕</button></div><div class="fg"><label>Nama Tampilan</label><input id="editChatName" placeholder="Nama custom"></div><div class="fg"><label>Notes Admin</label><textarea id="editChatNotes" style="min-height:70px" placeholder="Catatan internal..."></textarea></div><div style="display:flex;gap:.4rem"><button class="btn btn-primary" onclick="saveEditChat()">💾 Simpan</button><button class="btn btn-ghost" onclick="closeEditChat()">Batal</button></div></div></div>
<div class="modal" id="editFileModal"><div class="modal-box"><div class="modal-title">✏️ Edit File <button class="close-btn" onclick="closeEditFile()">✕</button></div><div class="fg"><label>Nama Versi</label><input id="efVer" placeholder="v1.21.50"></div><div class="fg"><label>Caption</label><textarea id="efCap" style="min-height:80px" placeholder="Deskripsi file..."></textarea></div><div style="display:flex;gap:.4rem"><button class="btn btn-primary" onclick="saveEditFile()">💾 Simpan</button><button class="btn btn-ghost" onclick="closeEditFile()">Batal</button></div></div></div>
<script>${JS}<\\/script></body></html>`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type,X-Pw"}});
    if (url.pathname === "/webhook") return handleWebhook(req, env);
    if (url.pathname === "/dashboard") {
      const k = url.searchParams.get("k");
      if (k && k === env.DASHBOARD_PASSWORD) return new Response(dashboardHTML(url.origin, k), { headers: {"Content-Type":"text/html;charset=UTF-8"}});
      return new Response(loginHTML(url.origin), { headers: {"Content-Type":"text/html;charset=UTF-8"}});
    }
    if (url.pathname.startsWith("/api/")) return handleAPI(req, env, url);
    return Response.redirect(url.origin + "/dashboard", 302);
  }
};
