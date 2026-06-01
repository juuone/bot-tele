// ============================================================
//  MCPATCH TELEGRAM BOT + DASHBOARD — Cloudflare Workers
// ============================================================

const TG = (token, method, params = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json());

// ─── KV HELPERS ──────────────────────────────────────────────

async function getChats(env) {
  const d = await env.BOT_KV.get("chats");
  return d ? JSON.parse(d) : {};
}
async function saveChats(env, chats) {
  await env.BOT_KV.put("chats", JSON.stringify(chats));
}
async function addChat(env, chat) {
  const chats = await getChats(env);
  if (!chats[String(chat.id)]) {
    chats[String(chat.id)] = {
      id: chat.id,
      type: chat.type,
      title: chat.title || chat.first_name || chat.username || "Unknown",
      username: chat.username || null,
      added_at: new Date().toISOString(),
    };
    await saveChats(env, chats);
  }
}
async function removeChat(env, chatId) {
  const chats = await getChats(env);
  delete chats[String(chatId)];
  await saveChats(env, chats);
}
async function getMenu(env) {
  const d = await env.BOT_KV.get("menu");
  return d ? JSON.parse(d) : {};
}
async function saveMenu(env, menu) {
  await env.BOT_KV.put("menu", JSON.stringify(menu));
}
async function getPending(env, userId) {
  const d = await env.BOT_KV.get("pending:" + userId);
  return d ? JSON.parse(d) : null;
}
async function setPending(env, userId, data) {
  if (data === null) return env.BOT_KV.delete("pending:" + userId);
  return env.BOT_KV.put("pending:" + userId, JSON.stringify(data), { expirationTtl: 600 });
}

// ─── KEYBOARDS ───────────────────────────────────────────────

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "📱 Download Aplikasi", callback_data: "menu:apps" },
        { text: "📢 Pengumuman", callback_data: "menu:announcements" },
      ],
      [
        { text: "📺 Channel YouTube", callback_data: "menu:youtube" },
        { text: "ℹ️ Tentang Kami", callback_data: "menu:info" },
      ],
      [
        { text: "🌐 Kunjungi Website mcpatch.me", url: "https://mcpatch.me" },
      ],
    ],
  };
}

function adminMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "📤 Broadcast ke Semua", callback_data: "admin:broadcast" },
        { text: "📊 Statistik Bot", callback_data: "admin:stats" },
      ],
      [
        { text: "📢 Atur Pengumuman", callback_data: "admin:setann" },
        { text: "📺 Atur Info YouTube", callback_data: "admin:setyoutube" },
      ],
      [
        { text: "ℹ️ Atur Info Bot", callback_data: "admin:setinfo" },
        { text: "📁 Kelola File/Aplikasi", callback_data: "admin:files" },
      ],
      [
        { text: "👥 Daftar Pengguna", callback_data: "admin:users" },
        { text: "🗑️ Hapus Data", callback_data: "admin:delete" },
      ],
      [
        { text: "🔙 Kembali ke Menu Utama", callback_data: "menu:main" },
      ],
    ],
  };
}

function adminDeleteKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🗑️ Hapus Teks Pengumuman", callback_data: "admindel:ann" },
        { text: "🗑️ Hapus Info YouTube", callback_data: "admindel:youtube" },
      ],
      [
        { text: "🗑️ Hapus Info Bot", callback_data: "admindel:info" },
      ],
      [
        { text: "🔙 Kembali ke Panel Admin", callback_data: "admin:main" },
      ],
    ],
  };
}

