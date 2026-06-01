// ============================================================
//  TELEGRAM BOT + WEB DASHBOARD — Cloudflare Workers
//  Glassmorphism • Plus Jakarta Sans • SVG Icons • Full CRUD
// ============================================================

const TG = (token, method, params = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json());

function escH(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── KV HELPERS ──────────────────────────────────────────────

async function getChats(env) {
  const d = await env.BOT_KV.get("chats");
  return d ? JSON.parse(d) : {};
}
async function saveChats(env, c) { await env.BOT_KV.put("chats", JSON.stringify(c)); }
async function addChat(env, chat) {
  const chats = await getChats(env);
  chats[String(chat.id)] = {
    id: chat.id, type: chat.type,
    title: chat.title || chat.first_name || chat.username || "Unknown",
    username: chat.username || null,
    added_at: new Date().toISOString(),
  };
  await saveChats(env, chats);
}
async function removeChat(env, id) {
  const c = await getChats(env);
  delete c[String(id)];
  await saveChats(env, c);
}

async function getMenu(env) {
  const d = await env.BOT_KV.get("menu");
  return d ? JSON.parse(d) : {};
}
async function saveMenu(env, m) { await env.BOT_KV.put("menu", JSON.stringify(m)); }

async function getAdmins(env) {
  const d = await env.BOT_KV.get("admins");
  if (d) return JSON.parse(d);
  const o = String(env.ADMIN_ID);
  const a = { [o]: { id: o, role: "owner", added_at: new Date().toISOString() } };
  await env.BOT_KV.put("admins", JSON.stringify(a));
  return a;
}
async function saveAdmins(env, a) { await env.BOT_KV.put("admins", JSON.stringify(a)); }
async function isAdmin(env, uid) { return !!(await getAdmins(env))[String(uid)]; }

async function getUser(env, uid) {
  const d = await env.BOT_KV.get("user:" + uid);
  return d ? JSON.parse(d) : null;
}
async function saveUser(env, uid, p) { await env.BOT_KV.put("user:" + uid, JSON.stringify(p)); }
async function getAllUsers(env) {
  const list = await env.BOT_KV.list({ prefix: "user:" });
  const out = [];
  for (const k of list.keys) {
    const d = await env.BOT_KV.get(k.name);
    if (d) out.push(JSON.parse(d));
  }
  return out.sort((a, b) => new Date(b.last_active) - new Date(a.last_active));
}

async function getPending(env, uid) {
  const d = await env.BOT_KV.get("pend:" + uid);
  return d ? JSON.parse(d) : null;
}
async function setPending(env, uid, d) {
  if (!d) return env.BOT_KV.delete("pend:" + uid);
  return env.BOT_KV.put("pend:" + uid, JSON.stringify(d), { expirationTtl: 300 });
}

// ─── INLINE KEYBOARDS ────────────────────────────────────────

function kbd(rows) { return { inline_keyboard: rows }; }

function mainMenuKbd() {
  return kbd([
    [{ text: "🌐  ENTER WEBSITE", url: "https://mcpatch.me" }],
    [
      { text: "📱  Download App", callback_data: "m:apps" },
      { text: "📺  YouTube", callback_data: "m:yt" },
    ],
    [
      { text: "📢  Pengumuman", callback_data: "m:ann" },
      { text: "ℹ️  Tentang Bot", callback_data: "m:info" },
    ],
  ]);
}

function adminMenuKbd() {
  return kbd([
    [
      { text: "👤  Kelola User", callback_data: "a:users" },
      { text: "📢  Broadcast", callback_data: "a:bcast" },
    ],
    [
      { text: "📁  Kelola File", callback_data: "a:files" },
      { text: "📝  Pengumuman", callback_data: "a:ann" },
    ],
    [
      { text: "📺  YouTube Info", callback_data: "a:yt" },
      { text: "⚙️  Pengaturan", callback_data: "a:set" },
    ],
    [
      { text: "📋  Daftar Admin", callback_data: "a:adms" },
      { text: "🔗  Setup Webhook", callback_data: "a:wh" },
    ],
    [{ text: "🔙  Kembali ke Menu Utama", callback_data: "m:main" }],
  ]);
}

function catKbd(menu) {
  const cats = Object.keys(menu);
  if (!cats.length) return kbd([[{ text: "🔙 Kembali", callback_data: "m:apps" }]]);
  const rows = [];
  for (let i = 0; i < cats.length; i += 2) {
    const r = [{ text: "📁 " + cats[i], callback_data: "c:" + cats[i] }];
    if (cats[i + 1]) r.push({ text: "📁 " + cats[i + 1], callback_data: "c:" + cats[i + 1] });
    rows.push(r);
  }
  rows.push([{ text: "🔙 Kembali", callback_data: "m:apps" }]);
  return kbd(rows);
}

function verKbd(cat, vers) {
  const rows = Object.keys(vers).map((v) => [{ text: "📦 " + v, callback_data: "f:" + cat + ":" + v }]);
  rows.push([{ text: "🔙 Kembali", callback_data: "m:apps" }]);
  return kbd(rows);
}

function backKbd(t) { return kbd([[{ text: "🔙 Kembali", callback_data: t || "m:main" }]]); }

// ─── COMMAND HANDLERS ────────────────────────────────────────

async function cmdStart(token, chat, user, env) {
  await addChat(env, chat);
  const ex = await getUser(env, user.id);
  const p = {
    id: user.id, first_name: user.first_name || "", last_name: user.last_name || "",
    username: user.username || null, status: ex?.status || "Standard", bio: ex?.bio || null,
    joined_at: ex?.joined_at || new Date().toISOString(), last_active: new Date().toISOString(),
  };
  await saveUser(env, user.id, p);
  const dn = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "User";
  const stIcon = p.status === "Premium" ? "🌟" : p.status === "VIP" ? "💎" : p.status === "Banned" ? "🚫" : "⚪";
  const jd = new Date(p.joined_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const txt =
    `╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
    `│     🏠  <b>MCPATCH BOT</b>      │\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
    `┌─── 👤 PROFIL SAYA ─────────────┐\n` +
    `│                                  │\n` +
    `│  📛 Nama     : <b>${escH(dn)}</b>\n` +
    `│  🆔 ID       : <code>${user.id}</code>\n` +
    (user.username ? `│  🔖 Username : @${escH(user.username)}\n` : "") +
    `│  ⭐ Status   : ${stIcon} ${escH(p.status)}\n` +
    `│  📅 Bergabung: ${jd}\n` +
    `│  🕐 Terakhir : Baru saja\n` +
    `│                                  │\n` +
    `└──────────────────────────────────┘\n\n` +
    `Selamat datang, <b>${escH(user.first_name || "User")}</b>! 🎉\n\n` +
    `MCPATCH Bot adalah layanan resmi untuk distribusi aplikasi, update patch terbaru, konten YouTube Channel, serta pengumuman penting seputar MCPATCH.\n\n` +
    `Silakan pilih menu di bawah ini untuk memulai explorasi:`;
  await TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: txt, reply_markup: mainMenuKbd() });
}

