// ==================== UTILITY ====================
const TG = (token, method, params = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then(r => r.json());

// ==================== KV HELPERS ====================
async function getCfg(env) {
  try {
    const d = await env.BOT_KV.get("cfg");
    const cfg = d ? JSON.parse(d) : {};
    if (!cfg._migrated) {
      const [bi, yi, an] = await Promise.all([
        env.BOT_KV.get("bot_info"),
        env.BOT_KV.get("youtube_info"),
        env.BOT_KV.get("latest_announcement"),
      ]);
      if (bi) cfg.bot_info = bi;
      if (yi) cfg.youtube_info = yi;
      if (an) cfg.ann = an;
      cfg._migrated = true;
      await saveCfg(env, cfg);
      await Promise.all([
        env.BOT_KV.delete("bot_info"),
        env.BOT_KV.delete("youtube_info"),
        env.BOT_KV.delete("latest_announcement"),
      ]);
    }
    cfg.custom_buttons = cfg.custom_buttons || [];
    cfg.custom_commands = cfg.custom_commands || {};
    return cfg;
  } catch (e) {
    console.error("getCfg error:", e);
    return { custom_buttons: [], custom_commands: {} };
  }
}

async function saveCfg(env, cfg) {
  await env.BOT_KV.put("cfg", JSON.stringify(cfg));
}

async function getChats(env) {
  const d = await env.BOT_KV.get("chats");
  return d ? JSON.parse(d) : {};
}

async function saveChats(env, c) {
  await env.BOT_KV.put("chats", JSON.stringify(c));
}

async function addChat(env, chat) {
  const chats = await getChats(env);
  if (!chats[String(chat.id)]) {
    chats[String(chat.id)] = {
      id: chat.id,
      type: chat.type,
      title: chat.title || chat.first_name || "Unknown",
      username: chat.username || null,
      added_at: new Date().toISOString(),
      notes: "",
    };
    await saveChats(env, chats);
  }
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

async function saveMenu(env, m) {
  await env.BOT_KV.put("menu", JSON.stringify(m));
}

async function getPending(env, uid) {
  const d = await env.BOT_KV.get("p:" + uid);
  return d ? JSON.parse(d) : null;
}

async function setPending(env, uid, data) {
  if (!data) return env.BOT_KV.delete("p:" + uid);
  return env.BOT_KV.put("p:" + uid, JSON.stringify(data), { expirationTtl: 600 });
}

// ==================== KEYBOARD BUILDERS ====================
function buildMainKeyboard(cfg) {
  const fixed = [
    [{ text: "📱 Download Aplikasi", callback_data: "menu:apps" }, { text: "📢 Pengumuman", callback_data: "menu:announcements" }],
    [{ text: "📺 Channel YouTube", callback_data: "menu:youtube" }, { text: "ℹ️ Tentang Kami", callback_data: "menu:info" }],
    [{ text: "🌐 Kunjungi Website mcpatch.me", url: "https://mcpatch.me" }]
  ];
  const customs = (cfg.custom_buttons || []).map(b => {
    if (b.type === "url") return [{ text: b.text, url: b.url }];
    if (b.type === "callback") return [{ text: b.text, callback_data: b.data }];
    return [{ text: b.text, callback_data: "cmd:" + b.trigger }];
  });
  return { inline_keyboard: [...fixed, ...customs] };
}

function adminKB() {
  return {
    inline_keyboard: [
      [{ text: "📤 Broadcast", callback_data: "admin:broadcast" }, { text: "📊 Statistik", callback_data: "admin:stats" }],
      [{ text: "📢 Atur Pengumuman", callback_data: "admin:setann" }, { text: "📺 Atur YouTube", callback_data: "admin:setyoutube" }],
      [{ text: "ℹ️ Atur Info Bot", callback_data: "admin:setinfo" }, { text: "📁 Kelola File", callback_data: "admin:files" }],
      [{ text: "👥 Daftar Pengguna", callback_data: "admin:users" }, { text: "🗑️ Hapus Data", callback_data: "admin:delete" }],
      [{ text: "🔙 Menu Utama", callback_data: "menu:main" }]
    ]
  };
}

function delKB() {
  return {
    inline_keyboard: [
      [{ text: "🗑️ Hapus Pengumuman", callback_data: "admindel:ann" }, { text: "🗑️ Hapus YouTube", callback_data: "admindel:youtube" }],
      [{ text: "🗑️ Hapus Info Bot", callback_data: "admindel:info" }],
      [{ text: "🔙 Panel Admin", callback_data: "admin:main" }]
    ]
  };
}

function backKB(d) {
  return { inline_keyboard: [[{ text: "🔙 Kembali ke Menu Utama", callback_data: d || "menu:main" }]] };
}

// ==================== BROADCAST ====================
async function broadcast(token, env, text, mode, extra) {
  const chats = await getChats(env);
  let ok = 0, fail = 0;
  for (const c of Object.values(chats)) {
    try {
      let r;
      if (mode === "text") r = await TG(token, "sendMessage", { chat_id: c.id, text, parse_mode: "HTML" });
      else if (mode === "photo") r = await TG(token, "sendPhoto", { chat_id: c.id, photo: extra.photo, caption: extra.caption, parse_mode: "HTML" });
      else if (mode === "video") r = await TG(token, "sendVideo", { chat_id: c.id, video: extra.video, caption: extra.caption, parse_mode: "HTML" });
      if (r && r.ok) ok++;
      else { fail++; if (r && r.error_code === 403) await removeChat(env, c.id); }
    } catch { fail++; }
  }
  return { ok, fail };
}

// ==================== HANDLERS ====================
async function handlePending(token, msg, env, adminId) {
  const uid = String(msg.from.id);
  if (uid !== String(adminId)) return false;
  const p = await getPending(env, uid);
  if (!p) return false;
  const chatId = msg.chat.id, text = msg.text || "";
  if (p.action === "broadcast") {
    await setPending(env, uid, null);
    const { ok, fail } = await broadcast(token, env, text, "text");
    return TG(token, "sendMessage", {
      chat_id: chatId, parse_mode: "HTML",
      text: `✅ <b>Broadcast Selesai!</b>\n\n📤 Berhasil: <b>${ok}</b>\n❌ Gagal: <b>${fail}</b>`,
      reply_markup: adminKB()
    });
  }
  const infoActions = { setann: ["ann", "Pengumuman"], setyoutube: ["youtube_info", "YouTube"], setinfo: ["bot_info", "Info Bot"] };
  if (infoActions[p.action]) {
    const [key, label] = infoActions[p.action];
    const cfg = await getCfg(env);
    cfg[key] = text;
    await saveCfg(env, cfg);
    await setPending(env, uid, null);
    return TG(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: `✅ <b>${label} diperbarui!</b>`, reply_markup: adminKB() });
  }
  if (p.action === "add_file") {
    let fileId = null, fileType = null;
    if (msg.document) { fileId = msg.document.file_id; fileType = "document"; }
    else if (msg.video) { fileId = msg.video.file_id; fileType = "video"; }
    else if (msg.photo) { fileId = msg.photo[msg.photo.length - 1].file_id; fileType = "photo"; }
    else if (msg.audio) { fileId = msg.audio.file_id; fileType = "audio"; }
    else if (msg.animation) { fileId = msg.animation.file_id; fileType = "animation"; }
    if (!fileId) return false;
    const menu = await getMenu(env);
    if (!menu[p.cat]) menu[p.cat] = {};
    menu[p.cat][p.ver] = { file_id: fileId, file_type: fileType, caption: msg.caption || "", added_at: new Date().toISOString() };
    await saveMenu(env, menu);
    await setPending(env, uid, null);
    return TG(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: `✅ <b>File disimpan!</b>\n📁 ${p.cat} — ${p.ver}`, reply_markup: adminKB() });
  }
  return false;
}