function categoryKeyboard(menu) {
  const cats = Object.keys(menu);
  if (!cats.length)
    return { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu:main" }]] };
  const rows = [];
  for (let i = 0; i < cats.length; i += 2) {
    const row = [{ text: "📂 " + cats[i], callback_data: "cat:" + cats[i] }];
    if (cats[i + 1]) row.push({ text: "📂 " + cats[i + 1], callback_data: "cat:" + cats[i + 1] });
    rows.push(row);
  }
  rows.push([{ text: "🔙 Kembali ke Menu Utama", callback_data: "menu:main" }]);
  return { inline_keyboard: rows };
}

function versionKeyboard(category, versions) {
  const keys = Object.keys(versions);
  const rows = keys.map((v) => [{ text: "📦 " + v, callback_data: "file:" + category + ":" + v }]);
  rows.push([{ text: "🔙 Kembali ke Kategori", callback_data: "menu:apps" }]);
  return { inline_keyboard: rows };
}

function backToMain() {
  return { inline_keyboard: [[{ text: "🔙 Kembali ke Menu Utama", callback_data: "menu:main" }]] };
}

// ─── COMMAND HANDLERS ────────────────────────────────────────

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

async function cmdStart(token, chat, user, env, adminId) {
  await addChat(env, chat);
  const isAdmin = String(user.id) === String(adminId);
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Pengguna";
  const username = user.username ? "@" + user.username : "Tidak disetel";
  const status = isAdmin ? "👑 Administrator" : "⭐ Pengguna Standar";
  const chats = await getChats(env);
  const joinDate = chats[String(user.id)]?.added_at ? formatDate(chats[String(user.id)].added_at) : "Hari ini";

  const text =
    "✨ <b>Selamat Datang di MCPatch Bot!</b>\n\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "👤 <b>Profil Kamu</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "🏷️ <b>Nama</b>        : " + name + "\n" +
    "🔖 <b>Username</b>  : " + username + "\n" +
    "🪪 <b>ID Telegram</b> : <code>" + user.id + "</code>\n" +
    "🎖️ <b>Status</b>      : " + status + "\n" +
    "📅 <b>Bergabung</b> : " + joinDate + "\n" +
    "━━━━━━━━━━━━━━━━━━━━\n\n" +
    "Selamat datang! Gunakan menu di bawah untuk menjelajahi fitur yang tersedia. " +
    "Kamu dapat mengunduh aplikasi, membaca pengumuman terbaru, mengunjungi channel YouTube kami, " +
    "dan masih banyak lagi. 🚀";

  await TG(token, "sendMessage", {
    chat_id: chat.id,
    text,
    parse_mode: "HTML",
    reply_markup: mainMenuKeyboard(),
  });
}

async function cmdAdmin(token, chat, user, env, adminId) {
  if (String(user.id) !== String(adminId)) {
    return TG(token, "sendMessage", {
      chat_id: chat.id,
      text: "⛔ <b>Akses Ditolak</b>\n\nKamu tidak memiliki izin untuk mengakses panel admin.",
      parse_mode: "HTML",
    });
  }
  const name = user.first_name || "Admin";
  const chats = Object.values(await getChats(env));
  const totalUsers = chats.filter((c) => c.type === "private").length;

  await TG(token, "sendMessage", {
    chat_id: chat.id,
    parse_mode: "HTML",
    text:
      "⚙️ <b>Panel Administrator</b>\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "👋 Halo, <b>" + name + "</b>!\n" +
      "📊 Total pengguna aktif: <b>" + totalUsers + "</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "Pilih aksi yang ingin kamu lakukan dari menu di bawah ini:",
    reply_markup: adminMenuKeyboard(),
  });
}

async function doBroadcast(token, env, text, mode, extra) {
  const chats = await getChats(env);
  let ok = 0, fail = 0;
  for (const c of Object.values(chats)) {
    try {
      let r;
      if (mode === "text") {
        r = await TG(token, "sendMessage", { chat_id: c.id, text, parse_mode: "HTML" });
      } else if (mode === "forward") {
        r = await TG(token, "forwardMessage", { chat_id: c.id, from_chat_id: extra.from, message_id: extra.mid });
      }
      if (r && r.ok) ok++;
      else {
        fail++;
        if (r && r.error_code === 403) await removeChat(env, c.id);
      }
    } catch { fail++; }
  }
  return { ok, fail };
}

// ─── PENDING ACTION HANDLER ───────────────────────────────────

async function handlePendingAction(token, msg, env, adminId) {
  const userId = String(msg.from.id);
  if (String(msg.from.id) !== String(adminId)) return false;
  const pending = await getPending(env, userId);
  if (!pending) return false;

  const chatId = msg.chat.id;
  const text = msg.text || "";

  // Broadcast teks
  if (pending.action === "broadcast") {
    await setPending(env, userId, null);
    const { ok, fail } = await doBroadcast(token, env, text, "text");
    await TG(token, "sendMessage", {
      chat_id: chatId, parse_mode: "HTML",
      text: "✅ <b>Broadcast Selesai!</b>\n\n📤 Berhasil dikirim: <b>" + ok + "</b>\n❌ Gagal: <b>" + fail + "</b>",
      reply_markup: adminMenuKeyboard(),
    });
    return true;
  }

  // Set announcement
  if (pending.action === "setann") {
    await setPending(env, userId, null);
    await env.BOT_KV.put("latest_announcement", text);
    await TG(token, "sendMessage", {
      chat_id: chatId, parse_mode: "HTML",
      text: "✅ <b>Pengumuman berhasil diperbarui!</b>\n\nPengguna dapat melihatnya di menu Pengumuman.",
      reply_markup: adminMenuKeyboard(),
    });
    return true;
  }

  // Set YouTube
  if (pending.action === "setyoutube") {
    await setPending(env, userId, null);
    await env.BOT_KV.put("youtube_info", text);
    await TG(token, "sendMessage", {
      chat_id: chatId, parse_mode: "HTML",
      text: "✅ <b>Info YouTube berhasil diperbarui!</b>",
      reply_markup: adminMenuKeyboard(),
    });
    return true;
  }

  // Set bot info
  if (pending.action === "setinfo") {
    await setPending(env, userId, null);
    await env.BOT_KV.put("bot_info", text);
    await TG(token, "sendMessage", {
      chat_id: chatId, parse_mode: "HTML",
      text: "✅ <b>Info bot berhasil diperbarui!</b>",
      reply_markup: adminMenuKeyboard(),
    });
    return true;
  }

  // Add file
  if (pending.action === "add_file") {
    let fileId = null, fileType = null;
    const caption = msg.caption || "";
    if (msg.document) { fileId = msg.document.file_id; fileType = "document"; }
    else if (msg.video) { fileId = msg.video.file_id; fileType = "video"; }
    else if (msg.photo) { fileId = msg.photo[msg.photo.length - 1].file_id; fileType = "photo"; }
    else if (msg.audio) { fileId = msg.audio.file_id; fileType = "audio"; }
    else if (msg.animation) { fileId = msg.animation.file_id; fileType = "animation"; }
    if (!fileId) return false;
    const menu = await getMenu(env);
    if (!menu[pending.category]) menu[pending.category] = {};
    menu[pending.category][pending.version] = { file_id: fileId, file_type: fileType, caption, added_at: new Date().toISOString() };
    await saveMenu(env, menu);
    await setPending(env, userId, null);
    await TG(token, "sendMessage", {
      chat_id: chatId, parse_mode: "HTML",
      text: "✅ <b>File berhasil disimpan!</b>\n\n📁 Kategori: <b>" + pending.category + "</b>\n📦 Versi: <b>" + pending.version + "</b>",
      reply_markup: adminMenuKeyboard(),
    });
    return true;
  }

  return false;
}

// ─── CALLBACK HANDLER ────────────────────────────────────────

async function handleCallback(token, query, env, adminId) {
  const { id, data, message, from } = query;
  const chatId = message.chat.id;
  const msgId = message.message_id;
  const isAdmin = String(from.id) === String(adminId);
  await TG(token, "answerCallbackQuery", { callback_query_id: id });

  const edit = (text, kb) =>
    TG(token, "editMessageText", { chat_id: chatId, message_id: msgId, text, parse_mode: "HTML", reply_markup: kb });

  // ── MAIN MENU ──
  if (data === "menu:main") {
    const name = from.first_name || "Pengguna";
    return edit(
      "🏠 <b>Menu Utama</b>\n\nHalo, <b>" + name + "</b>! Pilih menu yang kamu inginkan:",
      mainMenuKeyboard()
    );
  }

  if (data === "menu:apps") {
    const menu = await getMenu(env);
    return edit(
      "📱 <b>Download Aplikasi</b>\n\n" +
      "Berikut adalah daftar kategori aplikasi yang tersedia.\n" +
      "Pilih kategori untuk melihat versi yang bisa diunduh:",
      categoryKeyboard(menu)
    );
  }

  if (data === "menu:announcements") {
    const txt = await env.BOT_KV.get("latest_announcement");
    return edit(
      "📢 <b>Pengumuman Terbaru</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\n" +
      (txt || "Belum ada pengumuman saat ini.\nNantikan update selanjutnya! 🔔") +
      "\n\n━━━━━━━━━━━━━━━━━━━━",
      backToMain()
    );
  }

  if (data === "menu:youtube") {
    const txt = await env.BOT_KV.get("youtube_info");
    return edit(
      "📺 <b>Channel YouTube Kami</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\n" +
      (txt || "Informasi channel YouTube belum tersedia.\nSilakan cek kembali nanti! 📺") +
      "\n\n━━━━━━━━━━━━━━━━━━━━",
      backToMain()
    );
  }

  if (data === "menu:info") {
    const txt = await env.BOT_KV.get("bot_info");
    return edit(
      "ℹ️ <b>Tentang Kami</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\n" +
      (txt || "MCPatch adalah platform distribusi aplikasi dan pengumuman berbasis Telegram.\n\n🌐 Website: mcpatch.me") +
      "\n\n━━━━━━━━━━━━━━━━━━━━",
      {
        inline_keyboard: [
          [{ text: "🌐 Kunjungi mcpatch.me", url: "https://mcpatch.me" }],
          [{ text: "🔙 Kembali ke Menu Utama", callback_data: "menu:main" }],
        ]
      }
    );
  }

  // ── CATEGORY & FILE ──
  if (data.startsWith("cat:")) {
    const category = data.slice(4);
    const menu = await getMenu(env);
    const versions = menu[category] || {};
    if (!Object.keys(versions).length) {
      return edit(
        "📂 <b>" + category + "</b>\n\n" +
        "Belum ada file yang tersedia untuk kategori ini.\n" +
        "Silakan cek kembali nanti! 🔔",
        backToMain()
      );
    }
    return edit(
      "📂 <b>" + category + "</b>\n\n" +
      "Pilih versi yang ingin kamu unduh:\n" +
      "_(File akan langsung dikirimkan ke chat ini)_",
      versionKeyboard(category, versions)
    );
  }

  if (data.startsWith("file:")) {
    const parts = data.split(":");
    const category = parts[1];
    const version = parts[2];
    const menu = await getMenu(env);
    const file = menu[category] && menu[category][version];
    if (!file) return TG(token, "sendMessage", { chat_id: chatId, text: "❌ File tidak ditemukan." });

    const cap = file.caption || "📦 <b>" + category + "</b> — " + version;
    const methodMap = { document: ["sendDocument", "document"], video: ["sendVideo", "video"], photo: ["sendPhoto", "photo"], audio: ["sendAudio", "audio"], animation: ["sendAnimation", "animation"] };
    const [method, key] = methodMap[file.file_type] || ["sendDocument", "document"];
    const p = { chat_id: chatId, caption: cap, parse_mode: "HTML" };
    p[key] = file.file_id;
    try {
      await TG(token, method, p);
      await TG(token, "sendMessage", {
        chat_id: chatId, parse_mode: "HTML",
        text: "✅ <b>File berhasil dikirimkan!</b>\n\n📦 Versi: <b>" + version + "</b>\n📁 Kategori: <b>" + category + "</b>\n\nSelamat menggunakan! 🎉",
        reply_markup: backToMain(),
      });
    } catch {
      TG(token, "sendMessage", { chat_id: chatId, text: "❌ Gagal mengirim file. Silakan coba beberapa saat lagi." });
    }
    return;
  }

  // ── ADMIN PANEL ──
  if (!isAdmin) return TG(token, "answerCallbackQuery", { callback_query_id: id, text: "⛔ Akses ditolak!" });

  if (data === "admin:main") {
    const chats = Object.values(await getChats(env));
    return edit(
      "⚙️ <b>Panel Administrator</b>\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "📊 Total pengguna: <b>" + chats.filter(c => c.type === "private").length + "</b>\n" +
      "👥 Total grup: <b>" + chats.filter(c => c.type === "group" || c.type === "supergroup").length + "</b>\n" +
      "📢 Total channel: <b>" + chats.filter(c => c.type === "channel").length + "</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "Pilih aksi:",
      adminMenuKeyboard()
    );
  }

  if (data === "admin:stats") {
    const chats = Object.values(await getChats(env));
    const menu = await getMenu(env);
    const totalFiles = Object.values(menu).reduce((a, c) => a + Object.keys(c).length, 0);
    return edit(
      "📊 <b>Statistik Bot</b>\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "👤 Pengguna (private): <b>" + chats.filter(c => c.type === "private").length + "</b>\n" +
      "👥 Grup: <b>" + chats.filter(c => c.type === "group" || c.type === "supergroup").length + "</b>\n" +
      "📢 Channel: <b>" + chats.filter(c => c.type === "channel").length + "</b>\n" +
      "📋 Total semua: <b>" + chats.length + "</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "📁 Kategori file: <b>" + Object.keys(menu).length + "</b>\n" +
      "📦 Total file: <b>" + totalFiles + "</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━",
      { inline_keyboard: [[{ text: "🔙 Kembali ke Panel Admin", callback_data: "admin:main" }]] }
    );
  }

  if (data === "admin:broadcast") {
    await setPending(env, String(from.id), { action: "broadcast" });
    return edit(
      "📤 <b>Broadcast ke Semua Pengguna</b>\n\n" +
      "Kirimkan pesan yang ingin disebarkan ke semua pengguna, grup, dan channel.\n\n" +
      "📝 <i>HTML diperbolehkan: &lt;b&gt;, &lt;i&gt;, &lt;a href&gt;, dll.</i>\n\n" +
      "Ketik atau paste pesanmu sekarang:",
      { inline_keyboard: [[{ text: "❌ Batalkan", callback_data: "admin:main" }]] }
    );
  }

  if (data === "admin:setann") {
    const cur = await env.BOT_KV.get("latest_announcement");
    await setPending(env, String(from.id), { action: "setann" });
    return edit(
      "📢 <b>Atur Teks Pengumuman</b>\n\n" +
      (cur ? "📌 Teks saat ini:\n<i>" + cur.substring(0, 200) + (cur.length > 200 ? "..." : "") + "</i>\n\n" : "") +
      "Kirimkan teks pengumuman baru:\n<i>(HTML diperbolehkan)</i>",
      { inline_keyboard: [[{ text: "❌ Batalkan", callback_data: "admin:main" }]] }
    );
  }

  if (data === "admin:setyoutube") {
    const cur = await env.BOT_KV.get("youtube_info");
    await setPending(env, String(from.id), { action: "setyoutube" });
    return edit(
      "📺 <b>Atur Info YouTube</b>\n\n" +
      (cur ? "📌 Info saat ini:\n<i>" + cur.substring(0, 200) + "</i>\n\n" : "") +
      "Kirimkan teks info YouTube baru:\n<i>(Bisa berisi link, deskripsi, dll.)</i>",
      { inline_keyboard: [[{ text: "❌ Batalkan", callback_data: "admin:main" }]] }
    );
  }

  if (data === "admin:setinfo") {
    const cur = await env.BOT_KV.get("bot_info");
    await setPending(env, String(from.id), { action: "setinfo" });
    return edit(
      "ℹ️ <b>Atur Info Bot/Tentang Kami</b>\n\n" +
      (cur ? "📌 Info saat ini:\n<i>" + cur.substring(0, 200) + "</i>\n\n" : "") +
      "Kirimkan teks info baru:",
      { inline_keyboard: [[{ text: "❌ Batalkan", callback_data: "admin:main" }]] }
    );
  }

  if (data === "admin:users") {
    const chats = Object.values(await getChats(env));
    const users = chats.filter(c => c.type === "private").slice(0, 20);
    const lines = users.map((u, i) =>
      (i + 1) + ". " + (u.title || "Unknown") + (u.username ? " (@" + u.username + ")" : "") + "\n    🪪 <code>" + u.id + "</code>"
    ).join("\n");
    return edit(
      "👥 <b>Daftar Pengguna</b>\n" +
      "(Menampilkan " + users.length + " dari " + chats.filter(c => c.type === "private").length + " pengguna)\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      (lines || "Belum ada pengguna terdaftar.") +
      "\n━━━━━━━━━━━━━━━━━━━━\n\n" +
      "💡 Lihat daftar lengkap di Web Dashboard.",
      { inline_keyboard: [[{ text: "🔙 Kembali ke Panel Admin", callback_data: "admin:main" }]] }
    );
  }

  if (data === "admin:files") {
    const menu = await getMenu(env);
    const cats = Object.keys(menu);
    const lines = cats.length ? cats.map(c => "📁 <b>" + c + "</b> — " + Object.keys(menu[c]).length + " file").join("\n") : "Belum ada kategori.";
    return edit(
      "📁 <b>Kelola File &amp; Aplikasi</b>\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      lines +
      "\n━━━━━━━━━━━━━━━━━━━━\n\n" +
      "Gunakan perintah berikut untuk mengelola file:\n" +
      "• /addcat &lt;nama&gt; — Tambah kategori\n" +
      "• /delcat &lt;nama&gt; — Hapus kategori\n" +
      "• /addfile &lt;kat&gt; | &lt;ver&gt; — Tambah file\n" +
      "• /listcat — Lihat semua kategori\n\n" +
      "Atau kelola lewat Web Dashboard.",
      { inline_keyboard: [[{ text: "🔙 Kembali ke Panel Admin", callback_data: "admin:main" }]] }
    );
  }

  if (data === "admin:delete") {
    return edit(
      "🗑️ <b>Hapus Data</b>\n\n" +
      "Pilih data yang ingin dihapus:\n\n" +
      "⚠️ <i>Tindakan ini tidak dapat dibatalkan!</i>",
      adminDeleteKeyboard()
    );
  }

  if (data.startsWith("admindel:")) {
    const key = data.slice(9);
    const keyMap = { ann: ["latest_announcement", "Teks Pengumuman"], youtube: ["youtube_info", "Info YouTube"], info: ["bot_info", "Info Bot"] };
    const [kvKey, label] = keyMap[key] || [];
    if (!kvKey) return;
    await env.BOT_KV.delete(kvKey);
    return edit(
      "✅ <b>" + label + " berhasil dihapus!</b>\n\n" +
      "Data telah dihapus dari sistem.",
      { inline_keyboard: [[{ text: "🔙 Kembali ke Panel Admin", callback_data: "admin:main" }]] }
    );
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
    const isAdmin = String(user && user.id) === adminId;
    const text = msg.text || "";

    // Bot ditambah ke grup/channel
    if (msg.new_chat_members) {
      const me = await TG(token, "getMe");
      const botId = me.result && me.result.id;
      if (msg.new_chat_members.some(m => m.id === botId)) {
        await addChat(env, chat);
        TG(token, "sendMessage", {
          chat_id: chat.id, parse_mode: "HTML",
          text: "👋 <b>Halo semuanya!</b>\n\nBot MCPatch telah aktif di grup ini dan siap menerima pengumuman dari admin.\n\n🌐 Website: mcpatch.me",
        });
      }
    }

    // Bot dikeluarkan
    if (msg.left_chat_member) {
      const me = await TG(token, "getMe");
      if (msg.left_chat_member.id === (me.result && me.result.id)) await removeChat(env, chat.id);
    }

    // Cek pending action admin
    if (isAdmin) {
      const handled = await handlePendingAction(token, msg, env, adminId);
      if (handled) return new Response("OK");
    }

    // Juga cek file upload untuk add_file
    if (isAdmin && (msg.document || msg.video || msg.photo || msg.audio || msg.animation)) {
      const handled = await handlePendingAction(token, msg, env, adminId);
      if (handled) return new Response("OK");
    }

    if (text.match(/^\/start/i) || text.match(/^\/menu/i)) {
      await cmdStart(token, chat, user, env, adminId);
    } else if (text.match(/^\/admin/i)) {
      await cmdAdmin(token, chat, user, env, adminId);
    } else if (text.match(/^\/broadcast/i) && isAdmin) {
      const bc = text.replace(/^\/broadcast\s*/i, "").trim();
      if (!bc) return TG(token, "sendMessage", { chat_id: chat.id, text: "Format: /broadcast <pesan>" });
      const { ok, fail } = await doBroadcast(token, env, bc, "text");
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "✅ <b>Broadcast Selesai!</b>\n\n📤 Berhasil: <b>" + ok + "</b>\n❌ Gagal: <b>" + fail + "</b>" });
    } else if (text.match(/^\/addcat/i) && isAdmin) {
      const name = text.replace(/^\/addcat\s*/i, "").trim();
      if (!name) return TG(token, "sendMessage", { chat_id: chat.id, text: "Format: /addcat <nama>" });
      const menu = await getMenu(env);
      if (!menu[name]) { menu[name] = {}; await saveMenu(env, menu); }
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "✅ Kategori <b>" + name + "</b> ditambahkan!" });
    } else if (text.match(/^\/delcat/i) && isAdmin) {
      const name = text.replace(/^\/delcat\s*/i, "").trim();
      const menu = await getMenu(env);
      if (menu[name]) { delete menu[name]; await saveMenu(env, menu); TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "✅ Kategori <b>" + name + "</b> dihapus." }); }
      else TG(token, "sendMessage", { chat_id: chat.id, text: "❌ Kategori tidak ditemukan." });
    } else if (text.match(/^\/addfile/i) && isAdmin) {
      const raw = text.replace(/^\/addfile\s*/i, "").trim();
      const parts = raw.split("|");
      if (parts.length < 2) return TG(token, "sendMessage", { chat_id: chat.id, text: "Format: /addfile <kategori> | <versi>\nLalu kirim file-nya." });
      await setPending(env, String(user.id), { action: "add_file", category: parts[0].trim(), version: parts[1].trim() });
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "✅ Siap! Kirim file untuk:\n📁 <b>" + parts[0].trim() + "</b> — <b>" + parts[1].trim() + "</b>" });
    } else if (text.match(/^\/listcat/i) && isAdmin) {
      const menu = await getMenu(env);
      const cats = Object.keys(menu);
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: cats.length ? "📋 <b>Kategori:</b>\n" + cats.map((c, i) => (i + 1) + ". " + c + " (" + Object.keys(menu[c]).length + " file)").join("\n") : "Belum ada kategori." });
    } else if (text.match(/^\/stats/i) && isAdmin) {
      const chats2 = Object.values(await getChats(env));
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "📊 <b>Statistik</b>\n\n👤 Users: <b>" + chats2.filter(c => c.type === "private").length + "</b>\n👥 Grup: <b>" + chats2.filter(c => c.type === "group" || c.type === "supergroup").length + "</b>\n📢 Channel: <b>" + chats2.filter(c => c.type === "channel").length + "</b>\n─────\n📋 Total: <b>" + chats2.length + "</b>" });
    } else if (text.match(/^\/help/i)) {
      const adminHelp = isAdmin ? "\n\n<b>🔑 Perintah Admin:</b>\n/admin — Panel admin lengkap\n/broadcast &lt;pesan&gt; — Broadcast\n/stats — Statistik\n/addcat &lt;nama&gt; — Tambah kategori\n/delcat &lt;nama&gt; — Hapus kategori\n/addfile &lt;kat&gt; | &lt;ver&gt; — Tambah file\n/listcat — Daftar kategori" : "";
      TG(token, "sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "<b>📖 Bantuan MCPatch Bot</b>\n\n/start — Tampilkan profil &amp; menu utama\n/menu — Tampilkan menu utama\n/help — Tampilkan bantuan ini" + adminHelp });
    }
  }

  if (update.callback_query) {
    await handleCallback(token, update.callback_query, env, adminId);
  }

  if (update.my_chat_member) {
    const { chat, new_chat_member } = update.my_chat_member;
    const status = new_chat_member && new_chat_member.status;
    if (status === "member" || status === "administrator") await addChat(env, chat);
    else if (status === "kicked" || status === "left") await removeChat(env, chat.id);
  }

  return new Response("OK");
}

