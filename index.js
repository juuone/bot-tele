// ============================================================
//  TELEGRAM BOT + WEB DASHBOARD — Cloudflare Workers (MATANG)
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
  chats[String(chat.id)] = {
    id: chat.id,
    type: chat.type, // private | group | supergroup | channel
    title: chat.title || chat.first_name || chat.username || "Unknown",
    username: chat.username || null,
    added_at: new Date().toISOString(),
  };
  await saveChats(env, chats);
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
  const d = await env.BOT_KV.get(`pending:${userId}`);
  return d ? JSON.parse(d) : null;
}
async function setPending(env, userId, data) {
  if (data === null) return env.BOT_KV.delete(`pending:${userId}`);
  return env.BOT_KV.put(`pending:${userId}`, JSON.stringify(data), {
    expirationTtl: 300,
  });
}

// ─── INLINE KEYBOARDS ────────────────────────────────────────

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "PANEL: Download App", callback_data: "menu:apps" },
        { text: "PANEL: YouTube Channel", callback_data: "menu:youtube" },
      ],
      [
        { text: "PANEL: Pengumuman", callback_data: "menu:announcements" },
        { text: "PANEL: Informasi Bot", callback_data: "menu:info" },
      ],
    ],
  };
}

function categoryKeyboard(menu) {
  const cats = Object.keys(menu);
  if (!cats.length)
    return {
      inline_keyboard: [[{ text: "BACK: Kembali", callback_data: "menu:main" }]],
    };
  const rows = [];
  for (let i = 0; i < cats.length; i += 2) {
    const row = [{ text: "DIR: " + cats[i], callback_data: "cat:" + cats[i] }];
    if (cats[i + 1])
      row.push({
        text: "DIR: " + cats[i + 1],
        callback_data: "cat:" + cats[i + 1],
      });
    rows.push(row);
  }
  rows.push([{ text: "BACK: Kembali", callback_data: "menu:main" }]);
  return { inline_keyboard: rows };
}

function versionKeyboard(category, versions) {
  const keys = Object.keys(versions);
  const rows = keys.map((v) => [
    { text: "FILE: " + v, callback_data: `file:${category}:${v}` },
  ]);
  rows.push([{ text: "BACK: Kembali", callback_data: "menu:apps" }]);
  return { inline_keyboard: rows };
}

function backKeyboard(target = "menu:main") {
  return { inline_keyboard: [[{ text: "BACK: Kembali", callback_data: target }]] };
}

// ─── COMMAND HANDLERS ────────────────────────────────────────

async function cmdStart(token, chat, user, env) {
  await addChat(env, chat);
  
  // Mengambil Bio/Deskripsi pengguna secara real-time melalui API Telegram
  let userBio = "Tidak menyertakan bio.";
  try {
    const chatProfile = await TG(token, "getChat", { chat_id: user.id });
    if (chatProfile.ok && chatProfile.result.bio) {
      userBio = chatProfile.result.bio;
    }
  } catch (err) {
    // Fail-safe jika privacy user sangat ketat
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const usernameText = user.username ? `@${user.username}` : "Tidak diset";
  const premiumStatus = user.is_premium ? "User Premium (Aktif)" : "User Standar";

  // Desain teks bersih tanpa emoji, menggunakan pembatas garis modern
  const profileMenuText = `
━━━━━━━━━━━━━━━━━━━━━━━━
  INFORMASI AKUN & MENU UTAMA
━━━━━━━━━━━━━━━━━━━━━━━━

DATA PENGGUNA:
• Nama Lengkap : ${fullName}
• ID Telegram  : <code>${user.id}</code>
• Username     : ${usernameText}
• Akun Status  : ${premiumStatus}
• Deskripsi Bio: <i>${userBio}</i>

SISTEM AKTIF:
Silakan gunakan tombol navigasi di bawah ini untuk mengunduh berkas atau mendapatkan pembaharuan informasi secara berkala.
`;

  await TG(token, "sendMessage", {
    chat_id: chat.id,
    parse_mode: "HTML",
    text: profileMenuText.trim(),
    reply_markup: mainMenuKeyboard(),
  });
}

async function cmdBroadcast(token, msg, env, isAdmin) {
  if (!isAdmin)
    return TG(token, "sendMessage", {
      chat_id: msg.chat.id,
      text: "SYSTEM: Hak akses ditolak. Anda bukan administrator.",
    });
  const text = msg.text.replace(/^\/broadcast\s*/i, "").trim();
  if (!text)
    return TG(token, "sendMessage", {
      chat_id: msg.chat.id,
      text: "FORMAT ERROR: Gunakan /broadcast <pesan>",
    });

  const chats = await getChats(env);
  let ok = 0, fail = 0;
  for (const c of Object.values(chats)) {
    const r = await TG(token, "sendMessage", {
      chat_id: c.id,
      text,
      parse_mode: "HTML",
    });
    if (r.ok) ok++;
    else {
      fail++;
      if (r.error_code === 403) await removeChat(env, c.id);
    }
  }
  TG(token, "sendMessage", {
    chat_id: msg.chat.id,
    text: `SYSTEM BROADCAST SELESAI\n• Berhasil dikirim: ${ok}\n• Gagal terkirim: ${fail}`,
  });
}

async function cmdStats(token, chatId, env, isAdmin) {
  if (!isAdmin) return;
  const chats = Object.values(await getChats(env));
  const u = chats.filter((c) => c.type === "private").length;
  const g = chats.filter((c) => c.type === "group" || c.type === "supergroup").length;
  const ch = chats.filter((c) => c.type === "channel").length;
  TG(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `━━━━━━━━━━━━━━━━━━━━━━━━\n  STATISTIK DATABASE BOT\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n• Private Users : ${u}\n• Group Chats  : ${g}\n• Channels     : ${ch}\n\nTOTAL HUBUNGAN: ${chats.length}`,
  });
}