async function handleCB(token, q, env, adminId) {
  const { id, data, message, from } = q;
  const chatId = message.chat.id, msgId = message.message_id;
  const isAdmin = String(from.id) === String(adminId);
  await TG(token, "answerCallbackQuery", { callback_query_id: id });
  const edit = (t, kb) => TG(token, "editMessageText", { chat_id: chatId, message_id: msgId, text: t, parse_mode: "HTML", reply_markup: kb });
  try {
    if (data === "menu:main") {
      const cfg = await getCfg(env);
      return edit(`🏠 <b>Menu Utama</b>\n\nHalo, <b>${from.first_name || "Pengguna"}</b>!`, buildMainKeyboard(cfg));
    }
    if (data === "menu:apps") {
      const menu = await getMenu(env);
      const cats = Object.keys(menu);
      const rows = [];
      for (let i = 0; i < cats.length; i += 2) {
        const row = [{ text: "📂 " + cats[i], callback_data: "cat:" + cats[i] }];
        if (cats[i + 1]) row.push({ text: "📂 " + cats[i + 1], callback_data: "cat:" + cats[i + 1] });
        rows.push(row);
      }
      rows.push([{ text: "🔙 Menu Utama", callback_data: "menu:main" }]);
      return edit("📱 <b>Download Aplikasi</b>\n\nPilih kategori:", { inline_keyboard: rows });
    }
    if (data === "menu:announcements") {
      const cfg = await getCfg(env);
      return edit(`📢 <b>Pengumuman Terbaru</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\n${cfg.ann || "Belum ada pengumuman."}`, backKB());
    }
    if (data === "menu:youtube") {
      const cfg = await getCfg(env);
      return edit(`📺 <b>Channel YouTube</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\n${cfg.youtube_info || "Info YouTube belum tersedia."}`, backKB());
    }
    if (data === "menu:info") {
      const cfg = await getCfg(env);
      return edit(`ℹ️ <b>Tentang Kami</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\n${cfg.bot_info || "MCPatch — platform distribusi aplikasi mod."}`, {
        inline_keyboard: [[{ text: "🌐 Kunjungi mcpatch.me", url: "https://mcpatch.me" }], [{ text: "🔙 Kembali", callback_data: "menu:main" }]]
      });
    }
    if (data.startsWith("cat:")) {
      const cat = data.slice(4), menu = await getMenu(env), vers = menu[cat] || {};
      const keys = Object.keys(vers);
      if (!keys.length) return edit(`📂 <b>${cat}</b>\n\nKosong.`, backKB());
      const rows = keys.map(v => [{ text: "📦 " + v, callback_data: `f:${cat}||${v}` }]);
      rows.push([{ text: "🔙 Kembali", callback_data: "menu:apps" }]);
      return edit(`📂 <b>${cat}</b>\n\nPilih versi:`, { inline_keyboard: rows });
    }
    if (data.startsWith("f:")) {
      const rest = data.slice(2), si = rest.indexOf("||");
      if (si === -1) return TG(token, "sendMessage", { chat_id: chatId, text: "❌ Format tidak valid." });
      const cat = rest.slice(0, si), ver = rest.slice(si + 2);
      const menu = await getMenu(env), file = menu[cat]?.[ver];
      if (!file) return TG(token, "sendMessage", { chat_id: chatId, text: "❌ File tidak ditemukan." });
      const methods = { document: ["sendDocument","document"], video: ["sendVideo","video"], photo: ["sendPhoto","photo"], audio: ["sendAudio","audio"], animation: ["sendAnimation","animation"] };
      const [method, key] = methods[file.file_type] || ["sendDocument","document"];
      try {
        await TG(token, method, { chat_id: chatId, caption: file.caption || `📦 <b>${cat}</b> — ${ver}`, parse_mode: "HTML", [key]: file.file_id });
        return TG(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: `✅ <b>File terkirim!</b>\n📦 ${ver} | 📁 ${cat}`, reply_markup: backKB() });
      } catch { return TG(token, "sendMessage", { chat_id: chatId, text: "❌ Gagal mengirim file." }); }
    }
    if (data.startsWith("cmd:")) {
      const cfg = await getCfg(env);
      return TG(token, "sendMessage", { chat_id: chatId, text: cfg.custom_commands?.[data.slice(4)] || "Tidak ada respons.", parse_mode: "HTML" });
    }
    if (!isAdmin) return;
    if (data === "admin:main") {
      const ch = Object.values(await getChats(env));
      return edit(`⚙️ <b>Panel Admin</b>\n\n👤 Pengguna: ${ch.filter(c=>c.type==="private").length}  👥 Grup: ${ch.filter(c=>c.type==="group"||c.type==="supergroup").length}\n📢 Channel: ${ch.filter(c=>c.type==="channel").length}  📋 Total: ${ch.length}`, adminKB());
    }
    if (data === "admin:stats") {
      const ch = Object.values(await getChats(env)), menu = await getMenu(env);
      const totalFiles = Object.values(menu).reduce((a,c)=>a+Object.keys(c).length,0);
      return edit(`📊 <b>Statistik</b>\n\n👤 ${ch.filter(c=>c.type==="private").length}  👥 ${ch.filter(c=>c.type==="group"||c.type==="supergroup").length}  📢 ${ch.filter(c=>c.type==="channel").length}\n📁 Kategori: ${Object.keys(menu).length}  📦 File: ${totalFiles}`, { inline_keyboard: [[{ text: "🔙 Panel Admin", callback_data: "admin:main" }]] });
    }
    const pendingActions = { "admin:broadcast":"broadcast", "admin:setann":"setann", "admin:setyoutube":"setyoutube", "admin:setinfo":"setinfo" };
    if (pendingActions[data]) {
      const labels = { broadcast: "📤 Broadcast\n\nKetik pesan:", setann: "📢 Atur Pengumuman\n\nKetik teks:", setyoutube: "📺 Atur YouTube\n\nKetik info:", setinfo: "ℹ️ Atur Info Bot\n\nKetik info:" };
      await setPending(env, String(from.id), { action: pendingActions[data] });
      return edit(labels[data], { inline_keyboard: [[{ text: "❌ Batalkan", callback_data: "admin:main" }]] });
    }
    if (data === "admin:users") {
      const users = Object.values(await getChats(env)).filter(c=>c.type==="private").slice(0,15);
      const lines = users.map((u,i)=>`${i+1}. <b>${u.title||"?"}</b>${u.username?" @"+u.username:""}\n   <code>${u.id}</code>`).join("\n");
      return edit(`👥 <b>Daftar Pengguna</b>\n\n${lines||"Kosong."}`, { inline_keyboard: [[{ text: "🔙 Panel Admin", callback_data: "admin:main" }]] });
    }
    if (data === "admin:files") {
      const menu = await getMenu(env), cats = Object.keys(menu);
      const lines = cats.map(c=>`📁 <b>${c}</b> — ${Object.keys(menu[c]).length} file`).join("\n");
      return edit(`📁 <b>Kelola File</b>\n\n${lines||"Kosong."}\n\n/addcat /delcat /addfile /listcat`, { inline_keyboard: [[{ text: "🔙 Panel Admin", callback_data: "admin:main" }]] });
    }
    if (data === "admin:delete") return edit("🗑️ <b>Hapus Data</b>\n\n⚠️ Tidak dapat dibatalkan!", delKB());
    if (data.startsWith("admindel:")) {
      const key = { ann:"ann", youtube:"youtube_info", info:"bot_info" }[data.slice(9)];
      if (key) { const cfg = await getCfg(env); delete cfg[key]; await saveCfg(env, cfg); return edit("✅ <b>Data dihapus!</b>", { inline_keyboard: [[{ text: "🔙 Panel Admin", callback_data: "admin:main" }]] }); }
    }
  } catch (e) {
    console.error("CB error:", e);
  }
}