// ─── AUTH ─────────────────────────────────────────────────────

function checkAuth(request, env) {
  const url = new URL(request.url);
  const fromHeader = request.headers.get("X-Dashboard-Password");
  const fromQuery = url.searchParams.get("k");
  const correct = env.DASHBOARD_PASSWORD;
  if (!correct) return false;
  return fromHeader === correct || fromQuery === correct;
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// ─── API HANDLERS ─────────────────────────────────────────────

async function handleAPI(request, env, url) {
  const path = url.pathname.replace(/^\/api\//, "");

  if (path === "check-config") {
    return json({ pw_set: !!env.DASHBOARD_PASSWORD, pw_len: (env.DASHBOARD_PASSWORD || "").length, token_set: !!env.BOT_TOKEN, kv_set: !!env.BOT_KV });
  }

  if (!checkAuth(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);

  const token = env.BOT_TOKEN;

  if (path === "chat-list") return json({ ok: true, chats: await getChats(env) });

  if (path === "remove-chat") {
    const { chat_id } = await request.json();
    await removeChat(env, chat_id);
    return json({ ok: true });
  }

  if (path === "get-files") return json({ ok: true, menu: await getMenu(env) });

  if (path === "add-category") {
    const { name } = await request.json();
    const menu = await getMenu(env);
    if (!menu[name]) { menu[name] = {}; await saveMenu(env, menu); }
    return json({ ok: true });
  }

  if (path === "delete-category") {
    const { name } = await request.json();
    const menu = await getMenu(env);
    delete menu[name];
    await saveMenu(env, menu);
    return json({ ok: true });
  }

  if (path === "add-file") {
    const body = await request.json();
    const menu = await getMenu(env);
    if (!menu[body.category]) menu[body.category] = {};
    menu[body.category][body.version] = { file_id: body.file_id, file_type: body.file_type || "document", caption: body.caption || "", added_at: new Date().toISOString() };
    await saveMenu(env, menu);
    return json({ ok: true });
  }

  if (path === "delete-file") {
    const { category, version } = await request.json();
    const menu = await getMenu(env);
    if (menu[category]) delete menu[category][version];
    await saveMenu(env, menu);
    return json({ ok: true });
  }

  if (path === "broadcast") {
    const body = await request.json();
    const chats = await getChats(env);
    let list = Object.values(chats);
    if (body.target === "users") list = list.filter(c => c.type === "private");
    else if (body.target === "groups") list = list.filter(c => c.type === "group" || c.type === "supergroup");
    else if (body.target === "channels") list = list.filter(c => c.type === "channel");
    let success = 0, failed = 0;
    for (const chat of list) {
      try {
        let r;
        if (body.mode === "text") r = await TG(token, "sendMessage", { chat_id: chat.id, text: body.text, parse_mode: "HTML" });
        else if (body.mode === "photo") r = await TG(token, "sendPhoto", { chat_id: chat.id, photo: body.photo, caption: body.caption, parse_mode: "HTML" });
        else if (body.mode === "video") r = await TG(token, "sendVideo", { chat_id: chat.id, video: body.video, caption: body.caption, parse_mode: "HTML" });
        if (r && r.ok) success++;
        else { failed++; if (r && r.error_code === 403) await removeChat(env, chat.id); }
      } catch { failed++; }
    }
    return json({ ok: true, success, failed });
  }

  if (path === "get-settings") {
    const [bot_info, youtube_info, latest_announcement] = await Promise.all([
      env.BOT_KV.get("bot_info"), env.BOT_KV.get("youtube_info"), env.BOT_KV.get("latest_announcement"),
    ]);
    return json({ ok: true, bot_info, youtube_info, latest_announcement });
  }

  if (path === "save-setting") {
    const { key, value } = await request.json();
    const allowed = ["bot_info", "youtube_info", "latest_announcement"];
    if (!allowed.includes(key)) return json({ ok: false, error: "Invalid key" });
    await env.BOT_KV.put(key, value);
    return json({ ok: true });
  }

  if (path === "delete-setting") {
    const { key } = await request.json();
    const allowed = ["bot_info", "youtube_info", "latest_announcement"];
    if (!allowed.includes(key)) return json({ ok: false, error: "Invalid key" });
    await env.BOT_KV.delete(key);
    return json({ ok: true });
  }

  if (path === "setup-webhook") {
    const webhookUrl = url.origin + "/webhook";
    const r = await TG(token, "setWebhook", { url: webhookUrl, secret_token: env.WEBHOOK_SECRET, allowed_updates: ["message", "callback_query", "my_chat_member"] });
    return json({ ok: r.ok, result: r });
  }

  return json({ ok: false, error: "Not found" }, 404);
}


// ─── LOGIN PAGE ───────────────────────────────────────────────

function loginHTML(origin) {
  return '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCPatch Dashboard</title>' +
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">' +
  '<style>' +
  '*{margin:0;padding:0;box-sizing:border-box}' +
  'body{font-family:"Plus Jakarta Sans",sans-serif;background:#060d1f;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;' +
  'background-image:radial-gradient(ellipse at 20% 50%,rgba(59,130,246,.08) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(139,92,246,.08) 0%,transparent 60%)}' +
  '.card{background:rgba(17,24,39,.8);backdrop-filter:blur(20px);border:1px solid rgba(59,130,246,.2);border-radius:1.5rem;padding:2.5rem;width:100%;max-width:420px;box-shadow:0 25px 50px rgba(0,0,0,.5)}' +
  '.logo-wrap{display:flex;align-items:center;justify-content:center;margin-bottom:1.5rem}' +
  '.logo-svg{width:64px;height:64px}' +
  'h1{font-size:1.6rem;font-weight:800;text-align:center;background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:.3rem}' +
  'p{color:#64748b;text-align:center;font-size:.875rem;margin-bottom:2rem}' +
  'label{display:block;font-size:.8rem;font-weight:600;color:#94a3b8;margin-bottom:.5rem;letter-spacing:.05em;text-transform:uppercase}' +
  'input{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:.75rem;color:#e2e8f0;padding:.85rem 1rem;font-size:.95rem;font-family:inherit;transition:.2s;margin-bottom:1.25rem}' +
  'input:focus{outline:none;border-color:#3b82f6;background:rgba(59,130,246,.08);box-shadow:0 0 0 3px rgba(59,130,246,.15)}' +
  'button{width:100%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;border:none;border-radius:.75rem;padding:.9rem;font-size:.95rem;font-weight:700;font-family:inherit;cursor:pointer;transition:.2s;letter-spacing:.02em}' +
  'button:active{opacity:.9;transform:scale(.99)}' +
  '.hint{margin-top:1.25rem;font-size:.78rem;color:#475569;text-align:center;line-height:1.6}' +
  'code{background:rgba(255,255,255,.06);padding:.15rem .45rem;border-radius:.35rem;color:#93c5fd;font-size:.78rem}' +
  '</style></head><body>' +
  '<div class="card">' +
  '<div class="logo-wrap"><svg class="logo-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<rect width="64" height="64" rx="16" fill="url(#lg1)"/>' +
  '<path d="M20 32L28 24L36 32L44 24" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M20 40L28 32L36 40L44 32" stroke="rgba(255,255,255,0.5)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<defs><linearGradient id="lg1" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop stop-color="#3b82f6"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>' +
  '</svg></div>' +
  '<h1>MCPatch Dashboard</h1>' +
  '<p>Masukkan password untuk mengakses panel admin</p>' +
  '<form method="GET" action="' + origin + '/dashboard">' +
  '<label>Password</label>' +
  '<input type="password" name="k" placeholder="Ketik password kamu..." autofocus autocomplete="current-password">' +
  '<button type="submit">Masuk ke Dashboard →</button>' +
  '</form>' +
  '<div class="hint">Akses diatur melalui variabel <code>DASHBOARD_PASSWORD</code><br>di Cloudflare Workers Settings</div>' +
  '</div></body></html>';
}

// ─── DASHBOARD HTML ───────────────────────────────────────────

function dashboardHTML(origin, k) {
  var apiBase = origin + '/api';
  var safeK = k.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  var html = '<!DOCTYPE html><html lang="id"><head>' +
  '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>MCPatch Dashboard</title>' +
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">' +
  '<style>' +
  '*{margin:0;padding:0;box-sizing:border-box}' +
  ':root{--bg:#060d1f;--surface:#0d1426;--card:#111827;--card2:#131d30;--border:rgba(59,130,246,.15);--border2:rgba(255,255,255,.06);' +
  '--accent:#3b82f6;--purple:#8b5cf6;--green:#22c55e;--red:#ef4444;--yellow:#f59e0b;--text:#e2e8f0;--muted:#64748b;--muted2:#475569}' +
  'body{font-family:"Plus Jakarta Sans",sans-serif;background:var(--bg);color:var(--text);min-height:100vh;' +
  'background-image:radial-gradient(ellipse at 0% 0%,rgba(59,130,246,.06) 0%,transparent 50%),radial-gradient(ellipse at 100% 100%,rgba(139,92,246,.06) 0%,transparent 50%)}' +

  /* TOPBAR */
  '.topbar{background:rgba(13,20,38,.9);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:.875rem 1.5rem;' +
  'display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}' +
  '.topbar-brand{display:flex;align-items:center;gap:.75rem}' +
  '.topbar-brand svg{width:32px;height:32px}' +
  '.topbar-brand h1{font-size:1rem;font-weight:800;background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}' +
  '.topbar-status{display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:var(--green);font-weight:600}' +
  '.dot{width:7px;height:7px;background:var(--green);border-radius:50%;animation:pulse 2s infinite}' +
  '@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}' +

  /* LAYOUT */
  '.layout{display:grid;grid-template-columns:230px 1fr;min-height:calc(100vh - 54px)}' +
  '@media(max-width:768px){.layout{grid-template-columns:1fr}.sidebar{display:none}}' +

  /* SIDEBAR */
  '.sidebar{background:rgba(13,20,38,.6);border-right:1px solid var(--border);padding:1.25rem .875rem}' +
  '.sidebar-section{font-size:.68rem;font-weight:700;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;padding:.5rem .75rem;margin-top:1rem;margin-bottom:.25rem}' +
  '.sidebar-section:first-child{margin-top:0}' +
  '.nav{display:flex;align-items:center;gap:.6rem;padding:.65rem .85rem;border-radius:.75rem;cursor:pointer;color:var(--muted);font-size:.875rem;font-weight:500;transition:.15s;margin-bottom:.15rem;user-select:none}' +
  '.nav:hover{background:rgba(59,130,246,.08);color:var(--text)}' +
  '.nav.active{background:rgba(59,130,246,.15);color:var(--accent);font-weight:600}' +
  '.nav-icon{font-size:1rem;width:20px;text-align:center;flex-shrink:0}' +

  /* MAIN */
  'main{padding:1.75rem;max-width:1000px}' +
  '.page{display:none}.page.active{display:block}' +
  '.page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem}' +
  '.page-title{font-size:1.25rem;font-weight:800;display:flex;align-items:center;gap:.5rem}' +
  '.page-sub{font-size:.8rem;color:var(--muted);margin-top:.2rem}' +

  /* CARDS */
  '.card{background:var(--card);border:1px solid var(--border2);border-radius:1rem;padding:1.5rem;margin-bottom:1.25rem}' +
  '.card-title{font-size:.875rem;font-weight:700;color:var(--accent);margin-bottom:1.25rem;display:flex;align-items:center;gap:.4rem;letter-spacing:.01em}' +
  '.card-title svg{width:16px;height:16px}' +

  /* STATS */
  '.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1rem;margin-bottom:1.5rem}' +
  '.stat{background:var(--card);border:1px solid var(--border2);border-radius:.875rem;padding:1.25rem;text-align:center;transition:.2s}' +
  '.stat:hover{border-color:rgba(59,130,246,.3);transform:translateY(-1px)}' +
  '.stat-n{font-size:2rem;font-weight:800;background:linear-gradient(135deg,var(--accent),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent}' +
  '.stat-l{font-size:.75rem;color:var(--muted);margin-top:.25rem;font-weight:500}' +

  /* FORM */
  'label{display:block;font-size:.75rem;font-weight:700;color:var(--muted);margin-bottom:.4rem;letter-spacing:.05em;text-transform:uppercase}' +
  'input,textarea,select{width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border2);border-radius:.625rem;color:var(--text);' +
  'padding:.7rem .9rem;font-size:.875rem;font-family:inherit;transition:.2s}' +
  'input:focus,textarea:focus,select:focus{outline:none;border-color:var(--accent);background:rgba(59,130,246,.06);box-shadow:0 0 0 3px rgba(59,130,246,.1)}' +
  'textarea{resize:vertical;min-height:100px}' +
  '.fg{margin-bottom:.875rem}' +
  '.row{display:flex;gap:.875rem;flex-wrap:wrap}.row .fg{flex:1;min-width:160px}' +

  /* BUTTONS */
  '.btn{padding:.65rem 1.25rem;border:none;border-radius:.625rem;cursor:pointer;font-size:.85rem;font-weight:700;font-family:inherit;transition:.15s;display:inline-flex;align-items:center;gap:.4rem;letter-spacing:.01em}' +
  '.btn:active{transform:scale(.98)}' +
  '.btn-primary{background:linear-gradient(135deg,var(--accent),var(--purple));color:#fff}' +
  '.btn-primary:hover{opacity:.9;box-shadow:0 4px 15px rgba(59,130,246,.3)}' +
  '.btn-success{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff}' +
  '.btn-success:hover{opacity:.9}' +
  '.btn-danger{background:rgba(239,68,68,.15);color:var(--red);border:1px solid rgba(239,68,68,.3)}' +
  '.btn-danger:hover{background:var(--red);color:#fff}' +
  '.btn-ghost{background:rgba(255,255,255,.05);color:var(--text);border:1px solid var(--border2)}' +
  '.btn-ghost:hover{border-color:var(--accent);color:var(--accent)}' +
  '.btn-sm{padding:.4rem .8rem;font-size:.78rem}' +
  '.btn-icon{width:32px;height:32px;padding:0;justify-content:center;border-radius:.5rem}' +

  /* ALERTS */
  '.alert{padding:.8rem 1rem;border-radius:.625rem;font-size:.85rem;margin-bottom:1rem;font-weight:500}' +
  '.alert-ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:#86efac}' +
  '.alert-err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#fca5a5}' +
  '.alert-info{background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);color:#93c5fd}' +

  /* TABS */
  '.mtabs{display:flex;gap:.4rem;margin-bottom:1rem;flex-wrap:wrap}' +
  '.mtab{padding:.45rem 1rem;border-radius:.5rem;border:1px solid var(--border2);cursor:pointer;font-size:.8rem;font-weight:600;color:var(--muted);transition:.15s;font-family:inherit}' +
  '.mtab:hover{border-color:var(--accent);color:var(--accent)}' +
  '.mtab.active{background:rgba(59,130,246,.15);border-color:var(--accent);color:var(--accent)}' +

  /* TABLE */
  '.tbl-wrap{overflow-x:auto;border-radius:.625rem}' +
  'table{width:100%;border-collapse:collapse;font-size:.82rem}' +
  'th{color:var(--muted);font-weight:700;padding:.7rem 1rem;border-bottom:1px solid var(--border2);text-align:left;white-space:nowrap;font-size:.72rem;letter-spacing:.05em;text-transform:uppercase}' +
  'td{padding:.7rem 1rem;border-bottom:1px solid rgba(255,255,255,.04)}' +
  'tr:last-child td{border:none}' +
  'tr:hover td{background:rgba(255,255,255,.02)}' +

  /* BADGE */
  '.badge{padding:.2rem .6rem;border-radius:1rem;font-size:.7rem;font-weight:700;letter-spacing:.03em}' +
  '.badge-private{background:rgba(59,130,246,.15);color:#93c5fd}' +
  '.badge-group{background:rgba(34,197,94,.15);color:#86efac}' +
  '.badge-supergroup{background:rgba(245,158,11,.15);color:#fcd34d}' +
  '.badge-channel{background:rgba(239,68,68,.15);color:#fca5a5}' +

  /* PROGRESS */
  '.prog-wrap{background:rgba(255,255,255,.05);border-radius:1rem;height:6px;overflow:hidden}' +
  '.prog{height:100%;background:linear-gradient(90deg,var(--accent),var(--purple));border-radius:1rem;transition:width .4s}' +

  /* FILE TREE */
  '.tree-cat{background:rgba(255,255,255,.03);border:1px solid var(--border2);border-radius:.75rem;overflow:hidden;margin-bottom:.75rem;transition:.15s}' +
  '.tree-cat:hover{border-color:rgba(59,130,246,.25)}' +
  '.tree-head{padding:.7rem 1rem;background:rgba(59,130,246,.08);display:flex;justify-content:space-between;align-items:center}' +
  '.tree-head span{font-weight:700;color:var(--accent);font-size:.875rem}' +
  '.tree-file{padding:.55rem 1rem;border-top:1px solid rgba(255,255,255,.04);display:flex;justify-content:space-between;align-items:center;font-size:.82rem}' +

  /* DIVIDER */
  'hr{border:none;border-top:1px solid var(--border2);margin:1.25rem 0}' +
  '.chip{background:rgba(59,130,246,.1);color:var(--accent);border-radius:1rem;padding:.2rem .65rem;font-size:.72rem;font-weight:700}' +
  '.empty-state{text-align:center;padding:2.5rem;color:var(--muted)}' +
  '.empty-state svg{width:48px;height:48px;margin:0 auto 1rem;opacity:.3;display:block}' +

  /* SEARCH */
  '.search-wrap{display:flex;gap:.5rem;margin-bottom:1rem}' +
  '.search-wrap input{flex:1}' +
  '</style></head><body>' +

  /* TOPBAR */
  '<div class="topbar"><div class="topbar-brand">' +
  '<svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="url(#tl)"/>' +
  '<path d="M8 16L13 11L18 16L23 11" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M8 21L13 16L18 21L23 16" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<defs><linearGradient id="tl" x1="0" y1="0" x2="32" y2="32"><stop stop-color="#3b82f6"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs></svg>' +
  '<h1>MCPatch Dashboard</h1></div>' +
  '<div class="topbar-status"><div class="dot"></div><span>Bot Online</span></div></div>' +

  /* LAYOUT */
  '<div class="layout">' +
  '<nav class="sidebar">' +
  '<div class="sidebar-section">Menu</div>' +
  '<div class="nav active" id="nav-overview" onclick="go(\'overview\')"><span class="nav-icon">📊</span> Overview</div>' +
  '<div class="nav" id="nav-broadcast" onclick="go(\'broadcast\')"><span class="nav-icon">📢</span> Broadcast</div>' +
  '<div class="sidebar-section">Data</div>' +
  '<div class="nav" id="nav-chats" onclick="go(\'chats\')"><span class="nav-icon">💬</span> Chat List</div>' +
  '<div class="nav" id="nav-files" onclick="go(\'files\')"><span class="nav-icon">📁</span> File Manager</div>' +
  '<div class="sidebar-section">Konten</div>' +
  '<div class="nav" id="nav-content" onclick="go(\'content\')"><span class="nav-icon">✏️</span> Atur Konten</div>' +
  '<div class="sidebar-section">Sistem</div>' +
  '<div class="nav" id="nav-settings" onclick="go(\'settings\')"><span class="nav-icon">⚙️</span> Settings</div>' +
  '</nav><main>' +
  '<div id="globalAlert"></div>' +

  /* PAGE: OVERVIEW */
  '<div class="page active" id="page-overview">' +
  '<div class="page-header"><div><div class="page-title">📊 Overview</div><div class="page-sub">Ringkasan statistik bot kamu</div></div></div>' +
  '<div class="stats-grid">' +
  '<div class="stat"><div class="stat-n" id="stTotal">0</div><div class="stat-l">Total Chat</div></div>' +
  '<div class="stat"><div class="stat-n" id="stUsers">0</div><div class="stat-l">Pengguna</div></div>' +
  '<div class="stat"><div class="stat-n" id="stGroups">0</div><div class="stat-l">Grup</div></div>' +
  '<div class="stat"><div class="stat-n" id="stChannels">0</div><div class="stat-l">Channel</div></div>' +
  '</div>' +
  '<div class="card"><div class="card-title">🔗 Informasi Sistem</div>' +
  '<div class="fg"><label>Webhook URL</label>' +
  '<div style="display:flex;gap:.5rem"><input id="webhookUrl" readonly style="font-size:.78rem;color:#93c5fd">' +
  '<button class="btn btn-success btn-sm" onclick="setupWebhook()">⚡ Setup</button></div></div>' +
  '<div class="fg"><label>Dashboard URL (Bookmark ini!)</label>' +
  '<input id="dashUrl" readonly style="font-size:.78rem;color:#93c5fd"></div>' +
  '</div></div>' +

  /* PAGE: BROADCAST */
  '<div class="page" id="page-broadcast">' +
  '<div class="page-header"><div><div class="page-title">📢 Broadcast</div><div class="page-sub">Kirim pesan ke semua pengguna, grup, atau channel</div></div></div>' +
  '<div class="card"><div class="card-title">✏️ Buat Pesan</div>' +
  '<div class="mtabs">' +
  '<div class="mtab active" id="mt-text" onclick="setMode(\'text\')">📝 Teks</div>' +
  '<div class="mtab" id="mt-photo" onclick="setMode(\'photo\')">🖼️ Foto</div>' +
  '<div class="mtab" id="mt-video" onclick="setMode(\'video\')">🎬 Video</div>' +
  '</div>' +
  '<div id="m-text"><div class="fg"><label>Pesan (HTML: &lt;b&gt;, &lt;i&gt;, &lt;a href&gt;)</label>' +
  '<textarea id="bcText" placeholder="Contoh: &lt;b&gt;🎉 Update Baru!&lt;/b&gt;&#10;Versi terbaru sudah tersedia. Download sekarang!"></textarea></div></div>' +
  '<div id="m-photo" style="display:none"><div class="fg"><label>URL Foto atau File ID Telegram</label><input id="bcPhoto" placeholder="https://... atau file_id"></div>' +
  '<div class="fg"><label>Caption (opsional)</label><textarea id="bcPhotoCaption" style="min-height:70px" placeholder="Deskripsi foto..."></textarea></div></div>' +
  '<div id="m-video" style="display:none"><div class="fg"><label>URL Video atau File ID Telegram</label><input id="bcVideo" placeholder="https://... atau file_id"></div>' +
  '<div class="fg"><label>Caption (opsional)</label><textarea id="bcVideoCaption" style="min-height:70px" placeholder="Deskripsi video..."></textarea></div></div>' +
  '<div class="fg"><label>Target Penerima</label>' +
  '<select id="bcTarget"><option value="all">🌐 Semua (Pengguna + Grup + Channel)</option>' +
  '<option value="users">👤 Pengguna saja</option><option value="groups">👥 Grup saja</option><option value="channels">📢 Channel saja</option></select></div>' +
  '<button class="btn btn-primary" onclick="sendBroadcast()">📤 Kirim Broadcast Sekarang</button>' +
  '<div id="bcProgress" style="display:none;margin-top:1rem"><div style="font-size:.82rem;color:var(--muted);margin-bottom:.5rem" id="bcStatus"></div>' +
  '<div class="prog-wrap"><div class="prog" id="bcBar" style="width:0%"></div></div></div></div></div>' +

  /* PAGE: CHATS */
  '<div class="page" id="page-chats">' +
  '<div class="page-header"><div><div class="page-title">💬 Chat List</div><div class="page-sub">Semua pengguna, grup, dan channel yang terdaftar</div></div>' +
  '<button class="btn btn-ghost btn-sm" onclick="loadChats()">🔄 Refresh</button></div>' +
  '<div class="card"><div class="search-wrap"><input id="chatQ" placeholder="🔍 Cari nama, username, atau ID..." oninput="filterChats()"></div>' +
  '<div id="chatTable"><div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Memuat data...</div></div></div></div>' +

  /* PAGE: FILES */
  '<div class="page" id="page-files">' +
  '<div class="page-header"><div><div class="page-title">📁 File Manager</div><div class="page-sub">Kelola kategori dan file distribusi</div></div></div>' +
  '<div class="card"><div class="card-title">📂 Tambah Kategori Baru</div>' +
  '<div style="display:flex;gap:.5rem"><input id="newCat" placeholder="Contoh: Minecraft Patch, PUBG Mod, dll..." style="flex:1">' +
  '<button class="btn btn-success" onclick="addCat()">+ Tambah</button></div></div>' +
  '<div class="card"><div class="card-title">🗂️ Daftar Kategori & File</div>' +
  '<div id="fileTree"><div class="empty-state">Memuat...</div></div></div>' +
  '<div class="card"><div class="card-title">➕ Tambah File ke Kategori</div>' +
  '<div class="alert alert-info">💡 <b>Cara dapat File ID:</b> Kirim <code>/addfile Kategori | Versi</code> ke bot via Telegram, lalu kirim file-nya. Bot akan menyimpan file ID otomatis.</div>' +
  '<div class="row"><div class="fg"><label>Kategori</label><select id="fCat"></select></div>' +
  '<div class="fg"><label>Nama Versi</label><input id="fVer" placeholder="Contoh: v1.21.50"></div></div>' +
  '<div class="row"><div class="fg"><label>File ID Telegram</label><input id="fId" placeholder="BQACAgIAAxkB..."></div>' +
  '<div class="fg"><label>Tipe File</label><select id="fType"><option value="document">📄 Document / APK</option><option value="video">🎬 Video</option><option value="photo">🖼️ Foto</option><option value="audio">🎵 Audio</option></select></div></div>' +
  '<div class="fg"><label>Caption (opsional)</label><textarea id="fCap" style="min-height:70px" placeholder="Deskripsi file..."></textarea></div>' +
  '<button class="btn btn-primary" onclick="addFile()">💾 Simpan File</button></div></div>' +

  /* PAGE: CONTENT */
  '<div class="page" id="page-content">' +
  '<div class="page-header"><div><div class="page-title">✏️ Atur Konten</div><div class="page-sub">Kelola teks yang tampil di menu bot</div></div></div>' +

  '<div class="card"><div class="card-title">📢 Pengumuman Terbaru</div>' +
  '<div class="fg"><textarea id="sAnn" placeholder="Teks pengumuman yang muncul di menu Pengumuman...&#10;HTML diperbolehkan: &lt;b&gt;teks&lt;/b&gt;"></textarea></div>' +
  '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
  '<button class="btn btn-primary" onclick="saveSetting(\'latest_announcement\',\'sAnn\',\'Pengumuman\')">💾 Simpan</button>' +
  '<button class="btn btn-success" onclick="saveAndBroadcast()">📤 Simpan + Kirim ke Semua</button>' +
  '<button class="btn btn-danger" onclick="delSetting(\'latest_announcement\',\'sAnn\',\'Pengumuman\')">🗑️ Hapus</button></div></div>' +

  '<div class="card"><div class="card-title">📺 Info YouTube</div>' +
  '<div class="fg"><textarea id="sYt" placeholder="Link dan deskripsi channel YouTube...&#10;Contoh: Subscribe di: https://youtube.com/@..."></textarea></div>' +
  '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
  '<button class="btn btn-primary" onclick="saveSetting(\'youtube_info\',\'sYt\',\'Info YouTube\')">💾 Simpan</button>' +
  '<button class="btn btn-danger" onclick="delSetting(\'youtube_info\',\'sYt\',\'Info YouTube\')">🗑️ Hapus</button></div></div>' +

  '<div class="card"><div class="card-title">ℹ️ Info / Tentang Kami</div>' +
  '<div class="fg"><textarea id="sInfo" placeholder="Deskripsi bot, info kontak, dll..."></textarea></div>' +
  '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
  '<button class="btn btn-primary" onclick="saveSetting(\'bot_info\',\'sInfo\',\'Info Bot\')">💾 Simpan</button>' +
  '<button class="btn btn-danger" onclick="delSetting(\'bot_info\',\'sInfo\',\'Info Bot\')">🗑️ Hapus</button></div></div></div>' +

  /* PAGE: SETTINGS */
  '<div class="page" id="page-settings">' +
  '<div class="page-header"><div><div class="page-title">⚙️ Settings</div><div class="page-sub">Konfigurasi teknis bot</div></div></div>' +
  '<div class="card"><div class="card-title">🔗 Webhook</div>' +
  '<div class="fg"><label>Webhook URL</label><input id="wh2" readonly></div>' +
  '<button class="btn btn-success" onclick="setupWebhook()">⚡ Setup / Refresh Webhook</button>' +
  '<div style="margin-top:.75rem" class="alert alert-info">Jalankan setup webhook setiap kali URL worker berubah atau pertama kali deploy.</div></div></div>' +

  '</main></div>' + /* end layout */

  '<script>' +
  'var K = \'' + safeK + '\';' +
  'var ORIGIN = \'' + origin + '\';' +
  'var BASE = ORIGIN + \'/api\';' +
  'var allChats = [], curMode = \'text\';' +

  'function api(path, opts) {' +
  '  var sep = path.indexOf(\'?\') > -1 ? \'&\' : \'?\';' +
  '  return fetch(BASE + \'/\' + path + sep + \'k=\' + encodeURIComponent(K), opts || {});' +
  '}' +
  'function apiJ(path, body) {' +
  '  return api(path, {' +
  '    method: body !== undefined ? \'POST\' : \'GET\',' +
  '    headers: {\'Content-Type\': \'application/json\'},' +
  '    body: body !== undefined ? JSON.stringify(body) : undefined' +
  '  }).then(function(r) { return r.json(); });' +
  '}' +

  'function go(page) {' +
  '  document.querySelectorAll(\'.nav\').forEach(function(n) { n.classList.remove(\'active\'); });' +
  '  document.querySelectorAll(\'.page\').forEach(function(p) { p.classList.remove(\'active\'); });' +
  '  var ni = document.getElementById(\'nav-\' + page);' +
  '  if (ni) ni.classList.add(\'active\');' +
  '  var pi = document.getElementById(\'page-\' + page);' +
  '  if (pi) pi.classList.add(\'active\');' +
  '  if (page === \'chats\') loadChats();' +
  '  if (page === \'files\') loadFiles();' +
  '  if (page === \'content\') loadContent();' +
  '}' +

  'function alert2(msg, type) {' +
  '  var box = document.getElementById(\'globalAlert\');' +
  '  box.innerHTML = \'<div class="alert alert-\' + (type||\'ok\') + \'">\' + msg + \'</div>\';' +
  '  setTimeout(function() { box.innerHTML = \'\'; }, 4000);' +
  '}' +

  'function loadStats() {' +
  '  apiJ(\'chat-list\').then(function(d) {' +
  '    if (!d || !d.ok) return;' +
  '    var cs = Object.values(d.chats);' +
  '    allChats = cs;' +
  '    document.getElementById(\'stTotal\').textContent = cs.length;' +
  '    document.getElementById(\'stUsers\').textContent = cs.filter(function(c){return c.type===\'private\';}).length;' +
  '    document.getElementById(\'stGroups\').textContent = cs.filter(function(c){return c.type===\'group\'||c.type===\'supergroup\';}).length;' +
  '    document.getElementById(\'stChannels\').textContent = cs.filter(function(c){return c.type===\'channel\';}).length;' +
  '  }).catch(function(){});' +
  '}' +

  'function loadChats() {' +
  '  apiJ(\'chat-list\').then(function(d) {' +
  '    if (!d || !d.ok) return;' +
  '    allChats = Object.values(d.chats);' +
  '    renderChats(allChats);' +
  '  });' +
  '}' +

  'function renderChats(list) {' +
  '  var el = document.getElementById(\'chatTable\');' +
  '  if (!list.length) { el.innerHTML = \'<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>Belum ada chat terdaftar.<br><small>Suruh seseorang /start bot kamu</small></div>\'; return; }' +
  '  el.innerHTML = \'<div class="tbl-wrap"><table><thead><tr><th>ID</th><th>Nama</th><th>Tipe</th><th>Username</th><th>Bergabung</th><th></th></tr></thead><tbody>\' +' +
  '    list.map(function(c) { return \'<tr>\' +' +
  '      \'<td style="font-family:monospace;font-size:.72rem;color:var(--muted)">\' + c.id + \'</td>\' +' +
  '      \'<td style="font-weight:500">\' + esc(c.title||\'-\') + \'</td>\' +' +
  '      \'<td><span class="badge badge-\' + c.type + \'">\' + c.type + \'</span></td>\' +' +
  '      \'<td style="color:var(--muted)">\' + (c.username ? \'@\'+c.username : \'-\') + \'</td>\' +' +
  '      \'<td style="font-size:.75rem;color:var(--muted);white-space:nowrap">\' + new Date(c.added_at).toLocaleDateString(\'id-ID\') + \'</td>\' +' +
  '      \'<td><button class="btn btn-danger btn-sm btn-icon" onclick="delChat(\' + c.id + \')">🗑</button></td></tr>\';' +
  '    }).join(\'\') + \'</tbody></table></div>\';' +
  '}' +

  'function filterChats() {' +
  '  var q = document.getElementById(\'chatQ\').value.toLowerCase();' +
  '  renderChats(allChats.filter(function(c) { return (c.title||\'\'). toLowerCase().indexOf(q)>-1 || (c.username||\'\'). toLowerCase().indexOf(q)>-1 || String(c.id).indexOf(q)>-1; }));' +
  '}' +

  'function delChat(id) {' +
  '  if (!confirm(\'Hapus chat \'+id+\' dari list?\')) return;' +
  '  apiJ(\'remove-chat\', {chat_id: id}).then(function(d) {' +
  '    if (d.ok) { alert2(\'Chat dihapus.\'); loadChats(); loadStats(); }' +
  '    else alert2(\'Gagal: \'+d.error, \'err\');' +
  '  });' +
  '}' +

  'function loadFiles() {' +
  '  apiJ(\'get-files\').then(function(d) {' +
  '    if (!d || !d.ok) return;' +
  '    renderTree(d.menu);' +
  '    var sel = document.getElementById(\'fCat\');' +
  '    sel.innerHTML = Object.keys(d.menu).map(function(c) { return \'<option value="\'+esc(c)+\'">\'+esc(c)+\'</option>\'; }).join(\'\');' +
  '  });' +
  '}' +

  'function renderTree(menu) {' +
  '  var el = document.getElementById(\'fileTree\');' +
  '  var cats = Object.keys(menu);' +
  '  if (!cats.length) { el.innerHTML = \'<div class="empty-state">Belum ada kategori.<br><small>Tambah kategori di atas</small></div>\'; return; }' +
  '  el.innerHTML = cats.map(function(cat) {' +
  '    var vers = Object.keys(menu[cat]);' +
  '    return \'<div class="tree-cat">\' +' +
  '      \'<div class="tree-head"><span>📂 \'+esc(cat)+\' <span class="chip">\'+vers.length+\' file</span></span>\' +' +
  '      \'<button class="btn btn-danger btn-sm" onclick="delCat(\\\'\'+encodeURIComponent(cat)+\'\\\')" >🗑 Hapus Kategori</button></div>\' +' +
  '      (vers.length ? vers.map(function(v) { return \'<div class="tree-file"><span>📦 \'+esc(v)+\' <small style="color:var(--muted)">[\'+ menu[cat][v].file_type +\']</small></span>\' +' +
  '        \'<button class="btn btn-danger btn-sm" onclick="delFile(\\\'\'+encodeURIComponent(cat)+\'\\\',\\\'\'+encodeURIComponent(v)+\'\\\')" >🗑</button></div>\'; }).join(\'\') :' +
  '        \'<div class="tree-file" style="color:var(--muted);font-size:.82rem">Belum ada file dalam kategori ini.</div>\') +' +
  '      \'</div>\';' +
  '  }).join(\'\');' +
  '}' +

  'function addCat() {' +
  '  var name = document.getElementById(\'newCat\').value.trim();' +
  '  if (!name) return alert2(\'Masukkan nama kategori!\', \'err\');' +
  '  apiJ(\'add-category\', {name: name}).then(function(d) {' +
  '    if (d.ok) { alert2(\'Kategori berhasil ditambahkan!\'); document.getElementById(\'newCat\').value = \'\'; loadFiles(); }' +
  '    else alert2(\'Error: \'+d.error, \'err\');' +
  '  });' +
  '}' +

  'function delCat(catEnc) {' +
  '  var name = decodeURIComponent(catEnc);' +
  '  if (!confirm(\'Hapus kategori "\'+name+\'" beserta semua file di dalamnya?\')) return;' +
  '  apiJ(\'delete-category\', {name: name}).then(function(d) {' +
  '    if (d.ok) { alert2(\'Kategori dihapus!\'); loadFiles(); } else alert2(\'Error\', \'err\');' +
  '  });' +
  '}' +

  'function addFile() {' +
  '  var cat = document.getElementById(\'fCat\').value;' +
  '  var ver = document.getElementById(\'fVer\').value.trim();' +
  '  var fid = document.getElementById(\'fId\').value.trim();' +
  '  var ft = document.getElementById(\'fType\').value;' +
  '  var cap = document.getElementById(\'fCap\').value.trim();' +
  '  if (!cat || !ver || !fid) return alert2(\'Lengkapi semua field!\', \'err\');' +
  '  apiJ(\'add-file\', {category:cat,version:ver,file_id:fid,file_type:ft,caption:cap}).then(function(d) {' +
  '    if (d.ok) { alert2(\'File berhasil disimpan!\'); loadFiles(); } else alert2(\'Error: \'+d.error, \'err\');' +
  '  });' +
  '}' +

  'function delFile(catEnc, verEnc) {' +
  '  var cat = decodeURIComponent(catEnc), ver = decodeURIComponent(verEnc);' +
  '  if (!confirm(\'Hapus file "\'+ver+\'"?\')) return;' +
  '  apiJ(\'delete-file\', {category:cat,version:ver}).then(function(d) {' +
  '    if (d.ok) { alert2(\'File dihapus!\'); loadFiles(); } else alert2(\'Error\', \'err\');' +
  '  });' +
  '}' +

  'function setMode(m) {' +
  '  curMode = m;' +
  '  [\'text\',\'photo\',\'video\'].forEach(function(x) { document.getElementById(\'m-\'+x).style.display = x===m ? \'block\' : \'none\'; });' +
  '  [\'text\',\'photo\',\'video\'].forEach(function(x) { document.getElementById(\'mt-\'+x).classList.toggle(\'active\', x===m); });' +
  '}' +

  'function sendBroadcast() {' +
  '  var target = document.getElementById(\'bcTarget\').value;' +
  '  var payload = {mode: curMode, target: target};' +
  '  if (curMode===\'text\') {' +
  '    payload.text = document.getElementById(\'bcText\').value.trim();' +
  '    if (!payload.text) return alert2(\'Tulis pesan dulu!\', \'err\');' +
  '  } else if (curMode===\'photo\') {' +
  '    payload.photo = document.getElementById(\'bcPhoto\').value.trim();' +
  '    payload.caption = document.getElementById(\'bcPhotoCaption\').value.trim();' +
  '    if (!payload.photo) return alert2(\'Masukkan URL/File ID foto!\', \'err\');' +
  '  } else {' +
  '    payload.video = document.getElementById(\'bcVideo\').value.trim();' +
  '    payload.caption = document.getElementById(\'bcVideoCaption\').value.trim();' +
  '    if (!payload.video) return alert2(\'Masukkan URL/File ID video!\', \'err\');' +
  '  }' +
  '  var prog = document.getElementById(\'bcProgress\');' +
  '  prog.style.display = \'block\';' +
  '  document.getElementById(\'bcStatus\').textContent = \'Sedang mengirim ke semua pengguna...\';' +
  '  document.getElementById(\'bcBar\').style.width = \'20%\';' +
  '  apiJ(\'broadcast\', payload).then(function(d) {' +
  '    document.getElementById(\'bcBar\').style.width = \'100%\';' +
  '    if (d.ok) {' +
  '      document.getElementById(\'bcStatus\').textContent = \'✅ Selesai! Berhasil: \'+d.success+\', Gagal: \'+d.failed;' +
  '      alert2(\'Broadcast selesai! \'+d.success+\' pesan terkirim.\');' +
  '    } else {' +
  '      document.getElementById(\'bcStatus\').textContent = \'Error: \'+d.error;' +
  '      alert2(\'Broadcast gagal!\', \'err\');' +
  '    }' +
  '  });' +
  '}' +

  'function loadContent() {' +
  '  apiJ(\'get-settings\').then(function(d) {' +
  '    if (!d || !d.ok) return;' +
  '    document.getElementById(\'sInfo\').value = d.bot_info || \'\';' +
  '    document.getElementById(\'sYt\').value = d.youtube_info || \'\';' +
  '    document.getElementById(\'sAnn\').value = d.latest_announcement || \'\';' +
  '  });' +
  '}' +

  'function saveSetting(key, elId, label) {' +
  '  var value = document.getElementById(elId).value;' +
  '  apiJ(\'save-setting\', {key:key,value:value}).then(function(d) {' +
  '    if (d.ok) alert2(label+\' berhasil disimpan! ✅\'); else alert2(\'Gagal menyimpan.\', \'err\');' +
  '  });' +
  '}' +

  'function delSetting(key, elId, label) {' +
  '  if (!confirm(\'Hapus \'+label+\'?\')) return;' +
  '  apiJ(\'delete-setting\', {key:key}).then(function(d) {' +
  '    if (d.ok) { document.getElementById(elId).value = \'\'; alert2(label+\' dihapus!\'); }' +
  '    else alert2(\'Gagal!\', \'err\');' +
  '  });' +
  '}' +

  'function saveAndBroadcast() {' +
  '  var text = document.getElementById(\'sAnn\').value.trim();' +
  '  if (!text) return alert2(\'Tulis pengumuman dulu!\', \'err\');' +
  '  apiJ(\'save-setting\', {key:\'latest_announcement\',value:text}).then(function(d) {' +
  '    if (!d.ok) return alert2(\'Gagal simpan.\', \'err\');' +
  '    apiJ(\'broadcast\', {mode:\'text\',target:\'all\',text:text}).then(function(d2) {' +
  '      if (d2.ok) alert2(\'📢 Pengumuman disimpan & dikirim ke \'+d2.success+\' pengguna!\');' +
  '      else alert2(\'Disimpan tapi broadcast gagal: \'+d2.error, \'err\');' +
  '    });' +
  '  });' +
  '}' +

  'function setupWebhook() {' +
  '  apiJ(\'setup-webhook\', {}).then(function(d) {' +
  '    if (d.ok) alert2(\'✅ Webhook berhasil di-setup!\'); else alert2(\'Gagal: \'+JSON.stringify(d), \'err\');' +
  '  });' +
  '}' +

  'function esc(s) {' +
  '  return String(s).replace(/&/g,\'&amp;\').replace(/</g,\'&lt;\').replace(/>/g,\'&gt;\').replace(/"/g,\'&quot;\');' +
  '}' +

  'function init() {' +
  '  var u = ORIGIN + \'/dashboard?k=\' + encodeURIComponent(K);' +
  '  document.getElementById(\'webhookUrl\').value = ORIGIN + \'/webhook\';' +
  '  document.getElementById(\'dashUrl\').value = u;' +
  '  if (document.getElementById(\'wh2\')) document.getElementById(\'wh2\').value = ORIGIN + \'/webhook\';' +
  '  loadStats();' +
  '}' +

  'window.onload = init;' +
  '<\/script></body></html>';

  return html;
}

// ─── MAIN EXPORT ──────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Dashboard-Password" } });
    }
    if (url.pathname === "/webhook") return handleWebhook(request, env);
    if (url.pathname === "/dashboard") {
      const k = url.searchParams.get("k");
      if (k && k === env.DASHBOARD_PASSWORD) {
        return new Response(dashboardHTML(url.origin, k), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
      return new Response(loginHTML(url.origin), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }
    if (url.pathname.startsWith("/api/")) return handleAPI(request, env, url);
    return Response.redirect(url.origin + "/dashboard", 302);
  },
};