async function cmdAddCat(token, chatId, text, env, isAdmin) {
  if (!isAdmin) return;
  const name = text.replace(/^\/addcat\s*/i, "").trim();
  if (!name) return TG(token, "sendMessage", { chat_id: chatId, text: "Gunakan: /addcat <nama_kategori>" });
  const menu = await getMenu(env);
  if (!menu[name]) {
    menu[name] = {};
    await saveMenu(env, menu);
  }
  TG(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `SUCCESS: Kategori "<b>${name}</b>" telah didaftarkan.`,
  });
}

async function cmdDelCat(token, chatId, text, env, isAdmin) {
  if (!isAdmin) return;
  const name = text.replace(/^\/delcat\s*/i, "").trim();
  if (!name) return TG(token, "sendMessage", { chat_id: chatId, text: "Gunakan: /delcat <nama_kategori>" });
  const menu = await getMenu(env);
  if (menu[name]) {
    delete menu[name];
    await saveMenu(env, menu);
    TG(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: `SUCCESS: Kategori "<b>${name}</b>" telah dihapus.` });
  } else {
    TG(token, "sendMessage", { chat_id: chatId, text: `ERROR: Kategori tidak ditemukan.` });
  }
}

async function cmdAddFile(token, chatId, userId, text, env, isAdmin) {
  if (!isAdmin) return;
  const raw = text.replace(/^\/addfile\s*/i, "").trim();
  const parts = raw.split("|");
  if (parts.length < 2)
    return TG(token, "sendMessage", {
      chat_id: chatId,
      text: "FORMAT: /addfile <kategori> | <versi>\n\nLalu segera lampirkan file Anda.",
    });
  const category = parts[0].trim();
  const version = parts[1].trim();
  await setPending(env, userId, { action: "add_file", category, version });
  TG(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `QUEUE: Siap menerima data.\n• Kategori: <b>${category}</b>\n• Versi: <b>${version}</b>\n\nKirimkan file arsip sekarang.`,
  });
}

async function cmdListCat(token, chatId, env, isAdmin) {
  if (!isAdmin) return;
  const menu = await getMenu(env);
  const cats = Object.keys(menu);
  if (!cats.length) return TG(token, "sendMessage", { chat_id: chatId, text: "Kategori masih kosong." });
  const list = cats.map((c, i) => `${i + 1}. ${c} (${Object.keys(menu[c]).length} file)`).join("\n");
  TG(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: `DAFTAR KATEGORI SAAAT INI:\n${list}` });
}

async function cmdHelp(token, chatId, isAdmin) {
  const adminCmds = isAdmin
    ? `\n\nADMIN COMMANDS:\n` +
      `/broadcast <pesan> - Broadcast global\n` +
      `/stats - Statistik data\n` +
      `/addcat <nama> - Tambah kategori\n` +
      `/delcat <nama> - Hapus kategori\n` +
      `/addfile <cat> | <ver> - Upload file via id\n` +
      `/listcat - Cek index kategori`
    : "";
  TG(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `PANDUAN PERINTAH BOT\n\n/start - Membuka profil & menu utama\n/help - Menampilkan panduan teks ini${adminCmds}`,
  });
}

// ─── FILE UPLOAD HANDLER ─────────────────────────────────────

async function handleFileUpload(token, msg, env) {
  const userId = String(msg.from.id);
  const pending = await getPending(env, userId);
  if (!pending || pending.action !== "add_file") return false;

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
  menu[pending.category][pending.version] = {
    file_id: fileId,
    file_type: fileType,
    caption,
    from_chat_id: msg.chat.id,
    message_id: msg.message_id,
    added_at: new Date().toISOString(),
  };
  await saveMenu(env, menu);
  await setPending(env, userId, null);

  TG(token, "sendMessage", {
    chat_id: msg.chat.id,
    parse_mode: "HTML",
    text: `SUCCESS: File berhasil disimpan ke cloud database.\n• Kategori: <b>${pending.category}</b>\n• Versi: <b>${pending.version}</b>`,
  });
  return true;
}

// ─── CALLBACK QUERY HANDLER ───────────────────────────────────