async function cmdAdmin(token, chat, user, env) {
  if (String(user.id) !== String(env.ADMIN_ID))
    return TG(token, "sendMessage", { chat_id: chat.id, text: "❌ Akses ditolak. Perintah ini hanya tersedia untuk owner bot." });
  const cl = Object.values(await getChats(env));
  const u = cl.filter((c) => c.type === "private").length;
  const g = cl.filter((c) => c.type === "group" || c.type === "supergroup").length;
  const ch = cl.filter((c) => c.type === "channel").length;
  const txt =
    `╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
    `│    🔐  <b>ADMIN PANEL</b>        │\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
    `📊 <b>STATISTIK BOT</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 Users     : <b>${u}</b>\n` +
    `👥 Groups    : <b>${g}</b>\n` +
    `📢 Channels  : <b>${ch}</b>\n` +
    `📋 Total     : <b>${cl.length}</b>\n\n` +
    `⚙️ <b>MENU ADMINISTRATOR</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Pilih aksi yang ingin kamu lakukan di bawah ini:`;
  await TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: txt, reply_markup: adminMenuKbd() });
}

async function cmdBroadcast(token, msg, env, isAdm) {
  if (!isAdm) return TG(token, "sendMessage", { chat_id: msg.chat.id, text: "❌ Kamu tidak memiliki akses untuk perintah ini." });
  const text = msg.text.replace(/^\/broadcast\s*/i, "").trim();
  if (!text) return TG(token, "sendMessage", { chat_id: msg.chat.id, text: "Format: /broadcast <pesan>\n\nContoh:\n/broadcast 🎉 Update terbaru sudah tersedia! Kunjungi mcpatch.me untuk info lengkap." });
  const chats = await getChats(env);
  let ok = 0, fail = 0;
  for (const c of Object.values(chats)) {
    const r = await TG(token, "sendMessage", { chat_id: c.id, text, parse_mode: "HTML" });
    if (r.ok) ok++; else { fail++; if (r.error_code === 403) await removeChat(env, c.id); }
  }
  TG(token, "sendMessage", { chat_id: msg.chat.id, text: `✅ <b>Broadcast Selesai</b>\n\n📤 Berhasil terkirim : <b>${ok}</b>\n❌ Gagal dikirim   : <b>${fail}</b>`, parse_mode: "HTML" });
}