// ==================== WEBHOOK ====================
async function handleWebhook(req, env) {
  if (req.method !== "POST") return new Response("", { status: 405 });
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET)
    return new Response("", { status: 401 });

  const token = env.BOT_TOKEN, adminId = String(env.ADMIN_ID);
  let update;
  try { update = await req.json(); } catch { return new Response("OK"); }

  // Log singkat untuk debug
  if (update.message) console.log(`MSG from ${update.message.from?.id}: ${update.message.text?.substring(0,30)}`);
  else if (update.callback_query) console.log(`CB from ${update.callback_query.from.id}: ${update.callback_query.data}`);
  else if (update.my_chat_member) console.log(`CHAT MEMBER: ${update.my_chat_member.chat.id}`);

  try {
    // 1. Callback query (tombol inline)
    if (update.callback_query) {
      await handleCB(token, update.callback_query, env, adminId);
      return new Response("OK");
    }

    // 2. Pesan (teks, media, dll)
    if (update.message) {
      const msg = update.message, chat = msg.chat, user = msg.from;
      const isAdmin = user && String(user.id) === adminId;
      const text = msg.text || "";

      // 2a. Pending action admin (broadcast, set konten, add file)
      const handled = await handlePending(token, msg, env, adminId);
      if (handled) return new Response("OK");

      // 2b. Custom commands (dari KV)
      const cfg = await getCfg(env);
      for (const [trigger, resp] of Object.entries(cfg.custom_commands || {})) {
        const tLower = text.toLowerCase().trim();
        const trigLower = trigger.toLowerCase().trim();
        if (tLower === trigLower || tLower.startsWith(trigLower + " ")) {
          await addChat(env, chat);
          await TG(token, "sendMessage", { chat_id: chat.id, text: resp, parse_mode: "HTML" });
          return new Response("OK");
        }
      }

      // 2c. Built-in commands
      if (/^\/start/i.test(text) || /^\/menu/i.test(text)) {
        await addChat(env, chat);
        const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Pengguna";
        const chats = await getChats(env);
        const joinedDate = chats[String(user.id)]?.added_at ? new Date(chats[String(user.id)].added_at).toLocaleDateString("id-ID", { day:"numeric", month:"long", year:"numeric" }) : "Hari ini";
        await TG(token, "sendMessage", {
          chat_id: chat.id, parse_mode: "HTML",
          text: `✨ <b>Selamat Datang di MCPatch Bot!</b>\n\n👤 <b>Profil Kamu</b>\n🏷️ Nama: ${name}\n🔖 Username: ${user.username?"@"+user.username:"Tidak disetel"}\n🪪 ID: <code>${user.id}</code>\n🎖️ Status: ${isAdmin?"👑 Admin":"⭐ Pengguna"}\n📅 Bergabung: ${joinedDate}`,
          reply_markup: buildMainKeyboard(cfg)
        });
      } else if (/^\/admin/i.test(text) && isAdmin) {
        const ch = Object.values(await getChats(env));
        await TG(token, "sendMessage", {
          chat_id: chat.id, parse_mode: "HTML",
          text: `⚙️ <b>Panel Admin</b>\n\nPengguna: ${ch.filter(c=>c.type==="private").length} | Grup: ${ch.filter(c=>c.type==="group"||c.type==="supergroup").length} | Channel: ${ch.filter(c=>c.type==="channel").length}`,
          reply_markup: adminKB()
        });
      } else if (/^\/broadcast /i.test(text) && isAdmin) {
        const bc = text.replace(/^\/broadcast /i, "").trim();
        const { ok, fail } = await broadcast(token, env, bc, "text");
        await TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: `✅ Broadcast selesai!\n📤 Berhasil: ${ok}  ❌ Gagal: ${fail}` });
      } else if (/^\/addcat /i.test(text) && isAdmin) {
        const n = text.replace(/^\/addcat /i, "").trim();
        const m = await getMenu(env);
        if (!m[n]) { m[n] = {}; await saveMenu(env, m); }
        await TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: `✅ Kategori <b>${n}</b> ditambahkan!` });
      } else if (/^\/delcat /i.test(text) && isAdmin) {
        const n = text.replace(/^\/delcat /i, "").trim();
        const m = await getMenu(env);
        delete m[n];
        await saveMenu(env, m);
        await TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: `✅ Kategori <b>${n}</b> dihapus.` });
      } else if (/^\/addfile /i.test(text) && isAdmin) {
        const pts = text.replace(/^\/addfile /i, "").trim().split("|");
        if (pts.length < 2) return TG(token, "sendMessage", { chat_id: chat.id, text: "Format: /addfile <kategori> | <versi>" });
        await setPending(env, String(user.id), { action: "add_file", cat: pts[0].trim(), ver: pts[1].trim() });
        await TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: `✅ Siap! Kirim file untuk:\n📁 <b>${pts[0].trim()}</b> — <b>${pts[1].trim()}</b>` });
      } else if (/^\/listcat/i.test(text) && isAdmin) {
        const m = await getMenu(env), cats = Object.keys(m);
        await TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: cats.length ? "📋 <b>Kategori:</b>\n"+cats.map((c,i)=>`${i+1}. ${c} (${Object.keys(m[c]).length} file)`).join("\n") : "Belum ada kategori." });
      } else if (/^\/help/i.test(text)) {
        const adm = isAdmin ? "\n\n<b>🔑 Admin:</b>\n/admin • /broadcast • /addcat • /delcat • /addfile • /listcat" : "";
        await TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "<b>📖 Bantuan</b>\n\n/start • /menu • /help"+adm });
      }

      // 2d. Anggota baru / keluar
      if (msg.new_chat_members) {
        const me = await TG(token, "getMe");
        if (msg.new_chat_members.some(m => m.id === me.result?.id)) {
          await addChat(env, chat);
          await TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "👋 <b>MCPatch Bot aktif!</b>\n🌐 mcpatch.me" });
        }
      }
      if (msg.left_chat_member) {
        const me = await TG(token, "getMe");
        if (msg.left_chat_member.id === me.result?.id) await removeChat(env, chat.id);
      }
    }

    // 3. my_chat_member (bot ditambahkan/dikeluarkan)
    if (update.my_chat_member) {
      const { chat, new_chat_member: nm } = update.my_chat_member;
      if (nm?.status === "member" || nm?.status === "administrator") await addChat(env, chat);
      else if (nm?.status === "kicked" || nm?.status === "left") await removeChat(env, chat.id);
    }

    return new Response("OK");
  } catch (e) {
    console.error("Webhook error:", e);
    // Coba beri tahu admin (opsional)
    try { await TG(token, "sendMessage", { chat_id: adminId, text: `❌ Error: ${e.message}` }); } catch {}
    return new Response("OK");
  }
}