async function handleCallback(token, query, env) {
  const { id, data, message } = query;
  const chatId = message.chat.id;
  const msgId = message.message_id;

  await TG(token, "answerCallbackQuery", { callback_query_id: id });

  const edit = (text, kb) =>
    TG(token, "editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text,
      parse_mode: "HTML",
      reply_markup: kb,
    });

  if (data === "menu:main") {
    return edit("━━━━━━━━━━━━━━━━━━━━\n PANEL UTAMA NAVIGASI\n━━━━━━━━━━━━━━━━━━━━\n\nSilakan tentukan menu Anda:", mainMenuKeyboard());
  }
  if (data === "menu:apps") {
    const menu = await getMenu(env);
    return edit("━━━━━━━━━━━━━━━━━━━━\n SELEKSI KATEGORI UNDUHAN\n━━━━━━━━━━━━━━━━━━━━\n\nPilih direktori aplikasi:", categoryKeyboard(menu));
  }
  if (data === "menu:youtube") {
    const txt = (await env.BOT_KV.get("youtube_info")) || "Data informasi channel YouTube belum di-set.";
    return edit(`INFORMASI YOUTUBE\n\n${txt}`, backKeyboard());
  }
  if (data === "menu:announcements") {
    const txt = (await env.BOT_KV.get("latest_announcement")) || "Belum ada pengumuman berkala terbaru.";
    return edit(`PENGUMUMAN TERBARU\n\n${txt}`, backKeyboard());
  }
  if (data === "menu:info") {
    const txt = (await env.BOT_KV.get("bot_info")) || "Informasi bot core developer.";
    return edit(`INFORMASI BOT\n\n${txt}`, backKeyboard());
  }

  if (data.startsWith("cat:")) {
    const category = data.slice(4);
    const menu = await getMenu(env);
    const versions = menu[category] || {};
    if (!Object.keys(versions).length) {
      return edit(`DIREKTORI: ${category}\n\nBelum ada file di kategori ini.`, backKeyboard("menu:apps"));
    }
    return edit(`DIREKTORI: ${category}\n\nPilih versi rilis paket:`, versionKeyboard(category, versions));
  }

  if (data.startsWith("file:")) {
    const parts = data.split(":");
    const category = parts[1];
    const version = parts[2];
    const menu = await getMenu(env);
    const file = menu[category]?.[version];

    if (!file) {
      return TG(token, "sendMessage", { chat_id: chatId, text: "ERROR: Berkas file telah dihapus dari server." });
    }

    const cap = file.caption || `PRODUK: ${category} — ${version}`;
    const sendParams = { chat_id: chatId, caption: cap, parse_mode: "HTML" };

    const methodMap = {
      document: ["sendDocument", "document"],
      video: ["sendVideo", "video"],
      photo: ["sendPhoto", "photo"],
      audio: ["sendAudio", "audio"],
      animation: ["sendAnimation", "animation"],
    };

    const [method, key] = methodMap[file.file_type] || ["sendDocument", "document"];
    sendParams[key] = file.file_id;

    try {
      await TG(token, method, sendParams);
      await TG(token, "sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: `DELIVERY SUCCESS: Berkas ${version} berhasil diantarkan.`,
        reply_markup: backKeyboard("menu:main"),
      });
    } catch {
      TG(token, "sendMessage", { chat_id: chatId, text: "DELIVERY FAILED: Hubungi admin untuk validasi file_id." });
    }
    return;
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
    const isAdmin = String(user?.id) === adminId;
    const text = msg.text || "";

    const isGroup = chat.type === "group" || chat.type === "supergroup";
    const botMe = await TG(token, "getMe");
    const botUsername = botMe.result?.username || "";

    // ── CRITICAL FILTER GRUP ──
    if (isGroup) {
      const isCommand = text.startsWith("/");
      const isTagged = text.includes(`@${botUsername}`);
      
      // Jika di dalam grup dan tidak di-tag atau bukan diawali /, abaikan sepenuhnya
      if (!isCommand && !isTagged) {
        return new Response("OK");
      }
    }

    // Auto-save chat list ketika bot di-add ke grup baru
    if (msg.new_chat_members && msg.new_chat_members.some((m) => m.id === botMe.result?.id)) {
      await addChat(env, chat);
      return new Response("OK");
    }
    if (msg.left_chat_member && msg.left_chat_member.id === botMe.result?.id) {
      await removeChat(env, chat.id);
      return new Response("OK");
    }

    // Admin file handler
    if (isAdmin && (msg.document || msg.video || msg.photo || msg.audio || msg.animation)) {
      const handled = await handleFileUpload(token, msg, env);
      if (handled) return new Response("OK");
    }

    // Perutean Perintah (Commands Router)
    if (text.match(/^\/start/i)) {
      await cmdStart(token, chat, user, env);
    } else if (text.match(/^\/broadcast/i)) {
      await cmdBroadcast(token, msg, env, isAdmin);
    } else if (text.match(/^\/stats/i)) {
      await cmdStats(token, chat.id, env, isAdmin);
    } else if (text.match(/^\/addcat/i)) {
      await cmdAddCat(token, chat.id, text, env, isAdmin);
    } else if (text.match(/^\/delcat/i)) {
      await cmdDelCat(token, chat.id, text, env, isAdmin);
    } else if (text.match(/^\/addfile/i)) {
      await cmdAddFile(token, chat.id, String(user.id), text, env, isAdmin);
    } else if (text.match(/^\/listcat/i)) {
      await cmdListCat(token, chat.id, env, isAdmin);
    } else if (text.match(/^\/help/i)) {
      await cmdHelp(token, chat.id, isAdmin);
    } else if (text.match(/^\/setinfo/i) && isAdmin) {
      const val = text.replace(/^\/setinfo\s*/i, "").trim();
      await env.BOT_KV.put("bot_info", val);
      await TG(token, "sendMessage", { chat_id: chat.id, text: "SYSTEM: Konfigurasi info bot disimpan." });
    } else if (text.match(/^\/setyoutube/i) && isAdmin) {
      const val = text.replace(/^\/setyoutube\s*/i, "").trim();
      await env.BOT_KV.put("youtube_info", val);
      await TG(token, "sendMessage", { chat_id: chat.id, text: "SYSTEM: Konfigurasi info Youtube disimpan." });
    } else {
      // ── PRIVAT CHAT NON-COMMAND FALLBACK ──
      if (!isGroup && !text.startsWith("/")) {
        await TG(token, "sendMessage", {
          chat_id: chat.id,
          parse_mode: "HTML",
          text: `Sistem tidak mengenali instruksi teks biasa.\n\nSilakan ketik atau klik perintah <b>/start</b> atau <b>/menu</b> untuk memuat ulang profil fungsional Anda.`,
        });
      }
    }
  }

  if (update.callback_query) {
    await handleCallback(token, update.callback_query, env);
  }

  if (update.my_chat_member) {
    const { chat, new_chat_member } = update.my_chat_member;
    const status = new_chat_member?.status;
    if (status === "member" || status === "administrator") await addChat(env, chat);
    else if (status === "kicked" || status === "left") await removeChat(env, chat.id);
  }

  return new Response("OK");
}