async function cmdStats(token, cid, env, isAdm) {
  if (!isAdm) return;
  const cl = Object.values(await getChats(env));
  const u = cl.filter((c) => c.type === "private").length;
  const g = cl.filter((c) => c.type === "group" || c.type === "supergroup").length;
  const ch = cl.filter((c) => c.type === "channel").length;
  TG(token, "sendMessage", { chat_id: cid, parse_mode: "HTML", text: `📊 <b>Statistik Bot</b>\n\n👤 Users    : ${u}\n👥 Groups   : ${g}\n📢 Channels : ${ch}\n━━━━━━━━━━━━━━\n📋 Total    : ${cl.length}` });
}

async function cmdAddCat(token, cid, text, env, isAdm) {
  if (!isAdm) return;
  const name = text.replace(/^\/addcat\s*/i, "").trim();
  if (!name) return TG(token, "sendMessage", { chat_id: cid, text: "Format: /addcat <nama kategori>\n\nContoh: /addcat Minecraft Patch" });
  const m = await getMenu(env);
  if (!m[name]) { m[name] = {}; await saveMenu(env, m); }
  TG(token, "sendMessage", { chat_id: cid, parse_mode: "HTML", text: `✅ Kategori "<b>${escH(name)}</b>" berhasil ditambahkan ke sistem.` });
}

async function cmdDelCat(token, cid, text, env, isAdm) {
  if (!isAdm) return;
  const name = text.replace(/^\/delcat\s*/i, "").trim();
  if (!name) return TG(token, "sendMessage", { chat_id: cid, text: "Format: /delcat <nama kategori>" });
  const m = await getMenu(env);
  if (m[name]) { delete m[name]; await saveMenu(env, m); TG(token, "sendMessage", { chat_id: cid, parse_mode: "HTML", text: `✅ Kategori "<b>${escH(name)}</b>" beserta semua file di dalamnya telah dihapus.` }); }
  else TG(token, "sendMessage", { chat_id: cid, text: "❌ Kategori tidak ditemukan." });
}

async function cmdAddFile(token, cid, uid, text, env, isAdm) {
  if (!isAdm) return;
  const raw = text.replace(/^\/addfile\s*/i, "").trim();
  const parts = raw.split("|");
  if (parts.length < 2) return TG(token, "sendMessage", { chat_id: cid, text: "Format: /addfile <kategori> | <versi>\n\nContoh: /addfile Minecraft Patch | v1.21.50\n\nSetelah menjalankan perintah ini, kirim file yang ingin disimpan (APK, video, foto, dll)." });
  await setPending(env, uid, { action: "add_file", category: parts[0].trim(), version: parts[1].trim() });
  TG(token, "sendMessage", { chat_id: cid, parse_mode: "HTML", text: `✅ Mode upload file aktif!\n\n📁 Kategori : <b>${escH(parts[0].trim())}</b>\n📦 Versi    : <b>${escH(parts[1].trim())}</b>\n\nSekarang kirim file yang ingin disimpan ke dalam kategori tersebut.` });
}

async function cmdListCat(token, cid, env, isAdm) {
  if (!isAdm) return;
  const m = await getMenu(env);
  const cats = Object.keys(m);
  if (!cats.length) return TG(token, "sendMessage", { chat_id: cid, text: "📋 Belum ada kategori yang terdaftar." });
  const list = cats.map((c, i) => `${i + 1}. ${c}  —  ${Object.keys(m[c]).length} file`).join("\n");
  TG(token, "sendMessage", { chat_id: cid, parse_mode: "HTML", text: `📋 <b>Daftar Kategori</b>\n\n${list}` });
}

