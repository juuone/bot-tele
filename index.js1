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
      const p = await getUser(env, uid);
      if (!p) return TG(token, "sendMessage", { chat_id: chat.id, text: "❌ User tidak ditemukan." });
      p.status = status;
      await saveUser(env, uid, p);
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: `✅ Status user <code>${uid}</code> diubah menjadi <b>${escH(status)}</b>` });
    }
    else if (text.match(/^\/addadmin/i) && isOwner) {
      const tid = text.replace(/^\/addadmin\s*/i, "").trim();
      if (!/^\d+$/.test(tid)) return TG(token, "sendMessage", { chat_id: chat.id, text: "Format: /addadmin <user_id>" });
      const adms = await getAdmins(env);
      adms[tid] = { id: tid, role: "admin", added_at: new Date().toISOString() };
      await saveAdmins(env, adms);
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: `✅ Admin baru ditambahkan!\n🆔 ID: <code>${tid}</code>` });
    }
    else if (text.match(/^\/deladmin/i) && isOwner) {
      const tid = text.replace(/^\/deladmin\s*/i, "").trim();
      if (tid === adminId) return TG(token, "sendMessage", { chat_id: chat.id, text: "❌ Tidak dapat menghapus owner." });
      const adms = await getAdmins(env);
      if (adms[tid]) { delete adms[tid]; await saveAdmins(env, adms); TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: `✅ Admin <code>${tid}</code> dihapus.` }); }
      else TG(token, "sendMessage", { chat_id: chat.id, text: "❌ Admin tidak ditemukan." });
    }
  }

  if (update.callback_query) await handleCallback(token, update.callback_query, env);

  if (update.my_chat_member) {
    const { chat, new_chat_member: ncm } = update.my_chat_member;
    const s = ncm?.status;
    if (s === "member" || s === "administrator") await addChat(env, chat);
    else if (s === "kicked" || s === "left") await removeChat(env, chat.id);
  }

  return new Response("OK");
}

// ─── API HANDLERS ─────────────────────────────────────────────

function checkAuth(req, env) {
  const url = new URL(req.url);
  const h = req.headers.get("X-Dashboard-Password");
  const q = url.searchParams.get("k");
  return h === env.DASHBOARD_PASSWORD || q === env.DASHBOARD_PASSWORD;
}
function json(d, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}