// ─── API HANDLERS (WITH FULL CORS FIXED) ───────────────────────

function checkAuth(request, env) {
  return request.headers.get("X-Dashboard-Password") === env.DASHBOARD_PASSWORD;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Dashboard-Password",
    },
  });
}

async function handleAPI(request, env, url) {
  const path = url.pathname.replace(/^\/api\//, "");

  if (path === "check-config") {
    return json({
      pw_set: !!env.DASHBOARD_PASSWORD,
      pw_len: env.DASHBOARD_PASSWORD?.length || 0,
      token_set: !!env.BOT_TOKEN,
      kv_set: !!env.BOT_KV,
    });
  }

  if (path === "verify") {
    if (!checkAuth(request, env)) return json({ ok: false, error: "Password mismatch" }, 401);
    return json({ ok: true });
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
    menu[body.category][body.version] = {
      file_id: body.file_id,
      file_type: body.file_type || "document",
      caption: body.caption || "",
      added_at: new Date().toISOString(),
    };
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
  if (path === "get-settings") {
    const [bot_info, youtube_info, latest_announcement] = await Promise.all([
      env.BOT_KV.get("bot_info"),
      env.BOT_KV.get("youtube_info"),
      env.BOT_KV.get("latest_announcement"),
    ]);
    return json({ ok: true, bot_info, youtube_info, latest_announcement });
  }
  if (path === "save-setting") {
    const { key, value } = await request.json();
    await env.BOT_KV.put(key, value);
    return json({ ok: true });
  }
  if (path === "setup-webhook") {
    const r = await TG(token, "setWebhook", {
      url: `${url.origin}/webhook`,
      secret_token: env.WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query", "my_chat_member"],
    });
    return json({ ok: r.ok, result: r });
  }
  if (path === "broadcast") {
    const body = await request.json();
    const chats = await getChats(env);
    let list = Object.values(chats);

    if (body.target === "users") list = list.filter((c) => c.type === "private");
    else if (body.target === "groups") list = list.filter((c) => c.type === "group" || c.type === "supergroup");
    else if (body.target === "channels") list = list.filter((c) => c.type === "channel");

    let success = 0, failed = 0;
    for (const chat of list) {
      try {
        let r;
        if (body.mode === "text") r = await TG(token, "sendMessage", { chat_id: chat.id, text: body.text, parse_mode: "HTML" });
        else if (body.mode === "photo") r = await TG(token, "sendPhoto", { chat_id: chat.id, photo: body.photo, caption: body.caption, parse_mode: "HTML" });
        else if (body.mode === "video") r = await TG(token, "sendVideo", { chat_id: chat.id, video: body.video, caption: body.caption, parse_mode: "HTML" });
        if (r?.ok) success++; else { failed++; if (r?.error_code === 403) await removeChat(env, chat.id); }
      } catch { failed++; }
    }
    return json({ ok: true, success, failed });
  }

  return json({ ok: false, error: "Not found" }, 404);
}

// ─── DASHBOARD HTML (REPLACED WITH CLEAN SVG ICONS) ───────────

function dashboardHTML(origin) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Control Panel Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#080c14;--surface:#0f1626;--surface2:#17223b;--border:#1e293b;
  --accent:#2563eb;--accent2:#7c3aed;--green:#10b981;--red:#ef4444;
  --text:#f8fafc;--muted:#64748b;--card:#111b2e;
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
.topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.topbar h1{font-size:1.1rem;color:var(--text);display:flex;align-items:center;gap:.5rem}
.online{display:flex;align-items:center;gap:.5rem;font-size:.8rem;color:var(--green)}
.dot{width:8px;height:8px;background:var(--green);border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
#overlay{position:fixed;inset:0;background:var(--bg);display:flex;align-items:flex-start;justify-content:center;z-index:999;overflow-y:auto;padding:4rem 0}
.login-box{background:var(--surface);border:1px solid var(--border);border-radius:1rem;padding:2rem;width:min(400px,90vw);margin:auto;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5)}
.login-box h1{font-size:1.3rem;margin-bottom:.5rem;text-align:center}
.login-box p{color:var(--muted);text-align:center;margin-bottom:1.5rem;font-size:.85rem}
.wrapper{display:grid;grid-template-columns:240px 1fr;min-height:calc(100vh - 56px)}
@media(max-width:768px){.wrapper{grid-template-columns:1fr}}
.sidebar{background:var(--surface);border-right:1px solid var(--border);padding:1rem;display:flex;flex-direction:column;gap:.25rem}
@media(max-width:768px){.sidebar{flex-direction:row;overflow-x:auto;padding:.5rem;position:sticky;top:56px;z-index:90}}
.nav-item{display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;border-radius:.5rem;cursor:pointer;color:var(--muted);font-size:.9rem;font-weight:500;transition:.15s}
.nav-item:hover{background:var(--surface2);color:var(--text)}
.nav-item.active{background:var(--accent);color:#fff}
.nav-svg{width:18px;height:18px;fill:currentColor}
main{padding:2rem;max-width:1100px;width:100%}
.page{display:none}.page.active{display:block}
.page-title{font-size:1.4rem;font-weight:700;margin-bottom:1.5rem;color:var(--text)}
.card{background:var(--card);border:1px solid var(--border);border-radius:.75rem;padding:1.5rem;margin-bottom:1.5rem}
.card-title{font-size:1rem;font-weight:600;margin-bottom:1.25rem;display:flex;align-items:center;gap:.5rem;border-left:3px solid var(--accent);padding-left:.5rem}
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:1.5rem}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:.5rem;padding:1.25rem}
.stat-n{font-size:2rem;font-weight:700;color:var(--text)}
.stat-l{font-size:.8rem;color:var(--muted);margin-top:.2rem;font-weight:500}
label{display:block;font-size:.8rem;color:var(--muted);margin-bottom:.4rem;font-weight:500}
input,textarea,select{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:.4rem;color:var(--text);padding:.65rem .85rem;font-size:.9rem;transition:.15s}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--accent)}
textarea{resize:vertical;min-height:120px}
.fg{margin-bottom:1.25rem}
.row{display:flex;gap:1rem;flex-wrap:wrap}
.row .fg{flex:1;min-width:200px}
.btn{padding:.65rem 1.25rem;border:none;border-radius:.4rem;cursor:pointer;font-size:.9rem;font-weight:600;transition:.15s;display:inline-flex;align-items:center;gap:.5rem}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{opacity:0.9}
.btn-success{background:var(--green);color:#fff}.btn-success:hover{opacity:0.9}
.btn-danger{background:var(--red);color:#fff}.btn-danger:hover{opacity:0.9}
.btn-sm{padding:.35rem .75rem;font-size:.8rem;border-radius:.3rem}
.btn-ghost{background:transparent;color:var(--text);border:1px solid var(--border)}.btn-ghost:hover{background:var(--surface2)}
.alert{padding:.75rem 1rem;border-radius:.4rem;font-size:.85rem;margin-bottom:1.25rem}
.alert-ok{background:rgba(16,185,129,0.1);border:1px solid var(--green);color:#A7F3D0}
.alert-err{background:rgba(239,68,68,0.1);border:1px solid var(--red);color:#FCA5A5}
.alert-info{background:rgba(37,99,235,0.1);border:1px solid var(--accent);color:#BFDBFE}
.mtabs{display:flex;gap:.5rem;margin-bottom:1.25rem}
.mtab{padding:.5rem 1rem;border-radius:.4rem;background:var(--surface);border:1px solid var(--border);cursor:pointer;font-size:.85rem;color:var(--muted);font-weight:500}
.mtab.active{background:var(--surface2);border-color:var(--accent);color:var(--text)}
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{color:var(--muted);font-weight:600;padding:.75rem;border-bottom:1px solid var(--border);text-align:left}
td{padding:.75rem;border-bottom:1px solid var(--border);color:#cbd5e1}
tr:last-child td{border:none}
.badge{padding:.2rem .5rem;border-radius:.25rem;font-size:.7rem;font-weight:600;text-transform:uppercase}
.badge-private{background:rgba(37,99,235,0.2);color:#93c5fd}
.badge-group{background:rgba(16,185,129,0.2);color:#86efac}
.badge-supergroup{background:rgba(234,179,8,0.2);color:#fef08a}
.badge-channel{background:rgba(239,68,68,0.2);color:#fca5a5}
.prog-wrap{background:var(--surface);border-radius:.5rem;height:6px;overflow:hidden}
.prog{height:100%;background:var(--accent);width:0%;transition:width .3s}
.tree-cat{background:var(--surface);border:1px solid var(--border);border-radius:.5rem;overflow:hidden;margin-bottom:1rem}
.tree-cat-header{padding:.75rem 1rem;background:rgba(255,255,255,0.02);display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:.9rem}
.tree-file{padding:.65rem 1rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:.85rem}
code{font-family:monospace;background:rgba(0,0,0,0.2);padding:.2rem .4rem;border-radius:.25rem;color:#f472b6}
</style>
</head>
<body>

<div id="overlay">
  <div class="login-box">
    <h1>Dashboard Master</h1>
    <p>Masukkan kunci otentikasi server</p>
    <div id="loginErr" style="display:none" class="alert alert-err"></div>
    <div id="loginInfo" style="display:none" class="alert alert-info"></div>
    <div class="fg">
      <label>Password Server</label>
      <input type="password" id="pwInput" placeholder="••••••••" onkeydown="if(event.key==='Enter')login()">
    </div>
    <button class="btn btn-primary" id="loginBtn" style="width:100%;justify-content:center;margin-bottom:.5rem" onclick="login()">Verifikasi Masuk</button>
    <button class="btn btn-ghost" style="width:100%;justify-content:center;font-size:.75rem" onclick="checkPwSet()">Cek Status Environtment Variables</button>
  </div>
</div>

<div class="topbar">
  <h1>Control Terminal Cloud</h1>
  <div class="online"><div class="dot"></div><span id="botName">Koneksi Aktif</span></div>
</div>

<div class="wrapper">
  <nav class="sidebar">
    <div class="nav-item active" onclick="go('overview')">
      <svg class="nav-svg" viewBox="0 0 24 24"><path d="M10 20H4V14H10V20ZM10 12H4V4H10V12ZM20 20H14V12H20V20ZM20 10H14V4H20V10Z"/></svg>
      Overview
    </div>
    <div class="nav-item" onclick="go('broadcast')">
      <svg class="nav-svg" viewBox="0 0 24 24"><path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.2L4 17.2V4H20V16Z"/></svg>
      Broadcast Global
    </div>
    <div class="nav-item" onclick="go('chats')">
      <svg class="nav-svg" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
      Daftar Chat List
    </div>
    <div class="nav-item" onclick="go('files')">
      <svg class="nav-svg" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
      Manajer File Cloud
    </div>
    <div class="nav-item" onclick="go('settings')">
      <svg class="nav-svg" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
      Pengaturan Core
    </div>
  </nav>

  <main>
    <div id="globalAlert"></div>

    <div class="page active" id="page-overview">
      <div class="page-title">Ringkasan Sistem</div>
      <div class="stats-row">
        <div class="stat"><div class="stat-n" id="stTotal">-</div><div class="stat-l">Total Pipeline Chat</div></div>
        <div class="stat"><div class="stat-n" id="stUsers">-</div><div class="stat-l">Pribadi / User</div></div>
        <div class="stat"><div class="stat-n" id="stGroups">-</div><div class="stat-l">Grup Komunitas</div></div>
        <div class="stat"><div class="stat-n" id="stChannels">-</div><div class="stat-l">Channel Penyiaran</div></div>
      </div>
      <div class="card">
        <div class="card-title">Lokasi Webhook Api</div>
        <code id="webhookUrl" style="display:block;margin:0.5rem 0;font-size:0.85rem"></code>
        <button class="btn btn-success btn-sm" onclick="setupWebhook()">Aktifkan Sesi Webhook Ulang</button>
      </div>
    </div>

    <div class="page" id="page-broadcast">
      <div class="page-title">Broadcast Konten Antrean</div>
      <div class="card">
        <div class="card-title">Konfigurasi Payload</div>
        <div class="mtabs">
          <div class="mtab active" onclick="setMode('text')">Payload Teks</div>
          <div class="mtab" onclick="setMode('photo')">Payload Image/Foto</div>
          <div class="mtab" onclick="setMode('video')">Payload Video Stream</div>
        </div>

        <div id="m-text">
          <div class="fg">
            <label>Template Pesan HTML</label>
            <textarea id="bcText" placeholder="Ketik pesan HTML di sini..."></textarea>
          </div>
        </div>
        <div id="m-photo" style="display:none">
          <div class="fg"><label>Source Target Gambar (URL / File ID)</label><input type="text" id="bcPhoto"></div>
          <div class="fg"><label>Caption HTML</label><textarea id="bcPhotoCaption"></textarea></div>
        </div>
        <div id="m-video" style="display:none">
          <div class="fg"><label>Source Target Video (URL / File ID)</label><input type="text" id="bcVideo"></div>
          <div class="fg"><label>Caption HTML</label><textarea id="bcVideoCaption"></textarea></div>
        </div>

        <div class="row">
          <div class="fg">
            <label>Filter Target Pengiriman</label>
            <select id="bcTarget">
              <option value="all">Kirim Global ke Semua Entitas</option>
              <option value="users">Hanya Akun Pribadi (Private Users)</option>
              <option value="groups">Hanya Grup Obrolan (Groups)</option>
              <option value="channels">Hanya Channel Pengumuman</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary" onclick="sendBroadcast()">Luncurkan Proses Broadcast</button>

        <div id="bcProgress" style="margin-top:1.5rem;display:none">
          <div style="font-size:0.8rem;color:var(--muted);margin-bottom:0.5rem" id="bcStatus">Inisialisasi Server...</div>
          <div class="prog-wrap"><div class="prog" id="bcBar"></div></div>
        </div>
      </div>
    </div>

    <div class="page" id="page-chats">
      <div class="page-title">Indeks Pipeline Chat</div>
      <div class="card">
        <div class="card-title">Filter Log Database</div>
        <div style="display:flex;gap:0.5rem;margin-bottom:1rem">
          <input type="text" id="chatQ" placeholder="Cari ID, Nama, atau Identitas Akun..." oninput="filterChats()">
          <button class="btn btn-ghost" onclick="loadChats()">Muat Ulang</button>
        </div>
        <div id="chatTable" class="tbl-wrap"></div>
      </div>
    </div>

    <div class="page" id="page-files">
      <div class="page-title">Penyimpanan File Cloud</div>
      <div class="card">
        <div class="card-title">Kategori Berkas Baru</div>
        <div style="display:flex;gap:0.5rem">
          <input type="text" id="newCat" placeholder="Ketik nama kategori baru...">
          <button class="btn btn-success" onclick="addCat()">Daftarkan</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Struktur Database Direktori</div>
        <div id="fileTree"></div>
      </div>
      <div class="card">
        <div class="card-title">Unggah Manual Form File ID</div>
        <div class="row">
          <div class="fg"><label>Kategori Utama</label><select id="fCat"></select></div>
          <div class="fg"><label>Tag/Identifikasi Versi</label><input type="text" id="fVer" placeholder="v1.0.0"></div>
        </div>
        <div class="row">
          <div class="fg"><label>Telegram File ID String Unique</label><input type="text" id="fId"></div>
          <div class="fg"><label>Tipe Ekstensi Konten</label>
            <select id="fType">
              <option value="document">Dokumen Mentah / APK Binary</option>
              <option value="video">Multimedia Video</option>
              <option value="photo">Grafis Foto</option>
              <option value="audio">Suara Audio / Musik</option>
            </select>
          </div>
        </div>
        <div class="fg"><label>Deskripsi Default File / Caption</label><textarea id="fCap"></textarea></div>
        <button class="btn btn-primary" onclick="addFile()">Amankan ke Cloud</button>
      </div>
    </div>

    <div class="page" id="page-settings">
      <div class="page-title">Konfigurasi Pengaturan</div>
      <div class="card">
        <div class="card-title">Data Informasi Dasar Bot (/info)</div>
        <div class="fg"><textarea id="sInfo"></textarea></div>
        <button class="btn btn-primary btn-sm" onclick="saveSetting('bot_info','sInfo','Info Core')">Simpan Konfigurasi</button>
      </div>
      <div class="card">
        <div class="card-title">Data Profil YouTube Channel</div>
        <div class="fg"><textarea id="sYt"></textarea></div>
        <button class="btn btn-primary btn-sm" onclick="saveSetting('youtube_info','sYt','Info Youtube')">Simpan Konfigurasi</button>
      </div>
      <div class="card">
        <div class="card-title">Teks Pengumuman Berulang</div>
        <div class="fg"><textarea id="sAnn"></textarea></div>
        <button class="btn btn-primary btn-sm" onclick="saveSetting('latest_announcement','sAnn','Pengumuman')">Simpan Konfigurasi</button>
      </div>
    </div>
  </main>
</div>

<script>
const BASE = '${origin}/api';
let pw = '', allChats = [], curMode = 'text';

function h(){ return {'Content-Type':'application/json','X-Dashboard-Password':pw}; }

function login(){
  pw = document.getElementById('pwInput').value;
  const btn = document.getElementById('loginBtn');
  if(!pw){ showLoginMsg('Kunci Otentikasi Kosong!','err'); return; }
  btn.textContent = 'Memvalidasi...'; btn.disabled = true;
  
  fetch(BASE+'/verify',{method:'POST',headers:h()})
    .then(r => {
       if(!r.ok) throw new Error('Password salah atau un-authorized');
       return r.json();
    })
    .then(d => {
      btn.textContent = 'Verifikasi Masuk'; btn.disabled = false;
      document.getElementById('overlay').style.display='none';
      init();
    }).catch(e => {
      btn.textContent = 'Verifikasi Masuk'; btn.disabled = false;
      showLoginMsg('Kunci akses ditolak server cloud. Periksa kembali rahasia variabel Anda.','err');
      pw='';
    });
}

function checkPwSet(){
  fetch(BASE+'/check-config')
    .then(r=>r.json())
    .then(d=>{
      if(d.pw_set) showLoginMsg('Status: DASHBOARD_PASSWORD terdeteksi aman di KV Cloudflare.','info');
      else showLoginMsg('Status: Variabel DASHBOARD_PASSWORD hilang / belum dikonfigurasi.','err');
    }).catch(()=>showLoginMsg('Koneksi endpoint mati. Jalankan deploy worker terlebih dahulu.','err'));
}

function showLoginMsg(m,t){
  const e=document.getElementById('loginErr'),i=document.getElementById('loginInfo');
  e.style.display='none';i.style.display='none';
  if(t==='err'){e.textContent=m;e.style.display='block'}else{i.innerHTML=m;i.style.display='block'}
}

function init(){
  document.getElementById('webhookUrl').textContent = '${origin}/webhook';
  loadStats(); loadChats(); loadFiles(); loadSettings();
}

function go(p){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('page-'+p).classList.add('active');
}

function alert2(m,t='ok'){
  const b=document.getElementById('globalAlert');
  b.innerHTML='<div class="alert alert-'+t+'">'+m+'</div>';
  setTimeout(()=>b.innerHTML='',4000);
}

function loadStats(){
  fetch(BASE+'/chat-list',{headers:h()}).then(r=>r.json()).then(d=>{
    if(!d.ok)return;const cs=Object.values(d.chats);allChats=cs;
    document.getElementById('stTotal').textContent=cs.length;
    document.getElementById('stUsers').textContent=cs.filter(c=>c.type==='private').length;
    document.getElementById('stGroups').textContent=cs.filter(c=>c.type==='group'||c.type==='supergroup').length;
    document.getElementById('stChannels').textContent=cs.filter(c=>c.type==='channel').length;
  });
}

function loadChats(){
  fetch(BASE+'/chat-list',{headers:h()}).then(r=>r.json()).then(d=>{if(d.ok){allChats=Object.values(d.chats);renderChats(allChats);}});
}

function renderChats(l){
  const e=document.getElementById('chatTable');
  if(!l.length){e.innerHTML='<p style="color:var(--muted)">Index kosong.</p>';return;}
  e.innerHTML='<table><thead><tr><th>ID Jalur</th><th>Nama Profil</th><th>Klasifikasi</th><th>Username</th><th>Aksi</th></tr></thead><tbody>'+
    l.map(c=>'<tr><td>'+c.id+'</td><td>'+esc(c.title)+'</td><td><span class="badge badge-'+c.type+'">'+c.type+'</span></td><td>'+(c.username?'@'+c.username:'-')+'</td><td><button class="btn btn-danger btn-sm" onclick="delChat('+c.id+')">Hapus</button></td></tr>').join('')+'</tbody></table>';
}

function filterChats(){
  const q=document.getElementById('chatQ').value.toLowerCase();
  renderChats(allChats.filter(c=>esc(c.title).toLowerCase().includes(q)||String(c.id).includes(q)));
}

function delChat(id){
  if(!confirm('Putus hubungan data dengan ID '+id+'?'))return;
  fetch(BASE+'/remove-chat',{method:'POST',headers:h(),body:JSON.stringify({chat_id:id})}).then(r=>r.json()).then(d=>{if(d.ok){alert2('Data chat dibersihkan.');loadChats();loadStats();}});
}

function loadFiles(){
  fetch(BASE+'/get-files',{headers:h()}).then(r=>r.json()).then(d=>{
    if(!d.ok)return;renderTree(d.menu);
    document.getElementById('fCat').innerHTML=Object.keys(d.menu).map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
  });
}

function renderTree(m){
  const e=document.getElementById('fileTree');const cats=Object.keys(m);
  if(!cats.length){e.innerHTML='<p style="color:var(--muted)">Penyimpanan kosong.</p>';return;}
  e.innerHTML=cats.map(cat=>{
    const v=Object.keys(m[cat]);
    return '<div class="tree-cat"><div class="tree-cat-header"><span>Direktori '+esc(cat)+'</span><button class="btn btn-danger btn-sm" onclick="delCat(\''+esc2(cat)+'\')">Hapus Index</button></div>'+
      (v.length?v.map(x=>'<div class="tree-file"><span>Paket '+esc(x)+' <code>['+m[cat][x].file_type+']</code></span><button class="btn btn-danger btn-sm" onclick="delFile(\''+esc2(cat)'\',\''+esc2(x)'\')">Hapus File</button></div>').join(''):'<div class="tree-file" style="color:var(--muted)">Tidak ada paket berkas.</div>')+'</div>';
  }).join('');
}

function addCat(){
  const name=document.getElementById('newCat').value.trim();if(!name)return alert2('Nama kategori kosong!','err');
  fetch(BASE+'/add-category',{method:'POST',headers:h(),body:JSON.stringify({name})}).then(r=>r.json()).then(d=>{if(d.ok){alert2('Index kategori siap.');document.getElementById('newCat').value='';loadFiles();}});
}

function delCat(name){
  if(!confirm('Hapus total direktori '+name+' beserta file internal?'))return;
  fetch(BASE+'/delete-category',{method:'POST',headers:h(),body:JSON.stringify({name})}).then(r=>r.json()).then(d=>{if(d.ok){alert2('Index terhapus.');loadFiles();}});
}

function addFile(){
  const cat=document.getElementById('fCat').value,ver=document.getElementById('fVer').value.trim(),fid=document.getElementById('fId').value.trim(),ft=document.getElementById('fType').value,cap=document.getElementById('fCap').value.trim();
  if(!ver||!fid)return alert2('Lengkapi baris input paket data!','err');
  fetch(BASE+'/add-file',{method:'POST',headers:h(),body:JSON.stringify({category:cat,version:ver,file_id:fid,file_type:ft,caption:cap})}).then(r=>r.json()).then(d=>{if(d.ok){alert2('File disimpan.');loadFiles();}});
}

function delFile(cat,ver){
  if(!confirm('Hapus paket '+ver+'?'))return;
  fetch(BASE+'/delete-file',{method:'POST',headers:h(),body:JSON.stringify({category:cat,version:ver})}).then(r=>r.json()).then(d=>{if(d.ok){alert2('Berkas terhapus.');loadFiles();}});
}

async function sendBroadcast(){
  const target=document.getElementById('bcTarget').value;let p={mode:curMode,target};
  if(curMode==='text'){p.text=document.getElementById('bcText').value.trim();if(!p.text)return alert2('Payload kosong!','err');}
  else if(curMode==='photo'){p.photo=document.getElementById('bcPhoto').value.trim();p.caption=document.getElementById('bcPhotoCaption').value.trim();if(!p.photo)return alert2('Source kosong!','err');}
  else{p.video=document.getElementById('bcVideo').value.trim();p.caption=document.getElementById('bcVideoCaption').value.trim();if(!p.video)return alert2('Source kosong!','err');}
  
  const prog=document.getElementById('bcProgress');prog.style.display='block';
  document.getElementById('bcStatus').textContent='Mengirim ke antrean antariksa cloud...';
  document.getElementById('bcBar').style.width='40%';
  
  const d=await fetch(BASE+'/broadcast',{method:'POST',headers:h(),body:JSON.stringify(p)}).then(r=>r.json());
  document.getElementById('bcBar').style.width='100%';
  if(d.ok){document.getElementById('bcStatus').textContent='Berhasil: '+d.success+' | Gagal: '+d.failed;alert2('Broadcast selesai dikirim.');}
  else{document.getElementById('bcStatus').textContent='Gagal diproses';alert2('Gagal total broadcast','err');}
}

function setMode(m){
  curMode=m;['text','photo','video'].forEach(x=>{document.getElementById('m-'+x).style.display=x===m?'block':'none';});
  document.querySelectorAll('.mtab').forEach((t,i)=>t.classList.toggle('active',['text','photo','video'][i]===m));
}

function loadSettings(){
  fetch(BASE+'/get-settings',{headers:h()}).then(r=>r.json()).then(d=>{if(d.ok){document.getElementById('sInfo').value=d.bot_info||'';document.getElementById('sYt').value=d.youtube_info||'';document.getElementById('sAnn').value=d.latest_announcement||'';}});
}

function saveSetting(k,e,l){
  const v=document.getElementById(e).value;
  fetch(BASE+'/save-setting',{method:'POST',headers:h(),body:JSON.stringify({key:k,value:v})}).then(r=>r.json()).then(d=>{if(d.ok)alert2('Konfigurasi '+l+' diubah.');});
}

function setupWebhook(){
  fetch(BASE+'/setup-webhook',{method:'POST',headers:h()}).then(r=>r.json()).then(d=>{if(d.ok)alert2('Sesi Webhook tersinkronisasi aman!');});
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function esc2(s){return s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
</script>
</body>
</html>`;
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
      return new Response(dashboardHTML(url.origin), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }
    if (url.pathname.startsWith("/api/")) return handleAPI(request, env, url);

    return Response.redirect(url.origin + "/dashboard", 302);
  },
};