async function cmdHelp(token, cid, isAdm) {
  let t = `<b>📖 Pusat Bantuan — MCPATCH Bot</b>\n\n` +
    `Selamat datang di pusat bantuan! Berikut daftar perintah yang tersedia:\n\n` +
    `<b>🔹 Perintah Umum:</b>\n` +
    `/start — Memulai bot dan menampilkan menu utama\n` +
    `/menu  — Menampilkan menu utama kapan saja\n` +
    `/help  — Menampilkan pesan bantuan ini`;
  if (isAdm) {
    t += `\n\n<b>🔹 Perintah Admin:</b>\n` +
      `/admin — Membuka panel administrasi\n` +
      `/broadcast <pesan> — Mengirim pesan ke semua chat\n` +
      `/stats — Melihat statistik bot\n` +
      `/addcat <nama> — Menambah kategori file baru\n` +
      `/delcat <nama> — Menghapus kategori beserta isinya\n` +
      `/addfile <cat> | <ver> — Upload file ke kategori\n` +
      `/listcat — Melihat daftar semua kategori\n` +
      `/setinfo <teks> — Mengatur teks info bot\n` +
      `/setyoutube <teks> — Mengatur teks info YouTube\n` +
      `/setannouncement <teks> — Mengatur pengumuman\n` +
      `/setstatus <user_id> <status> — Mengatur status user\n` +
      `/addadmin <user_id> — Menambah admin baru\n` +
      `/deladmin <user_id> — Menghapus admin`;
  }
  TG(token, "sendMessage", { chat_id: cid, parse_mode: "HTML", text: t });
}

// ─── FILE UPLOAD HANDLER ─────────────────────────────────────

async function handleFileUpload(token, msg, env) {
  const uid = String(msg.from.id);
  const pend = await getPending(env, uid);
  if (!pend || pend.action !== "add_file") return false;
  let fid = null, ftype = null;
  const cap = msg.caption || "";
  if (msg.document) { fid = msg.document.file_id; ftype = "document"; }
  else if (msg.video) { fid = msg.video.file_id; ftype = "video"; }
  else if (msg.photo) { fid = msg.photo[msg.photo.length - 1].file_id; ftype = "photo"; }
  else if (msg.audio) { fid = msg.audio.file_id; ftype = "audio"; }
  else if (msg.animation) { fid = msg.animation.file_id; ftype = "animation"; }
  if (!fid) return false;
  const m = await getMenu(env);
  if (!m[pend.category]) m[pend.category] = {};
  m[pend.category][pend.version] = { file_id: fid, file_type: ftype, caption: cap, from_chat_id: msg.chat.id, message_id: msg.message_id, added_at: new Date().toISOString() };
  await saveMenu(env, m);
  await setPending(env, uid, null);
  TG(token, "sendMessage", { chat_id: msg.chat.id, parse_mode: "HTML", text: `✅ <b>File Berhasil Disimpan!</b>\n\n📁 Kategori : <b>${escH(pend.category)}</b>\n📦 Versi    : <b>${escH(pend.version)}</b>\n📄 Tipe     : ${ftype}\n\nFile ini sekarang dapat diakses oleh semua pengguna melalui menu Download App.` });
  return true;
}

// ─── CALLBACK QUERY HANDLER ───────────────────────────────────