async function handleAPI(req, env, url) {
  const path = url.pathname.replace(/^\/api\//, "");

  if (path === "check-config") return json({ pw_set: !!env.DASHBOARD_PASSWORD, token_set: !!env.BOT_TOKEN, kv_set: !!env.BOT_KV });
  if (path === "verify") return json({ ok: checkAuth(req, env) });
  if (!checkAuth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);

  const token = env.BOT_TOKEN;

  if (path === "chat-list") return json({ ok: true, chats: await getChats(env) });
  if (path === "remove-chat") { const { chat_id } = await req.json(); await removeChat(env, chat_id); return json({ ok: true }); }

  if (path === "user-list") return json({ ok: true, users: await getAllUsers(env) });
  if (path === "set-user-status") {
    const { user_id, status } = await req.json();
    const p = await getUser(env, user_id);
    if (p) { p.status = status; await saveUser(env, user_id, p); }
    return json({ ok: true });
  }
  if (path === "remove-user") {
    const { user_id } = await req.json();
    await env.BOT_KV.delete("user:" + user_id);
    return json({ ok: true });
  }

  if (path === "get-files") return json({ ok: true, menu: await getMenu(env) });
  if (path === "add-category") { const { name } = await req.json(); const m = await getMenu(env); if (!m[name]) { m[name] = {}; await saveMenu(env, m); } return json({ ok: true }); }
  if (path === "delete-category") { const { name } = await req.json(); const m = await getMenu(env); delete m[name]; await saveMenu(env, m); return json({ ok: true }); }
  if (path === "add-file") {
    const b = await req.json(); const m = await getMenu(env);
    if (!m[b.category]) m[b.category] = {};
    m[b.category][b.version] = { file_id: b.file_id, file_type: b.file_type || "document", caption: b.caption || "", added_at: new Date().toISOString() };
    await saveMenu(env, m); return json({ ok: true });
  }
  if (path === "delete-file") { const { category, version } = await req.json(); const m = await getMenu(env); if (m[category]) delete m[category][version]; await saveMenu(env, m); return json({ ok: true }); }

  if (path === "broadcast") {
    const b = await req.json(); const chats = await getChats(env);
    let list = Object.values(chats);
    if (b.target === "users") list = list.filter((c) => c.type === "private");
    else if (b.target === "groups") list = list.filter((c) => c.type === "group" || c.type === "supergroup");
    else if (b.target === "channels") list = list.filter((c) => c.type === "channel");
    let ok = 0, fail = 0;
    for (const c of list) {
      let r;
      try {
        if (b.mode === "text") r = await TG(token, "sendMessage", { chat_id: c.id, text: b.text, parse_mode: "HTML" });
        else if (b.mode === "photo") r = await TG(token, "sendPhoto", { chat_id: c.id, photo: b.photo, caption: b.caption, parse_mode: "HTML" });
        else if (b.mode === "video") r = await TG(token, "sendVideo", { chat_id: c.id, video: b.video, caption: b.caption, parse_mode: "HTML" });
        if (r?.ok) ok++; else { fail++; if (r?.error_code === 403) await removeChat(env, c.id); }
      } catch { fail++; }
    }
    return json({ ok: true, success: ok, failed: fail });
  }

  if (path === "get-settings") {
    const [bi, yt, an] = await Promise.all([env.BOT_KV.get("bot_info"), env.BOT_KV.get("youtube_info"), env.BOT_KV.get("latest_announcement")]);
    return json({ ok: true, bot_info: bi, youtube_info: yt, latest_announcement: an });
  }
  if (path === "save-setting") {
    const { key, value } = await req.json();
    if (!["bot_info", "youtube_info", "latest_announcement"].includes(key)) return json({ ok: false, error: "Invalid key" });
    await env.BOT_KV.put(key, value); return json({ ok: true });
  }
  if (path === "clear-setting") {
    const { key } = await req.json();
    if (!["bot_info", "youtube_info", "latest_announcement"].includes(key)) return json({ ok: false, error: "Invalid key" });
    await env.BOT_KV.delete(key); return json({ ok: true });
  }

  if (path === "admin-list") return json({ ok: true, admins: await getAdmins(env) });
  if (path === "add-admin") {
    const { user_id } = await req.json();
    const adms = await getAdmins(env);
    adms[user_id] = { id: user_id, role: "admin", added_at: new Date().toISOString() };
    await saveAdmins(env, adms); return json({ ok: true });
  }
  if (path === "remove-admin") {
    const { user_id } = await req.json();
    if (String(user_id) === String(env.ADMIN_ID)) return json({ ok: false, error: "Cannot remove owner" });
    const adms = await getAdmins(env); delete adms[user_id]; await saveAdmins(env, adms); return json({ ok: true });
  }

  if (path === "setup-webhook") {
    const whUrl = url.origin + "/webhook";
    const r = await TG(token, "setWebhook", { url: whUrl, secret_token: env.WEBHOOK_SECRET, allowed_updates: ["message", "callback_query", "my_chat_member", "chat_member"] });
    return json({ ok: r.ok, result: r });
  }

  return json({ ok: false, error: "Not found" }, 404);
}

// ─── SVG ICONS ────────────────────────────────────────────────

const SVG = {
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
};

function ico(name, size = 20) {
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;flex-shrink:0">${SVG[name] || SVG.grid}</span>`;
}

// ─── LOGIN HTML ───────────────────────────────────────────────

function loginHTML(origin) {
  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login — MCPATCH Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Plus Jakarta Sans',sans-serif;background:#06060f;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;overflow:hidden}
.bg-glow{position:fixed;inset:0;z-index:0;pointer-events:none}
.bg-glow::before,.bg-glow::after{content:'';position:absolute;border-radius:50%;filter:blur(120px);opacity:.12}
.bg-glow::before{width:500px;height:500px;background:#6366f1;top:-150px;right:-100px;animation:fl 18s ease-in-out infinite}
.bg-glow::after{width:400px;height:400px;background:#a855f7;bottom:-150px;left:-100px;animation:fl 18s ease-in-out infinite reverse}
@keyframes fl{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-40px,40px) scale(1.1)}}
.card{position:relative;z-index:1;width:100%;max-width:400px;padding:2.5rem 2rem;background:rgba(255,255,255,.03);backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);border:1px solid rgba(255,255,255,.08);border-radius:24px;box-shadow:0 32px 64px rgba(0,0,0,.4)}
.logo{width:64px;height:64px;margin:0 auto 1.25rem;background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 32px rgba(99,102,241,.3)}
.logo svg{width:32px;height:32px;color:#fff}
h1{text-align:center;font-size:1.35rem;font-weight:700;margin-bottom:.35rem;background:linear-gradient(135deg,#c7d2fe,#e9d5ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sub{text-align:center;font-size:.85rem;color:#64748b;margin-bottom:2rem;line-height:1.5}
label{display:block;font-size:.8rem;font-weight:600;color:#94a3b8;margin-bottom:.4rem;letter-spacing:.03em}
input{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;color:#e2e8f0;padding:.85rem 1.1rem;font-size:.95rem;font-family:inherit;transition:.2s}
input:focus{outline:none;border-color:rgba(99,102,241,.5);box-shadow:0 0 0 3px rgba(99,102,241,.15)}
button{width:100%;margin-top:.5rem;padding:.85rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:14px;font-size:.95rem;font-weight:700;font-family:inherit;cursor:pointer;transition:.2s;box-shadow:0 4px 20px rgba(99,102,241,.3)}
button:hover{transform:translateY(-1px);box-shadow:0 8px 30px rgba(99,102,241,.4)}
button:active{transform:translateY(0)}
.hint{margin-top:1.5rem;text-align:center;font-size:.78rem;color:#475569;line-height:1.6}
code{background:rgba(255,255,255,.06);padding:.15rem .5rem;border-radius:6px;color:#a5b4fc;font-size:.75rem}
</style></head><body>
<div class="bg-glow"></div>
<div class="card">
  <div class="logo">${SVG.shield}</div>
  <h1>MCPATCH Dashboard</h1>
  <p class="sub">Masukkan password untuk mengakses panel administrasi bot</p>
  <form method="GET" action="${origin}/dashboard">
    <label>PASSWORD</label>
    <input type="password" name="k" placeholder="Ketik password..." autofocus autocomplete="current-password">
    <button type="submit">Masuk</button>
  </form>
  <div class="hint">Password dikonfigurasi sebagai variabel <code>DASHBOARD_PASSWORD</code> di Cloudflare Workers</div>
</div>
</body></html>`;
}

// ─── DASHBOARD HTML ───────────────────────────────────────────

function dashboardHTML(origin, k) {
  const safeK = k.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/</g, "\\x3c").replace(/>/g, "\\x3e");
  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCPATCH Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#06060f;--g1:rgba(255,255,255,.025);--g2:rgba(255,255,255,.05);--g3:rgba(255,255,255,.08);--bd:rgba(255,255,255,.06);--bd2:rgba(255,255,255,.1);--acc:#818cf8;--acc2:#a78bfa;--acc-bg:rgba(129,140,248,.08);--grn:#34d399;--red:#f87171;--ylw:#fbbf24;--txt:#e2e8f0;--txt2:#94a3b8;--mut:#475569;--r:16px;--rs:10px;--rxs:6px}
body{font-family:'Plus Jakarta Sans',sans-serif;background:var(--bg);color:var(--txt);min-height:100vh;overflow-x:hidden}
.bg-glow{position:fixed;inset:0;z-index:0;pointer-events:none}
.bg-glow::before,.bg-glow::after{content:'';position:absolute;border-radius:50%;filter:blur(140px);opacity:.08}
.bg-glow::before{width:700px;height:700px;background:#6366f1;top:-250px;right:-200px;animation:fl 25s ease-in-out infinite}
.bg-glow::after{width:500px;height:500px;background:#a855f7;bottom:-200px;left:-150px;animation:fl 25s ease-in-out infinite reverse}
@keyframes fl{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(-60px,60px) scale(1.1)}66%{transform:translate(60px,-40px) scale(.95)}}

/* TOPBAR */
.topbar{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:.85rem 1.5rem;background:rgba(6,6,15,.7);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);border-bottom:1px solid var(--bd)}
.topbar-left{display:flex;align-items:center;gap:.75rem}
.topbar-logo{width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.topbar-logo svg{width:18px;height:18px;color:#fff}
.topbar h1{font-size:1.05rem;font-weight:700;background:linear-gradient(135deg,#c7d2fe,#e9d5ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.online{display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:var(--grn);font-weight:500}
.dot{width:7px;height:7px;background:var(--grn);border-radius:50%;box-shadow:0 0 8px var(--grn);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.logout-btn{background:var(--g2);border:1px solid var(--bd);color:var(--txt2);border-radius:var(--rs);padding:.4rem .7rem;cursor:pointer;font-size:.8rem;font-family:inherit;display:flex;align-items:center;gap:.35rem;transition:.15s}
.logout-btn:hover{border-color:var(--red);color:var(--red)}

/* LAYOUT */
.wrapper{position:relative;z-index:1;display:grid;grid-template-columns:230px 1fr;min-height:calc(100vh - 57px)}
@media(max-width:768px){.wrapper{grid-template-columns:1fr}.sidebar{display:flex!important;overflow-x:auto;border-right:none!important;border-bottom:1px solid var(--bd);padding:.5rem!important;gap:.25rem}.nav-item{white-space:nowrap;padding:.5rem .7rem!important;font-size:.8rem!important}.nav-ico{display:none!important}}

/* SIDEBAR */
.sidebar{background:rgba(6,6,15,.5);backdrop-filter:blur(20px);border-right:1px solid var(--bd);padding:1rem .75rem;display:flex;flex-direction:column;gap:.2rem}
.nav-item{display:flex;align-items:center;gap:.65rem;padding:.7rem .85rem;border-radius:var(--rs);cursor:pointer;color:var(--mut);font-size:.875rem;font-weight:500;transition:.15s;user-select:none}
.nav-item:hover{background:var(--g2);color:var(--txt2)}
.nav-item.active{background:var(--acc-bg);color:var(--acc);font-weight:600}
.nav-ico{width:20px;height:20px;flex-shrink:0;opacity:.7}
.nav-item.active .nav-ico{opacity:1}
.nav-sep{height:1px;background:var(--bd);margin:.5rem .5rem}

/* MAIN */
main{padding:1.5rem;max-width:1050px;width:100%}
.page{display:none}.page.active{display:block}
.page-title{font-size:1.15rem;font-weight:700;margin-bottom:1.25rem;display:flex;align-items:center;gap:.5rem}
.page-title svg{width:22px;height:22px;color:var(--acc)}

/* GLASS CARD */
.card{background:var(--g1);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--bd);border-radius:var(--r);padding:1.25rem;margin-bottom:1.25rem;transition:.2s}
.card:hover{border-color:var(--bd2)}
.card-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}
.card-title{font-size:.9rem;font-weight:600;color:var(--acc);display:flex;align-items:center;gap:.45rem}
.card-title svg{width:18px;height:18px}

/* STATS */
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1rem;margin-bottom:1.25rem}
.stat{background:var(--g2);backdrop-filter:blur(20px);border:1px solid var(--bd);border-radius:var(--rs);padding:1.1rem;text-align:center;transition:.2s}
.stat:hover{border-color:var(--bd2);transform:translateY(-2px)}
.stat-n{font-size:2rem;font-weight:800;background:linear-gradient(135deg,#c7d2fe,#e9d5ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1.1}
.stat-l{font-size:.72rem;color:var(--mut);margin-top:.35rem;font-weight:500;letter-spacing:.04em;text-transform:uppercase}

/* FORM */
label{display:block;font-size:.8rem;font-weight:600;color:var(--txt2);margin-bottom:.4rem;letter-spacing:.03em}
input,textarea,select{width:100%;background:var(--g2);border:1px solid var(--bd);border-radius:var(--rxs);color:var(--txt);padding:.65rem .85rem;font-size:.875rem;font-family:inherit;transition:.15s}
input:focus,textarea:focus,select:focus{outline:none;border-color:rgba(129,140,248,.4);box-shadow:0 0 0 3px rgba(129,140,248,.1)}
textarea{resize:vertical;min-height:100px}
select{cursor:pointer}
.fg{margin-bottom:1rem}
.row{display:flex;gap:.75rem;flex-wrap:wrap}
.row .fg{flex:1;min-width:180px}

/* BUTTONS */
.btn{padding:.6rem 1.15rem;border:none;border-radius:var(--rxs);cursor:pointer;font-size:.85rem;font-weight:600;font-family:inherit;transition:.15s;display:inline-flex;align-items:center;gap:.4rem;white-space:nowrap}
.btn svg{width:16px;height:16px}
.btn-p{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;box-shadow:0 2px 12px rgba(99,102,241,.25)}.btn-p:hover{box-shadow:0 4px 20px rgba(99,102,241,.4);transform:translateY(-1px)}
.btn-g{background:var(--grn);color:#fff;box-shadow:0 2px 12px rgba(52,211,153,.2)}.btn-g:hover{box-shadow:0 4px 16px rgba(52,211,153,.35)}
.btn-d{background:rgba(248,113,113,.15);color:var(--red);border:1px solid rgba(248,113,113,.2)}.btn-d:hover{background:rgba(248,113,113,.25)}
.btn-gh{background:var(--g2);color:var(--txt2);border:1px solid var(--bd)}.btn-gh:hover{border-color:var(--bd2);color:var(--txt)}
.btn-sm{padding:.35rem .7rem;font-size:.78rem;border-radius:var(--rxs)}
.btn-sm svg{width:14px;height:14px}
.btn-lg{padding:.85rem 1.5rem;font-size:.95rem;border-radius:var(--rs)}

/* ALERT */
.alert{padding:.75rem 1rem;border-radius:var(--rxs);font-size:.85rem;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem;animation:fadeIn .3s}
.alert-ok{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.2);color:#6ee7b7}
.alert-err{background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.2);color:#fca5a5}
.alert-info{background:rgba(129,140,248,.1);border:1px solid rgba(129,140,248,.2);color:#a5b4fc}
@keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}

/* MODE TABS */
.mtabs{display:flex;gap:.35rem;margin-bottom:1rem}
.mtab{padding:.45rem .85rem;border-radius:var(--rxs);border:1px solid var(--bd);cursor:pointer;font-size:.82rem;color:var(--mut);font-weight:500;transition:.15s;font-family:inherit;background:transparent}
.mtab.active{background:var(--acc-bg);border-color:rgba(129,140,248,.3);color:var(--acc)}
.mtab:hover{color:var(--txt2)}

/* TABLE */
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.84rem}
th{color:var(--mut);font-weight:600;padding:.65rem .75rem;border-bottom:1px solid var(--bd);text-align:left;white-space:nowrap;font-size:.75rem;letter-spacing:.04em;text-transform:uppercase}
td{padding:.6rem .75rem;border-bottom:1px solid var(--bd);vertical-align:middle}
tr:last-child td{border:none}
tr:hover td{background:rgba(255,255,255,.015)}

/* BADGES */
.badge{padding:.18rem .55rem;border-radius:20px;font-size:.7rem;font-weight:700;letter-spacing:.02em}
.b-pvt{background:rgba(99,102,241,.15);color:#a5b4fc}
.b-grp{background:rgba(52,211,153,.12);color:#6ee7b7}
.b-sgrp{background:rgba(251,191,36,.12);color:#fcd34d}
.b-ch{background:rgba(248,113,113,.12);color:#fca5a5}
.b-std{background:rgba(148,163,184,.12);color:#94a3b8}
.b-pre{background:rgba(251,191,36,.15);color:#fbbf24}
.b-vip{background:rgba(168,85,247,.15);color:#c084fc}
.b-ban{background:rgba(248,113,113,.15);color:#f87171}

/* PROGRESS */
.prog-wrap{background:var(--g2);border-radius:20px;height:6px;overflow:hidden}
.prog{height:100%;background:linear-gradient(90deg,var(--acc),var(--acc2));border-radius:20px;transition:width .4s}

/* FILE TREE */
.tree-cat{background:var(--g2);border:1px solid var(--bd);border-radius:var(--rs);overflow:hidden;margin-bottom:.75rem}
.tree-hd{padding:.65rem 1rem;background:rgba(129,140,248,.06);display:flex;justify-content:space-between;align-items:center;font-weight:600;color:var(--acc);font-size:.875rem}
.tree-file{padding:.5rem 1rem;border-top:1px solid var(--bd);display:flex;justify-content:space-between;align-items:center;font-size:.84rem}
.tree-file:hover{background:rgba(255,255,255,.015)}

/* AVATAR */
.avatar{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;color:#fff;flex-shrink:0}
.mono{font-family:'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;font-size:.78rem;color:var(--mut)}

/* SEND ALL CARD */
.send-all-card{background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(168,85,247,.08));border:1px solid rgba(129,140,248,.15);border-radius:var(--r);padding:1.5rem;margin-bottom:1.25rem;text-align:center}
.send-all-card h3{font-size:1rem;font-weight:700;margin-bottom:.35rem;color:var(--acc)}
.send-all-card p{font-size:.82rem;color:var(--txt2);margin-bottom:1rem}

/* EMPTY STATE */
.empty{text-align:center;padding:2rem;color:var(--mut);font-size:.88rem}
.empty svg{width:48px;height:48px;opacity:.3;margin-bottom:.75rem}

/* STATUS SELECT */
.status-sel{background:var(--g2);border:1px solid var(--bd);border-radius:var(--rxs);color:var(--txt);padding:.3rem .5rem;font-size:.78rem;font-family:inherit;cursor:pointer}
.status-sel:focus{outline:none;border-color:rgba(129,140,248,.4)}
</style>
</head>
<body>
<div class="bg-glow"></div>

<div class="topbar">
  <div class="topbar-left">
    <div class="topbar-logo">${SVG.shield}</div>
    <h1>MCPATCH Dashboard</h1>
  </div>
  <div style="display:flex;align-items:center;gap:1rem">
    <div class="online"><div class="dot"></div><span>Online</span></div>
    <button class="logout-btn" onclick="location.href='${origin}/dashboard'">${SVG.logout} Keluar</button>
  </div>
</div>

<div class="wrapper">
  <nav class="sidebar">
    <div class="nav-item active" onclick="go('overview',this)"><span class="nav-ico">${SVG.grid}</span>Overview</div>
    <div class="nav-item" onclick="go('broadcast',this)"><span class="nav-ico">${SVG.send}</span>Kirim ke Semua</div>
    <div class="nav-item" onclick="go('users',this)"><span class="nav-ico">${SVG.users}</span>Daftar User</div>
    <div class="nav-item" onclick="go('chats',this)"><span class="nav-ico">${SVG.chat}</span>Chat List</div>
    <div class="nav-sep"></div>
    <div class="nav-item" onclick="go('files',this)"><span class="nav-ico">${SVG.folder}</span>File Manager</div>
    <div class="nav-item" onclick="go('settings',this)"><span class="nav-ico">${SVG.gear}</span>Pengaturan</div>
    <div class="nav-item" onclick="go('admins',this)"><span class="nav-ico">${SVG.shield}</span>Admin</div>
  </nav>

  <main>
    <div id="gAlert"></div>

    <!-- OVERVIEW -->
    <div class="page active" id="page-overview">
      <div class="page-title">${SVG.grid} Overview</div>
      <div class="stats-row">
        <div class="stat"><div class="stat-n" id="stT">0</div><div class="stat-l">Total Chat</div></div>
        <div class="stat"><div class="stat-n" id="stU">0</div><div class="stat-l">Users</div></div>
        <div class="stat"><div class="stat-n" id="stG">0</div><div class="stat-l">Groups</div></div>
        <div class="stat"><div class="stat-n" id="stC">0</div><div class="stat-l">Channels</div></div>
      </div>
      <div class="send-all-card">
        <h3>📤 Kirim Pesan ke Semua</h3>
        <p>Broadcast instan ke seluruh user, group, dan channel yang terdaftar</p>
        <button class="btn btn-p btn-lg" onclick="go('broadcast',document.querySelectorAll('.nav-item')[1])">${SVG.send} Buat Broadcast</button>
      </div>
      <div class="card">
        <div class="card-hd"><div class="card-title">${SVG.link} Webhook Configuration</div></div>
        <p style="font-size:.8rem;color:var(--mut);margin-bottom:.5rem">Endpoint URL:</p>
        <code class="mono" id="whUrl" style="display:block;background:var(--g2);padding:.6rem .85rem;border-radius:var(--rxs);word-break:break-all;color:var(--acc);font-size:.78rem;margin-bottom:1rem"></code>
        <button class="btn btn-g btn-sm" onclick="setupWh()">${SVG.bolt} Setup / Refresh Webhook</button>
      </div>
    </div>

    <!-- BROADCAST -->
    <div class="page" id="page-broadcast">
      <div class="page-title">${SVG.send} Kirim ke Semua</div>
      <div class="card">
        <div class="card-hd"><div class="card-title">${SVG.edit} Buat Pesan Broadcast</div></div>
        <div class="mtabs">
          <button class="mtab active" onclick="setMode('text',this)">📝 Teks</button>
          <button class="mtab" onclick="setMode('photo',this)">🖼️ Foto</button>
          <button class="mtab" onclick="setMode('video',this)">🎬 Video</button>
        </div>
        <div id="m-text">
          <div class="fg"><label>ISI PESAN</label><textarea id="bcText" placeholder="Tulis pesan broadcast kamu di sini...&#10;&#10;Mendukung HTML:&#10;<b>bold</b>, <i>italic</i>, <a href='https://mcpatch.me'>link</a>, <code>kode</code>"></textarea></div>
        </div>
        <div id="m-photo" style="display:none">
          <div class="fg"><label>URL FOTO / FILE ID TELEGRAM</label><input id="bcPhoto" placeholder="https://example.com/gambar.jpg atau BQACAgIAAxk..."></div>
          <div class="fg"><label>CAPTION (opsional)</label><textarea id="bcPCap" style="min-height:70px" placeholder="Deskripsi foto..."></textarea></div>
        </div>
        <div id="m-video" style="display:none">
          <div class="fg"><label>URL VIDEO / FILE ID TELEGRAM</label><input id="bcVideo" placeholder="https://example.com/video.mp4 atau BQACAgIAAxk..."></div>
          <div class="fg"><label>CAPTION (opsional)</label><textarea id="bcVCap" style="min-height:70px" placeholder="Deskripsi video..."></textarea></div>
        </div>
        <div class="row">
          <div class="fg"><label>TARGET PENERIMA</label><select id="bcTarget">
            <option value="all">🌐 Semua (Users + Groups + Channels)</option>
            <option value="users">👤 Users saja</option>
            <option value="groups">👥 Groups saja</option>
            <option value="channels">📢 Channels saja</option>
          </select></div>
        </div>
        <button class="btn btn-p btn-lg" onclick="sendBc()" id="bcBtn">${SVG.send} Kirim Sekarang</button>
        <div id="bcProg" style="margin-top:1rem;display:none">
          <div style="font-size:.82rem;color:var(--txt2);margin-bottom:.4rem" id="bcStat">Mengirim...</div>
          <div class="prog-wrap"><div class="prog" id="bcBar"  style="width:0%"></div></div>
        </div>
      </div>
    </div>

    <!-- USERS -->
    <div class="page" id="page-users">
      <div class="page-title">${SVG.users} Daftar User</div>
      <div class="card">
        <div class="card-hd">
          <div class="card-title">${SVG.users} Semua User Terdaftar</div>
          <div style="display:flex;gap:.4rem">
            <input type="text" id="userQ" placeholder="Cari..." oninput="filterUsers()" style="width:200px;padding:.4rem .7rem;font-size:.82rem">
            <button class="btn btn-gh btn-sm" onclick="loadUsers()">${SVG.refresh}</button>
          </div>
        </div>
        <div id="userTable" class="tbl-wrap"><div class="empty"><div>${SVG.users}</div>Loading...</div></div>
      </div>
    </div>

    <!-- CHATS -->
    <div class="page" id="page-chats">
      <div class="page-title">${SVG.chat} Chat List</div>
      <div class="card">
        <div class="card-hd">
          <div class="card-title">${SVG.chat} Semua Chat Terdaftar</div>
          <div style="display:flex;gap:.4rem">
            <input type="text" id="chatQ" placeholder="Cari..." oninput="filterChats()" style="width:200px;padding:.4rem .7rem;font-size:.82rem">
            <button class="btn btn-gh btn-sm" onclick="loadChats()">${SVG.refresh}</button>
          </div>
        </div>
        <div id="chatTable" class="tbl-wrap"><div class="empty"><div>${SVG.chat}</div>Loading...</div></div>
      </div>
    </div>

    <!-- FILES -->
    <div class="page" id="page-files">
      <div class="page-title">${SVG.folder} File Manager</div>
      <div class="card">
        <div class="card-hd"><div class="card-title">${SVG.plus} Tambah Kategori</div></div>
        <div style="display:flex;gap:.5rem">
          <input type="text" id="newCat" placeholder="Contoh: Minecraft Patch" style="flex:1">
          <button class="btn btn-g" onclick="addCat()">${SVG.plus} Tambah</button>
        </div>
      </div>
      <div class="card">
        <div class="card-hd"><div class="card-title">${SVG.folder} Kategori & File</div></div>
        <div id="fileTree"><div class="empty"><div>${SVG.folder}</div>Loading...</div></div>
      </div>
      <div class="card">
        <div class="card-hd"><div class="card-title">${SVG.plus} Tambah File ke Kategori</div></div>
        <div class="alert alert-info">${SVG.eye} <b>Tips:</b> Kirim /addfile via Telegram bot untuk upload file langsung, atau masukkan File ID secara manual di form ini.</div>
        <div class="row">
          <div class="fg"><label>KATEGORI</label><select id="fCat"></select></div>
          <div class="fg"><label>NAMA VERSI</label><input id="fVer" placeholder="v1.21.50"></div>
        </div>
        <div class="row">
          <div class="fg"><label>FILE ID TELEGRAM</label><input id="fId" placeholder="BQACAgIAAxkBAAI..."></div>
          <div class="fg"><label>TIPE FILE</label>
            <select id="fType">
              <option value="document">📄 Document / APK</option>
              <option value="video">🎬 Video</option>
              <option value="photo">🖼️ Foto</option>
              <option value="audio">🎵 Audio</option>
            </select>
          </div>
        </div>
        <div class="fg"><label>CAPTION (opsional)</label><textarea id="fCap" style="min-height:70px" placeholder="Deskripsi file..."></textarea></div>
        <button class="btn btn-p" onclick="addFile()">${SVG.plus} Simpan File</button>
      </div>
    </div>

    <!-- SETTINGS -->
    <div class="page" id="page-settings">
      <div class="page-title">${SVG.gear} Pengaturan</div>
      <div class="card">
        <div class="card-hd">
          <div class="card-title">${SVG.eye} Teks Info Bot</div>
          <div style="display:flex;gap:.35rem">
            <button class="btn btn-p btn-sm" onclick="saveS('bot_info','sInfo','Info bot')">${SVG.check} Simpan</button>
            <button class="btn btn-d btn-sm" onclick="clearS('bot_info','sInfo','Info bot')">${SVG.trash}</button>
          </div>
        </div>
        <div class="fg" style="margin:0"><textarea id="sInfo" placeholder="Teks yang ditampilkan saat user menekan tombol Info di bot..."></textarea></div>
      </div>
      <div class="card">
        <div class="card-hd">
          <div class="card-title">${SVG.eye} Teks Info YouTube</div>
          <div style="display:flex;gap:.35rem">
            <button class="btn btn-p btn-sm" onclick="saveS('youtube_info','sYt','Info YouTube')">${SVG.check} Simpan</button>
            <button class="btn btn-d btn-sm" onclick="clearS('youtube_info','sYt','Info YouTube')">${SVG.trash}</button>
          </div>
        </div>
        <div class="fg" style="margin:0"><textarea id="sYt" placeholder="Link channel YouTube, deskripsi, dan informasi terkait..."></textarea></div>
      </div>
      <div class="card">
        <div class="card-hd">
          <div class="card-title">${SVG.send} Teks Pengumuman</div>
          <div style="display:flex;gap:.35rem">
            <button class="btn btn-p btn-sm" onclick="saveS('latest_announcement','sAnn','Pengumuman')">${SVG.check} Simpan</button>
            <button class="btn btn-d btn-sm" onclick="clearS('latest_announcement','sAnn','Pengumuman')">${SVG.trash}</button>
          </div>
        </div>
        <div class="fg" style="margin:0"><textarea id="sAnn" placeholder="Pengumuman yang akan muncul di menu Pengumuman bot..."></textarea></div>
      </div>
    </div>

    <!-- ADMINS -->
    <div class="page" id="page-admins">
      <div class="page-title">${SVG.shield} Kelola Admin</div>
      <div class="card">
        <div class="card-hd"><div class="card-title">${SVG.shield} Daftar Admin</div>
          <div style="display:flex;gap:.5rem">
            <input type="text" id="newAdmId" placeholder="User ID..." style="width:160px;padding:.4rem .7rem;font-size:.82rem">
            <button class="btn btn-g btn-sm" onclick="addAdm()">${SVG.plus} Tambah</button>
            <button class="btn btn-gh btn-sm" onclick="loadAdms()">${SVG.refresh}</button>
          </div>
        </div>
        <div id="admTable" class="tbl-wrap"><div class="empty"><div>${SVG.shield}</div>Loading...</div></div>
      </div>
    </div>

  </main>
</div>

<script>
var K='${safeK}',ORIGIN='${origin}',BASE=ORIGIN+'/api',allChats=[],allUsers=[],curMode='text';
function api(p,o){var s=p.indexOf('?')>-1?'&':'?';return fetch(BASE+'/'+p+s+'k='+encodeURIComponent(K),o||{})}
function apiJ(p,b){return api(p,b!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:undefined).then(function(r){return r.json()})}

function init(){
  document.getElementById('whUrl').textContent=ORIGIN+'/webhook';
  loadStats();loadChats();loadUsers();loadFiles();loadSettings();loadAdms();
}
window.onload=init;

function go(p,el){
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active')});
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active')});
  if(el)el.classList.add('active');
  document.getElementById('page-'+p).classList.add('active');
}

function alert2(m,t){
  t=t||'ok';var b=document.getElementById('gAlert');
  var ic=t==='ok'?SVG.check:t==='err'?SVG.x:SVG.eye;
  b.innerHTML='<div class="alert alert-'+t+'">'+ic+' '+m+'</div>';
  setTimeout(function(){b.innerHTML='';},4500);
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function avatarColor(id){var c=['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6'];return c[Math.abs(parseInt(id))%c.length]}
function fmtDate(d){if(!d)return'-';return new Date(d).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}
function fmtDateTime(d){if(!d)return'-';return new Date(d).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function statusBadge(s){var m={Standard:'b-std',Premium:'b-pre',VIP:'b-vip',Banned:'b-ban'};return '<span class="badge '+(m[s]||'b-std')+'">'+esc(s||'Standard')+'</span>'}

// ── STATS ──
function loadStats(){
  apiJ('chat-list').then(function(d){
    if(!d.ok)return;
    var cs=Object.values(d.chats);allChats=cs;
    animN('stT',cs.length);animN('stU',cs.filter(function(c){return c.type==='private'}).length);
    animN('stG',cs.filter(function(c){return c.type==='group'||c.type==='supergroup'}).length);
    animN('stC',cs.filter(function(c){return c.type==='channel'}).length);
  });
}
function animN(id,target){
  var el=document.getElementById(id);var cur=parseInt(el.textContent)||0;
  if(cur===target){el.textContent=target;return}
  var step=Math.ceil(Math.abs(target-cur)/20);var dir=target>cur?1:-1;
  var iv=setInterval(function(){cur+=step*dir;if((dir>0&&cur>=target)||(dir<0&&cur<=target)){cur=target;clearInterval(iv)}el.textContent=cur},30);
}

// ── USERS ──
function loadUsers(){
  apiJ('user-list').then(function(d){
    if(!d.ok)return;allUsers=d.users;renderUsers(allUsers);
  });
}
function renderUsers(list){
  var el=document.getElementById('userTable');
  if(!list.length){el.innerHTML='<div class="empty"><div>'+SVG.users+'</div>Belum ada user yang terdaftar.</div>';return}
  el.innerHTML='<table><thead><tr><th></th><th>Nama</th><th>ID</th><th>Username</th><th>Status</th><th>Bergabung</th><th>Aktif</th><th></th></tr></thead><tbody>'+
    list.map(function(u){
      var dn=esc([u.first_name,u.last_name].filter(Boolean).join(' ')||u.username||'Unknown');
      var init=(u.first_name||'U')[0].toUpperCase();
      return '<tr>'+
        '<td><div class="avatar" style="background:'+avatarColor(u.id)+'">'+esc(init)+'</div></td>'+
        '<td style="font-weight:600">'+dn+'</td>'+
        '<td class="mono">'+u.id+'</td>'+
        '<td>'+(u.username?'@'+esc(u.username):'<span style="color:var(--mut)">—</span>')+'</td>'+
        '<td>'+statusBadge(u.status)+'</td>'+
        '<td style="font-size:.8rem;color:var(--txt2)">'+fmtDate(u.joined_at)+'</td>'+
        '<td style="font-size:.8rem;color:var(--txt2)">'+fmtDateTime(u.last_active)+'</td>'+
        '<td><div style="display:flex;gap:.3rem">'+
          '<select class="status-sel" onchange="setUserSt('+u.id+',this.value)">'+
            ['Standard','Premium','VIP','Banned'].map(function(s){return '<option value="'+s+'"'+(u.status===s?' selected':'')+'>'+s+'</option>'}).join('')+
          '</select>'+
          '<button class="btn btn-d btn-sm" onclick="delUser('+u.id+')">'+SVG.trash+'</button>'+
        '</div></td></tr>';
    }).join('')+'</tbody></table>';
}
function filterUsers(){
  var q=document.getElementById('userQ').value.toLowerCase();
  renderUsers(allUsers.filter(function(u){
    var dn=[u.first_name,u.last_name,u.username].filter(Boolean).join(' ').toLowerCase();
    return dn.indexOf(q)>-1||String(u.id).indexOf(q)>-1||(u.status||'').toLowerCase().indexOf(q)>-1;
  }));
}
function setUserSt(uid,st){
  apiJ('set-user-status',{user_id:String(uid),status:st}).then(function(d){
    if(d.ok)alert2('Status user '+uid+' diubah menjadi '+st);else alert2('Gagal: '+(d.error||''),'err');
  });
}
function delUser(uid){
  if(!confirm('Hapus user '+uid+' dari daftar?'))return;
  apiJ('remove-user',{user_id:String(uid)}).then(function(d){
    if(d.ok){alert2('User dihapus.');loadUsers();}else alert2('Gagal','err');
  });
}

// ── CHATS ──
function loadChats(){
  apiJ('chat-list').then(function(d){
    if(!d.ok)return;allChats=Object.values(d.chats);renderChats(allChats);
  });
}
function renderChats(list){
  var el=document.getElementById('chatTable');
  if(!list.length){el.innerHTML='<div class="empty"><div>'+SVG.chat+'</div>Belum ada chat terdaftar.</div>';return}
  var bm={private:'b-pvt',group:'b-grp',supergroup:'b-sgrp',channel:'b-ch'};
  el.innerHTML='<table><thead><tr><th>ID</th><th>Nama</th><th>Tipe</th><th>Username</th><th>Bergabung</th><th></th></tr></thead><tbody>'+
    list.map(function(c){
      return '<tr><td class="mono">'+c.id+'</td><td style="font-weight:500">'+esc(c.title||'-')+'</td>'+
        '<td><span class="badge '+(bm[c.type]||'b-std')+'">'+c.type+'</span></td>'+
        '<td>'+(c.username?'@'+esc(c.username):'<span style="color:var(--mut)">—</span>')+'</td>'+
        '<td style="font-size:.8rem;color:var(--txt2)">'+fmtDate(c.added_at)+'</td>'+
        '<td><button class="btn btn-d btn-sm" onclick="delChat('+c.id+')">'+SVG.trash+'</button></td></tr>';
    }).join('')+'</tbody></table>';
}
function filterChats(){
  var q=document.getElementById('chatQ').value.toLowerCase();
  renderChats(allChats.filter(function(c){
    return (c.title||'').toLowerCase().indexOf(q)>-1||(c.username||'').toLowerCase().indexOf(q)>-1||String(c.id).indexOf(q)>-1;
  }));
}
function delChat(id){
  if(!confirm('Hapus chat '+id+'?'))return;
  apiJ('remove-chat',{chat_id:id}).then(function(d){
    if(d.ok){alert2('Chat dihapus.');loadChats();loadStats();}else alert2('Gagal','err');
  });
}

// ── FILES ──
function loadFiles(){
  apiJ('get-files').then(function(d){
    if(!d.ok)return;renderTree(d.menu);
    var sel=document.getElementById('fCat');
    sel.innerHTML=Object.keys(d.menu).map(function(c){return '<option value="'+esc(c)+'">'+esc(c)+'</option>'}).join('');
  });
}
function renderTree(menu){
  var el=document.getElementById('fileTree');var cats=Object.keys(menu);
  if(!cats.length){el.innerHTML='<div class="empty"><div>'+SVG.folder+'</div>Belum ada kategori. Tambahkan kategori baru di atas.</div>';return}
  el.innerHTML=cats.map(function(cat){
    var vers=Object.keys(menu[cat]);
    var safeCat=esc(cat).replace(/'/g,"\\x27");
    return '<div class="tree-cat"><div class="tree-hd"><span>'+SVG.folder+' '+esc(cat)+'</span>'+
      '<div style="display:flex;gap:.3rem"><span style="font-size:.75rem;color:var(--mut);align-self:center">'+vers.length+' file</span>'+
      '<button class="btn btn-d btn-sm" onclick="delCat(\\''+safeCat+'\\')">'+SVG.trash+'</button></div></div>'+
      (vers.length?vers.map(function(v){
        var safeV=esc(v).replace(/'/g,"\\x27");
        return '<div class="tree-file"><span>'+esc(v)+' <span class="mono" style="font-size:.7rem;color:var(--mut)">['+menu[cat][v].file_type+']</span></span>'+
          '<button class="btn btn-d btn-sm" onclick="delFile(\\''+safeCat+'\\',\\''+safeV+'\\')">'+SVG.trash+'</button></div>';
      }).join(''):'<div class="tree-file" style="color:var(--mut);font-size:.84rem">Belum ada file dalam kategori ini.</div>')+
    '</div>';
  }).join('');
}
function addCat(){
  var n=document.getElementById('newCat').value.trim();if(!n)return alert2('Masukkan nama kategori!','err');
  apiJ('add-category',{name:n}).then(function(d){
    if(d.ok){alert2('Kategori "'+n+'" berhasil ditambahkan!');document.getElementById('newCat').value='';loadFiles();}
    else alert2('Gagal: '+(d.error||''),'err');
  });
}
function delCat(name){
  if(!confirm('Hapus kategori "'+name+'" beserta semua file di dalamnya?'))return;
  apiJ('delete-category',{name:name}).then(function(d){
    if(d.ok){alert2('Kategori dihapus!');loadFiles();}else alert2('Gagal','err');
  });
}
function addFile(){
  var cat=document.getElementById('fCat').value,ver=document.getElementById('fVer').value.trim(),
      fid=document.getElementById('fId').value.trim(),ft=document.getElementById('fType').value,
      cap=document.getElementById('fCap').value.trim();
  if(!cat||!ver||!fid)return alert2('Lengkapi semua field wajib!','err');
  apiJ('add-file',{category:cat,version:ver,file_id:fid,file_type:ft,caption:cap}).then(function(d){
    if(d.ok){alert2('File "'+ver+'" berhasil disimpan!');document.getElementById('fVer').value='';document.getElementById('fId').value='';document.getElementById('fCap').value='';loadFiles();}
    else alert2('Gagal: '+(d.error||''),'err');
  });
}
function delFile(cat,ver){
  if(!confirm('Hapus file "'+ver+'" dari kategori "'+cat+'"?'))return;
  apiJ('delete-file',{category:cat,version:ver}).then(function(d){
    if(d.ok){alert2('File dihapus!');loadFiles();}else alert2('Gagal','err');
  });
}

// ── BROADCAST ──
function setMode(m,el){
  curMode=m;
  ['text','photo','video'].forEach(function(x){document.getElementById('m-'+x).style.display=x===m?'block':'none'});
  document.querySelectorAll('.mtab').forEach(function(t){t.classList.remove('active')});
  if(el)el.classList.add('active');
}
function sendBc(){
  var target=document.getElementById('bcTarget').value,payload={mode:curMode,target:target};
  if(curMode==='text'){payload.text=document.getElementById('bcText').value.trim();if(!payload.text)return alert2('Tulis pesan dulu!','err')}
  else if(curMode==='photo'){payload.photo=document.getElementById('bcPhoto').value.trim();payload.caption=document.getElementById('bcPCap').value.trim();if(!payload.photo)return alert2('Masukkan URL/File ID foto!','err')}
  else{payload.video=document.getElementById('bcVideo').value.trim();payload.caption=document.getElementById('bcVCap').value.trim();if(!payload.video)return alert2('Masukkan URL/File ID video!','err')}
  var prog=document.getElementById('bcProg');prog.style.display='block';
  document.getElementById('bcStat').textContent='Sedang mengirim broadcast...';
  document.getElementById('bcBar').style.width='20%';
  var btn=document.getElementById('bcBtn');btn.disabled=true;btn.style.opacity='.5';
  apiJ('broadcast',payload).then(function(d){
    document.getElementById('bcBar').style.width='100%';btn.disabled=false;btn.style.opacity='1';
    if(d.ok){
      document.getElementById('bcStat').textContent='Selesai! Berhasil: '+d.success+' | Gagal: '+d.failed;
      alert2('Broadcast selesai! '+d.success+' pesan berhasil terkirim.');
    }else{document.getElementById('bcStat').textContent='Error: '+(d.error||'Unknown');alert2('Broadcast gagal!','err')}
  }).catch(function(){btn.disabled=false;btn.style.opacity='1';document.getElementById('bcStat').textContent='Koneksi gagal.';alert2('Koneksi error!','err')});
}

// ── SETTINGS ──
function loadSettings(){
  apiJ('get-settings').then(function(d){
    if(!d.ok)return;
    document.getElementById('sInfo').value=d.bot_info||'';
    document.getElementById('sYt').value=d.youtube_info||'';
    document.getElementById('sAnn').value=d.latest_announcement||'';
  });
}
function saveS(key,elId,label){
  apiJ('save-setting',{key:key,value:document.getElementById(elId).value}).then(function(d){
    if(d.ok)alert2(label+' berhasil disimpan!');else alert2('Gagal menyimpan!','err');
  });
}
function clearS(key,elId,label){
  if(!confirm('Hapus '+label+'?'))return;
  apiJ('clear-setting',{key:key}).then(function(d){
    if(d.ok){document.getElementById(elId).value='';alert2(label+' berhasil dihapus!');}else alert2('Gagal menghapus!','err');
  });
}
function setupWh(){
  apiJ('setup-webhook',{}).then(function(d){
    if(d.ok)alert2('Webhook berhasil dikonfigurasi!');else alert2('Gagal: '+JSON.stringify(d.result?.description||d),'err');
  });
}

// ── ADMINS ──
function loadAdms(){
  apiJ('admin-list').then(function(d){
    if(!d.ok)return;
    var el=document.getElementById('admTable');
    var list=Object.values(d.admins);
    if(!list.length){el.innerHTML='<div class="empty"><div>'+SVG.shield+'</div>Tidak ada admin.</div>';return}
    el.innerHTML='<table><thead><tr><th>ID</th><th>Role</th><th>Ditambahkan</th><th></th></tr></thead><tbody>'+
      list.map(function(a){
        var isOwn=a.role==='owner';
        return '<tr><td class="mono">'+a.id+'</td><td><span class="badge '+(isOwn?'b-pre':'b-pvt')+'">'+(isOwn?'👑 Owner':'🛡️ Admin')+'</span></td>'+
          '<td style="font-size:.8rem;color:var(--txt2)">'+fmtDate(a.added_at)+'</td>'+
          '<td>'+(isOwn?'<span style="font-size:.78rem;color:var(--mut)">Tidak dapat dihapus</span>':
            '<button class="btn btn-d btn-sm" onclick="delAdm(\\''+a.id+'\\')">'+SVG.trash+' Hapus</button>')+'</td></tr>';
      }).join('')+'</tbody></table>';
  });
}
function addAdm(){
  var id=document.getElementById('newAdmId').value.trim();
  if(!id||!/^\\d+$/.test(id))return alert2('Masukkan User ID yang valid (angka saja)!','err');
  apiJ('add-admin',{user_id:id}).then(function(d){
    if(d.ok){alert2('Admin '+id+' berhasil ditambahkan!');document.getElementById('newAdmId').value='';loadAdms();}
    else alert2('Gagal: '+(d.error||''),'err');
  });
}
function delAdm(id){
  if(!confirm('Hapus admin '+id+'?'))return;
  apiJ('remove-admin',{user_id:id}).then(function(d){
    if(d.ok){alert2('Admin '+id+' dihapus!');loadAdms();}else alert2('Gagal: '+(d.error||''),'err');
  });
}
</script>
</body></html>`;
}

// ─── MAIN EXPORT ──────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Dashboard-Password",
        },
      });
    }

    if (url.pathname === "/webhook") return handleWebhook(request, env);

    if (url.pathname === "/dashboard") {
      const k = url.searchParams.get("k");
      if (k && k === env.DASHBOARD_PASSWORD) {
        return new Response(dashboardHTML(url.origin, k), {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }
      return new Response(loginHTML(url.origin), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    if (url.pathname.startsWith("/api/")) return handleAPI(request, env, url);

    return Response.redirect(url.origin + "/dashboard", 302);
  },
};