// ==================== API AUTH ====================
function checkAuth(req, env) {
  const url = new URL(req.url);
  const pw = env.DASHBOARD_PASSWORD;
  if (!pw) return true;
  return req.headers.get("X-Pw") === pw || url.searchParams.get("k") === pw;
}

function jn(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" } });
}

// ==================== API ROUTER ====================
async function handleAPI(req, env, url) {
  const path = url.pathname.replace(/^\/api\//, "");
  if (!checkAuth(req, env)) return jn({ ok: false, error: "Unauthorized" }, 401);
  const T = env.BOT_TOKEN;
  try {
    if (path === "check") return jn({ ok: true, pw: !!env.DASHBOARD_PASSWORD, token: !!T, kv: !!env.BOT_KV });
    if (path === "chats") return jn({ ok: true, chats: await getChats(env) });
    if (path === "update-chat") { const b=await req.json(); const c=await getChats(env); if(c[String(b.id)]){ if(b.notes!==undefined)c[String(b.id)].notes=b.notes; if(b.display_name!==undefined)c[String(b.id)].display_name=b.display_name; await saveChats(env,c); } return jn({ok:true}); }
    if (path === "remove-chat") { await removeChat(env,(await req.json()).id); return jn({ok:true}); }
    if (path === "files") return jn({ ok: true, menu: await getMenu(env) });
    if (path === "add-cat") { const m=await getMenu(env); m[(await req.json()).name]={}; await saveMenu(env,m); return jn({ok:true}); }
    if (path === "del-cat") { const m=await getMenu(env); delete m[(await req.json()).name]; await saveMenu(env,m); return jn({ok:true}); }
    if (path === "add-file") { const b=await req.json(); const m=await getMenu(env); if(!m[b.cat])m[b.cat]={}; m[b.cat][b.ver]={file_id:b.file_id,file_type:b.file_type||"document",caption:b.caption||"",added_at:new Date().toISOString()}; await saveMenu(env,m); return jn({ok:true}); }
    if (path === "edit-file") { const b=await req.json(); const m=await getMenu(env); if(m[b.cat]?.[b.ver]){ if(b.caption!==undefined)m[b.cat][b.ver].caption=b.caption; if(b.new_ver&&b.new_ver!==b.ver){ m[b.cat][b.new_ver]=m[b.cat][b.ver]; delete m[b.cat][b.ver]; } await saveMenu(env,m); } return jn({ok:true}); }
    if (path === "del-file") { const b=await req.json(); const m=await getMenu(env); if(m[b.cat])delete m[b.cat][b.ver]; await saveMenu(env,m); return jn({ok:true}); }
    if (path === "cfg") return jn({ ok: true, cfg: await getCfg(env) });
    if (path === "save-cfg") { const b=await req.json(); const cfg=await getCfg(env); for(const k of ["bot_info","youtube_info","ann"]) if(b[k]!==undefined)cfg[k]=b[k]; await saveCfg(env,cfg); return jn({ok:true}); }
    if (path === "del-cfg") { const cfg=await getCfg(env); delete cfg[(await req.json()).key]; await saveCfg(env,cfg); return jn({ok:true}); }
    if (path === "menu-buttons") return jn({ ok: true, buttons: (await getCfg(env)).custom_buttons||[] });
    if (path === "add-button") { const b=await req.json(); const cfg=await getCfg(env); cfg.custom_buttons=cfg.custom_buttons||[]; cfg.custom_buttons.push({text:b.text,type:b.type,url:b.url||"",data:b.data||"",trigger:b.trigger||"",response:b.response||""}); if(b.type==="command"&&b.trigger&&b.response){ cfg.custom_commands=cfg.custom_commands||{}; cfg.custom_commands[b.trigger]=b.response; } await saveCfg(env,cfg); return jn({ok:true}); }
    if (path === "del-button") { const {idx}=await req.json(); const cfg=await getCfg(env); if(cfg.custom_buttons?.[idx]){ if(cfg.custom_buttons[idx].trigger&&cfg.custom_commands) delete cfg.custom_commands[cfg.custom_buttons[idx].trigger]; cfg.custom_buttons.splice(idx,1); await saveCfg(env,cfg); } return jn({ok:true}); }
    if (path === "commands") return jn({ ok: true, commands: (await getCfg(env)).custom_commands||{} });
    if (path === "add-command") { const {trigger,response}=await req.json(); const cfg=await getCfg(env); cfg.custom_commands=cfg.custom_commands||{}; cfg.custom_commands[trigger.trim()]=response; await saveCfg(env,cfg); return jn({ok:true}); }
    if (path === "del-command") { const cfg=await getCfg(env); delete cfg.custom_commands[(await req.json()).trigger]; await saveCfg(env,cfg); return jn({ok:true}); }
    if (path === "broadcast") {
      const b=await req.json(); let list;
      if(b.chat_ids?.length){ const ac=await getChats(env); list=b.chat_ids.map(id=>ac[String(id)]).filter(Boolean); }
      else { list=Object.values(await getChats(env)); if(b.target==="users")list=list.filter(c=>c.type==="private"); else if(b.target==="groups")list=list.filter(c=>c.type==="group"||c.type==="supergroup"); else if(b.target==="channels")list=list.filter(c=>c.type==="channel"); }
      let ok=0,fail=0;
      for(const chat of list){ try{ let r; if(b.mode==="text")r=await TG(T,"sendMessage",{chat_id:chat.id,text:b.text,parse_mode:"HTML"}); else if(b.mode==="photo")r=await TG(T,"sendPhoto",{chat_id:chat.id,photo:b.photo,caption:b.caption,parse_mode:"HTML"}); else if(b.mode==="video")r=await TG(T,"sendVideo",{chat_id:chat.id,video:b.video,caption:b.caption,parse_mode:"HTML"}); if(r?.ok)ok++; else{ fail++; if(r?.error_code===403)await removeChat(env,chat.id); } } catch{ fail++; } }
      return jn({ok:true,success:ok,failed:fail});
    }
    if (path === "setup-webhook") { const r=await TG(T,"setWebhook",{url:url.origin+"/webhook",secret_token:env.WEBHOOK_SECRET,allowed_updates:["message","callback_query","my_chat_member"]}); return jn({ok:r.ok,result:r}); }
    return jn({ok:false,error:"Not found"},404);
  } catch(e) { return jn({ok:false,error:e.message},500); }
}

// ==================== FETCH ====================
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"GET,POST,OPTIONS", "Access-Control-Allow-Headers":"Content-Type,X-Pw" } });
    if (url.pathname === "/webhook") return handleWebhook(req, env);
    if (url.pathname === "/dashboard") {
      const html = await env.BOT_KV.get("dashboard_html");
      if (html) return new Response(html, { headers: { "Content-Type":"text/html;charset=UTF-8" } });
      return new Response("Dashboard belum diupload. Upload HTML ke KV key 'dashboard_html'.", { status: 404 });
    }
    if (url.pathname.startsWith("/api/")) return handleAPI(req, env, url);
    return Response.redirect(url.origin + "/dashboard", 302);
  }
};