async function handleCallback(token, q, env) {
  const { id, data, message, from } = q;
  const cid = message.chat.id;
  const mid = message.message_id;
  await TG(token, "answerCallbackQuery", { callback_query_id: id });
  const edit = (t, k) => TG(token, "editMessageText", { chat_id: cid, message_id: mid, text: t, parse_mode: "HTML", reply_markup: k });

  // ── USER MENU ──
  if (data === "m:main") return edit("🏠 <b>Menu Utama</b>\n\nPilih layanan yang kamu butuhkan di bawah ini:", mainMenuKbd());

  if (data === "m:apps") {
    const m = await getMenu(env);
    return edit("📱 <b>Download App</b>\n\nPilih kategori aplikasi yang ingin kamu unduh:", catKbd(m));
  }
  if (data === "m:yt") {
    const t = (await env.BOT_KV.get("youtube_info")) || "Belum ada informasi YouTube yang tersedia saat ini. Silakan cek kembali nanti.";
    return edit(`📺 <b>YouTube Channel</b>\n\n${t}`, backKbd());
  }
  if (data === "m:ann") {
    const t = (await env.BOT_KV.get("latest_announcement")) || "Belum ada pengumuman terbaru yang dipublikasikan. Nantikan info penting dari MCPATCH di sini.";
    return edit(`📢 <b>Pengumuman Terbaru</b>\n\n${t}`, backKbd());
  }
  if (data === "m:info") {
    const t = (await env.BOT_KV.get("bot_info")) || "MCPATCH Bot — Layanan resmi distribusi aplikasi, update patch, dan informasi terbaru seputar MCPATCH.\n\n🌐 Website: https://mcpatch.me\n\nDibangun dengan ❤️ untuk komunitas.";
    return edit(`ℹ️ <b>Tentang Bot</b>\n\n${t}`, backKbd());
  }

  if (data.startsWith("c:")) {
    const cat = data.slice(2);
    const m = await getMenu(env);
    const v = m[cat] || {};
    if (!Object.keys(v).length) return edit(`📁 <b>${escH(cat)}</b>\n\nBelum ada file yang tersedia dalam kategori ini. Silakan cek kembali nanti.`, backKbd("m:apps"));
    return edit(`📁 <b>${escH(cat)}</b>\n\nPilih versi file yang ingin kamu unduh:`, verKbd(cat, v));
  }

  if (data.startsWith("f:")) {
    const p = data.split(":");
    const cat = p[1], ver = p[2];
    const m = await getMenu(env);
    const file = m[cat]?.[ver];
    if (!file) return TG(token, "sendMessage", { chat_id: cid, text: "❌ File tidak ditemukan. Mungkin sudah dihapus oleh admin." });
    const cap = file.caption || `📦 <b>${escH(cat)}</b> — ${escH(ver)}`;
    const sendP = { chat_id: cid, caption: cap, parse_mode: "HTML" };
    const map = { document: ["sendDocument", "document"], video: ["sendVideo", "video"], photo: ["sendPhoto", "photo"], audio: ["sendAudio", "audio"], animation: ["sendAnimation", "animation"] };
    const [method, key] = map[file.file_type] || ["sendDocument", "document"];
    sendP[key] = file.file_id;
    try {
      await TG(token, method, sendP);
      await TG(token, "sendMessage", { chat_id: cid, parse_mode: "HTML", text: `✅ File <b>${escH(ver)}</b> berhasil dikirim!\n\nJika file tidak muncul, pastikan koneksi internet kamu stabil dan coba lagi.`, reply_markup: backKbd("m:main") });
    } catch { TG(token, "sendMessage", { chat_id: cid, text: "❌ Gagal mengirim file. Silakan coba lagi beberapa saat." }); }
    return;
  }

  // ── ADMIN PANEL ──
  if (!await isAdmin(env, from.id)) return;
  const isOwner = String(from.id) === String(env.ADMIN_ID);

  if (data === "a:main") {
    const cl = Object.values(await getChats(env));
    const u = cl.filter((c) => c.type === "private").length;
    const g = cl.filter((c) => c.type === "group" || c.type === "supergroup").length;
    const ch = cl.filter((c) => c.type === "channel").length;
    return edit(`🔐 <b>ADMIN PANEL</b>\n\n📊 Statistik:\n👤 Users: <b>${u}</b> | 👥 Groups: <b>${g}</b> | 📢 Channels: <b>${ch}</b> | 📋 Total: <b>${cl.length}</b>`, adminMenuKbd());
  }

  if (data === "a:users" || data.startsWith("a:users:")) {
    const pg = data.startsWith("a:users:") ? parseInt(data.split(":")[2]) : 0;
    const users = await getAllUsers(env);
    const perP = 5, start = pg * perP;
    const slice = users.slice(start, start + perP);
    const totalP = Math.ceil(users.length / perP);
    let t = `👤 <b>DAFTAR USER</b> (${users.length} total)\n\n`;
    if (!slice.length) t += "Belum ada user yang terdaftar.\n";
    for (const u of slice) {
      const dn = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "Unknown";
      const si = u.status === "Premium" ? "🌟" : u.status === "VIP" ? "💎" : u.status === "Banned" ? "🚫" : "⚪";
      t += `━━━━━━━━━━━━━━━━━━\n📛 <b>${escH(dn)}</b>\n🆔 <code>${u.id}</code>\n`;
      if (u.username) t += `🔖 @${escH(u.username)}\n`;
      t += `⭐ Status: ${si} ${escH(u.status)}\n📅 ${new Date(u.joined_at).toLocaleDateString("id-ID")}\n\n`;
    }
    const kb = [];
    const nav = [];
    if (pg > 0) nav.push({ text: "⬅️ Sebelumnya", callback_data: `a:users:${pg - 1}` });
    if (pg < totalP - 1) nav.push({ text: "Selanjutnya ➡️", callback_data: `a:users:${pg + 1}` });
    if (nav.length) kb.push(nav);
    kb.push([{ text: "🔙 Kembali", callback_data: "a:main" }]);
    return edit(t, kbd(kb));
  }

  if (data === "a:bcast") {
    await setPending(env, from.id, { action: "admin_bcast" });
    return edit(`📢 <b>KIRIM BROADCAST</b>\n\nKetik pesan yang ingin dikirim ke <b>semua user</b>, group, dan channel yang terdaftar.\n\n💡 Gunakan HTML untuk formatting:\n<b>teks bold</b>\n<i>teks italic</i>\n<a href="url">link</a>\n<code>kode</code>`, backKbd("a:main"));
  }

  if (data === "a:files") {
    const m = await getMenu(env);
    const cats = Object.keys(m);
    let t = "📁 <b>KELOLA FILE</b>\n\n";
    if (!cats.length) { t += "Belum ada kategori."; return edit(t, backKbd("a:main")); }
    for (const c of cats) {
      const vc = Object.keys(m[c]).length;
      t += `📂 <b>${escH(c)}</b> — ${vc} file\n`;
      for (const v of Object.keys(m[c])) t += `   📦 ${escH(v)}\n`;
      t += "\n";
    }
    return edit(t, backKbd("a:main"));
  }

  if (data === "a:ann") {
    const cur = (await env.BOT_KV.get("latest_announcement")) || "(kosong)";
    return edit(`📝 <b>KELOLA PENGUMUMAN</b>\n\nPengumuman saat ini:\n${cur}\n\nPilih aksi:`, kbd([
      [{ text: "✏️ Set Pengumuman Baru", callback_data: "a:set_ann" }, { text: "🗑 Hapus Pengumuman", callback_data: "a:clr_ann" }],
      [{ text: "🔙 Kembali", callback_data: "a:main" }],
    ]));
  }
  if (data === "a:set_ann") {
    await setPending(env, from.id, { action: "set_announcement" });
    return edit(`📝 <b>SET PENGUMUMAN BARU</b>\n\nKetik teks pengumuman yang ingin ditampilkan ke semua user:`, backKbd("a:ann"));
  }
  if (data === "a:clr_ann") {
    await env.BOT_KV.delete("latest_announcement");
    return edit(`✅ Pengumuman berhasil dihapus.`, backKbd("a:ann"));
  }

  if (data === "a:yt") {
    const cur = (await env.BOT_KV.get("youtube_info")) || "(kosong)";
    return edit(`📺 <b>KELOLA INFO YOUTUBE</b>\n\nInfo saat ini:\n${cur}\n\nPilih aksi:`, kbd([
      [{ text: "✏️ Set Info YouTube Baru", callback_data: "a:set_yt" }, { text: "🗑 Hapus Info YouTube", callback_data: "a:clr_yt" }],
      [{ text: "🔙 Kembali", callback_data: "a:main" }],
    ]));
  }
  if (data === "a:set_yt") {
    await setPending(env, from.id, { action: "set_youtube" });
    return edit(`📺 <b>SET INFO YOUTUBE BARU</b>\n\nKetik teks info YouTube Channel yang ingin ditampilkan:`, backKbd("a:yt"));
  }
  if (data === "a:clr_yt") {
    await env.BOT_KV.delete("youtube_info");
    return edit(`✅ Info YouTube berhasil dihapus.`, backKbd("a:yt"));
  }

  if (data === "a:set") {
    return edit(`⚙️ <b>PENGATURAN BOT</b>\n\nPilih pengaturan yang ingin diubah:`, kbd([
      [{ text: "ℹ️ Set Info Bot", callback_data: "a:set_info" }, { text: "🗑 Hapus Info Bot", callback_data: "a:clr_info" }],
      [{ text: "🔙 Kembali", callback_data: "a:main" }],
    ]));
  }
  if (data === "a:set_info") {
    await setPending(env, from.id, { action: "set_info" });
    return edit(`ℹ️ <b>SET INFO BOT BARU</b>\n\nKetik teks info bot yang ingin ditampilkan:`, backKbd("a:set"));
  }
  if (data === "a:clr_info") {
    await env.BOT_KV.delete("bot_info");
    return edit(`✅ Info bot berhasil dihapus.`, backKbd("a:set"));
  }

  if (data === "a:adms") {
    const adms = await getAdmins(env);
    let t = "📋 <b>DAFTAR ADMIN</b>\n\n";
    for (const [id, a] of Object.entries(adms)) {
      t += `${a.role === "owner" ? "👑" : "🛡️"} <code>${id}</code> — ${a.role}\n📅 Ditambahkan: ${new Date(a.added_at).toLocaleDateString("id-ID")}\n\n`;
    }
    if (isOwner) {
      return edit(t, kbd([[{ text: "➕ Tambah Admin Baru", callback_data: "a:add_adm" }], [{ text: "🔙 Kembali", callback_data: "a:main" }]]));
    }
    return edit(t, backKbd("a:main"));
  }
  if (data === "a:add_adm") {
    await setPending(env, from.id, { action: "add_admin" });
    return edit(`➕ <b>TAMBAH ADMIN BARU</b>\n\nKirim User ID yang ingin dijadikan admin:\n\n💡 Cara mendapat User ID: user kirim pesan ke bot, lalu cek di menu Kelola User.`, backKbd("a:adms"));
  }

  if (data === "a:wh") {
    const whUrl = `${new URL(env.WEBHOOK_URL || "https://placeholder.workers.dev").origin}/webhook`;
    await TG(token, "setWebhook", { url: whUrl, secret_token: env.WEBHOOK_SECRET, allowed_updates: ["message", "callback_query", "my_chat_member", "chat_member"] });
    return edit(`🔗 <b>WEBHOOK SETUP</b>\n\n✅ Webhook berhasil dikonfigurasi!\n📡 URL: <code>${escH(whUrl)}</code>`, backKbd("a:main"));
  }
}

// ─── WEBHOOK HANDLER ─────────────────────────────────────────

async function handleWebhook(request, env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== env.WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
  const token = env.BOT_TOKEN;
  const adminId = String(env.ADMIN_ID);
  let update;
  try { update = await request.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  if (update.message) {
    const msg = update.message;
    const chat = msg.chat;
    const user = msg.from;
    const isAdm = user ? await isAdmin(env, user.id) : false;
    const isOwner = user ? String(user.id) === adminId : false;
    const text = msg.text || "";

    if (msg.new_chat_members) {
      const me = await TG(token, "getMe");
      if (me.result && msg.new_chat_members.some((m) => m.id === me.result.id)) {
        await addChat(env, chat);
        TG(token, "sendMessage", { chat_id: chat.id, text: "👋 Halo! Bot MCPATCH sudah aktif di sini. Semua pengumuman dan broadcast dari admin akan otomatis diteruskan ke chat ini." });
      }
    }
    if (msg.left_chat_member) {
      const me = await TG(token, "getMe");
      if (me.result && msg.left_chat_member.id === me.result.id) await removeChat(env, chat.id);
    }

    // Update last_active for user profiles
    if (user) {
      const p = await getUser(env, user.id);
      if (p) { p.last_active = new Date().toISOString(); await saveUser(env, user.id, p); }
    }

    // Handle pending admin actions
    if (user) {
      const pend = await getPending(env, user.id);
      if (pend) {
        if (pend.action === "admin_bcast") {
          await setPending(env, user.id, null);
          if (text.trim()) return cmdBroadcast(token, { ...msg, text: "/broadcast " + text.trim() }, env, true);
        }
        if (pend.action === "set_announcement") {
          await setPending(env, user.id, null);
          await env.BOT_KV.put("latest_announcement", text);
          return TG(token, "sendMessage", { chat_id: chat.id, text: "✅ Pengumuman berhasil diperbarui!", reply_markup: backKbd("a:ann") });
        }
        if (pend.action === "set_youtube") {
          await setPending(env, user.id, null);
          await env.BOT_KV.put("youtube_info", text);
          return TG(token, "sendMessage", { chat_id: chat.id, text: "✅ Info YouTube berhasil diperbarui!", reply_markup: backKbd("a:yt") });
        }
        if (pend.action === "set_info") {
          await setPending(env, user.id, null);
          await env.BOT_KV.put("bot_info", text);
          return TG(token, "sendMessage", { chat_id: chat.id, text: "✅ Info bot berhasil diperbarui!", reply_markup: backKbd("a:set") });
        }
        if (pend.action === "add_admin") {
          await setPending(env, user.id, null);
          const tid = text.trim();
          if (!/^\d+$/.test(tid)) return TG(token, "sendMessage", { chat_id: chat.id, text: "❌ Format tidak valid. Kirim angka User ID saja.", reply_markup: backKbd("a:adms") });
          const adms = await getAdmins(env);
          adms[tid] = { id: tid, role: "admin", added_at: new Date().toISOString() };
          await saveAdmins(env, adms);
          return TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: `✅ Admin baru ditambahkan!\n🆔 ID: <code>${tid}</code>`, reply_markup: backKbd("a:adms") });
        }
      }
    }

    // File upload for /addfile
    if (isAdm && (msg.document || msg.video || msg.photo || msg.audio || msg.animation)) {
      const handled = await handleFileUpload(token, msg, env);
      if (handled) return new Response("OK");
    }

    // Commands
    if (text.match(/^\/start/i)) await cmdStart(token, chat, user, env);
    else if (text.match(/^\/menu/i)) {
      await addChat(env, chat);
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "🏠 <b>Menu Utama</b>\n\nPilih layanan yang kamu butuhkan:", reply_markup: mainMenuKbd() });
    }
    else if (text.match(/^\/admin/i)) await cmdAdmin(token, chat, user, env);
    else if (text.match(/^\/broadcast/i)) await cmdBroadcast(token, msg, env, isAdm);
    else if (text.match(/^\/stats/i)) await cmdStats(token, chat.id, env, isAdm);
    else if (text.match(/^\/addcat/i)) await cmdAddCat(token, chat.id, text, env, isAdm);
    else if (text.match(/^\/delcat/i)) await cmdDelCat(token, chat.id, text, env, isAdm);
    else if (text.match(/^\/addfile/i)) await cmdAddFile(token, chat.id, String(user.id), text, env, isAdm);
    else if (text.match(/^\/listcat/i)) await cmdListCat(token, chat.id, env, isAdm);
    else if (text.match(/^\/help/i)) await cmdHelp(token, chat.id, isAdm);
    else if (text.match(/^\/setinfo/i) && isAdm) {
      const v = text.replace(/^\/setinfo\s*/i, "").trim();
      await env.BOT_KV.put("bot_info", v);
      TG(token, "sendMessage", { chat_id: chat.id, text: "✅ Info bot berhasil diperbarui!" });
    }
    else if (text.match(/^\/setyoutube/i) && isAdm) {
      const v = text.replace(/^\/setyoutube\s*/i, "").trim();
      await env.BOT_KV.put("youtube_info", v);
      TG(token, "sendMessage", { chat_id: chat.id, text: "✅ Info YouTube berhasil diperbarui!" });
    }
    else if (text.match(/^\/setannouncement/i) && isAdm) {
      const v = text.replace(/^\/setannouncement\s*/i, "").trim();
      await env.BOT_KV.put("latest_announcement", v);
      TG(token, "sendMessage", { chat_id: chat.id, text: "✅ Pengumuman berhasil diperbarui!" });
    }
    else if (text.match(/^\/setstatus/i) && isOwner) {
      const parts = text.replace(/^\/setstatus\s*/i, "").trim().split(/\s+/);
      if (parts.length < 2) return TG(token, "sendMessage", { chat_id: chat.id, text: "Format: /setstatus <user_id> <Standard|Premium|VIP|Banned>" });
      const uid = parts[0], status = parts.slice(1).join(" ");
      const p
