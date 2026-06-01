// ============================================================
//  TELEGRAM BOT + WEB DASHBOARD — Cloudflare Workers
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
        { text: "📱 Download App", callback_data: "menu:apps" },
        { text: "📺 YouTube", callback_data: "menu:youtube" },
      ],
      [
        { text: "📢 Pengumuman", callback_data: "menu:announcements" },
        { text: "ℹ️ Info", callback_data: "menu:info" },
      ],
    ],
  };
}

function categoryKeyboard(menu) {
  const cats = Object.keys(menu);
  if (!cats.length)
    return {
      inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu:main" }]],
    };
  const rows = [];
  for (let i = 0; i < cats.length; i += 2) {
    const row = [{ text: "📁 " + cats[i], callback_data: "cat:" + cats[i] }];
    if (cats[i + 1])
      row.push({
        text: "📁 " + cats[i + 1],
        callback_data: "cat:" + cats[i + 1],
      });
    rows.push(row);
  }
  rows.push([{ text: "🔙 Kembali", callback_data: "menu:main" }]);
  return { inline_keyboard: rows };
}

function versionKeyboard(category, versions) {
  const keys = Object.keys(versions);
  const rows = keys.map((v) => [
    { text: "📦 " + v, callback_data: `file:${category}:${v}` },
  ]);
  rows.push([{ text: "🔙 Kembali", callback_data: "menu:apps" }]);
  return { inline_keyboard: rows };
}

function backKeyboard(target = "menu:main") {
  return { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: target }]] };
}

// ─── COMMAND HANDLERS ────────────────────────────────────────

async function cmdStart(token, chat, user, env) {
  await addChat(env, chat);
  const name = user.first_name || user.username || "sana";
  await TG(token, "sendMessage", {
    chat_id: chat.id,
    parse_mode: "HTML",
    text: `👋 Halo, <b>${name}</b>!\n\nSelamat datang! Pilih menu di bawah ini:`,
    reply_markup: mainMenuKeyboard(),
  });
}

async function cmdBroadcast(token, msg, env, isAdmin) {
  if (!isAdmin)
    return TG(token, "sendMessage", {
      chat_id: msg.chat.id,
      text: "❌ Kamu bukan admin.",
    });
  const text = msg.text.replace(/^\/broadcast\s*/i, "").trim();
  if (!text)
    return TG(token, "sendMessage", {
      chat_id: msg.chat.id,
      text: "Format: /broadcast <pesan>\nContoh: /broadcast 🎉 Video baru sudah upload!",
    });

  const chats = await getChats(env);
  let ok = 0,
    fail = 0;
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
    text: `✅ Broadcast selesai!\n📤 Berhasil: ${ok}\n❌ Gagal: ${fail}`,
  });
}

async function cmdStats(token, chatId, env, isAdmin) {
  if (!isAdmin)
    return TG(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Kamu bukan admin.",
    });
  const chats = Object.values(await getChats(env));
  const u = chats.filter((c) => c.type === "private").length;
  const g = chats.filter(
    (c) => c.type === "group" || c.type === "supergroup"
  ).length;
  const ch = chats.filter((c) => c.type === "channel").length;
  TG(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `📊 <b>Statistik Bot</b>\n\n👤 Users: ${u}\n👥 Groups: ${g}\n📢 Channels: ${ch}\n─────────\n📋 Total: ${chats.length}`,
  });
}

async function cmdAddCat(token, chatId, text, env, isAdmin) {
  if (!isAdmin) return;
  const name = text.replace(/^\/addcat\s*/i, "").trim();
  if (!name)
    return TG(token, "sendMessage", {
      chat_id: chatId,
      text: "Format: /addcat <nama>\nContoh: /addcat Minecraft Patch",
    });
  const menu = await getMenu(env);
  if (!menu[name]) {
    menu[name] = {};
    await saveMenu(env, menu);
  }
  TG(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `✅ Kategori "<b>${name}</b>" berhasil ditambahkan!`,
  });
}

async function cmdDelCat(token, chatId, text, env, isAdmin) {
  if (!isAdmin) return;
  const name = text.replace(/^\/delcat\s*/i, "").trim();
  if (!name)
    return TG(token, "sendMessage", {
      chat_id: chatId,
      text: "Format: /delcat <nama>",
    });
  const menu = await getMenu(env);
  if (menu[name]) {
    delete menu[name];
    await saveMenu(env, menu);
    TG(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: `✅ Kategori "<b>${name}</b>" dihapus.`,
    });
  } else {
    TG(token, "sendMessage", {
      chat_id: chatId,
      text: `❌ Kategori tidak ditemukan.`,
    });
  }
}

async function cmdAddFile(token, chatId, userId, text, env, isAdmin) {
  if (!isAdmin) return;
  const raw = text.replace(/^\/addfile\s*/i, "").trim();
  const parts = raw.split("|");
  if (parts.length < 2)
    return TG(token, "sendMessage", {
      chat_id: chatId,
      text: "Format: /addfile <kategori> | <versi>\nContoh: /addfile Minecraft Patch | v1.21.50\n\nSetelah itu kirim file-nya.",
    });
  const category = parts[0].trim();
  const version = parts[1].trim();
  await setPending(env, userId, { action: "add_file", category, version });
  TG(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `✅ Siap!\n📁 Kategori: <b>${category}</b>\n📦 Versi: <b>${version}</b>\n\nSekarang kirim file-nya (APK, video, foto, dll).`,
  });
}

async function cmdListCat(token, chatId, env, isAdmin) {
  if (!isAdmin) return;
  const menu = await getMenu(env);
  const cats = Object.keys(menu);
  if (!cats.length)
    return TG(token, "sendMessage", {
      chat_id: chatId,
      text: "Belum ada kategori.",
    });
  const list = cats
    .map((c, i) => `${i + 1}. ${c} (${Object.keys(menu[c]).length} file)`)
    .join("\n");
  TG(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `📋 <b>Kategori:</b>\n${list}`,
  });
}

async function cmdHelp(token, chatId, isAdmin) {
  const adminCmds = isAdmin
    ? `\n\n<b>🔑 Admin Commands:</b>\n` +
      `/broadcast &lt;pesan&gt; — Broadcast ke semua\n` +
      `/stats — Statistik chat\n` +
      `/addcat &lt;nama&gt; — Tambah kategori\n` +
      `/delcat &lt;nama&gt; — Hapus kategori\n` +
      `/addfile &lt;cat&gt; | &lt;ver&gt; — Tambah file (lalu kirim filenya)\n` +
      `/listcat — List kategori\n` +
      `/setinfo &lt;teks&gt; — Set info bot\n` +
      `/setyoutube &lt;teks&gt; — Set info YouTube`
    : "";
  TG(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `<b>📖 Bantuan</b>\n\n/start — Mulai bot & tampilkan menu\n/help — Tampilkan bantuan ini${adminCmds}`,
  });
}

// ─── FILE UPLOAD HANDLER ──────────────────────────────────────

async function handleFileUpload(token, msg, env) {
  const userId = String(msg.from.id);
  const pending = await getPending(env, userId);
  if (!pending || pending.action !== "add_file") return false;

  let fileId = null,
    fileType = null;
  const caption = msg.caption || "";

  if (msg.document) {
    fileId = msg.document.file_id;
    fileType = "document";
  } else if (msg.video) {
    fileId = msg.video.file_id;
    fileType = "video";
  } else if (msg.photo) {
    fileId = msg.photo[msg.photo.length - 1].file_id;
    fileType = "photo";
  } else if (msg.audio) {
    fileId = msg.audio.file_id;
    fileType = "audio";
  } else if (msg.animation) {
    fileId = msg.animation.file_id;
    fileType = "animation";
  }

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
    text: `✅ File berhasil disimpan!\n📁 Kategori: <b>${pending.category}</b>\n📦 Versi: <b>${pending.version}</b>`,
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
    return edit("🏠 <b>Menu Utama</b>\n\nPilih kategori:", mainMenuKeyboard());
  }

  if (data === "menu:apps") {
    const menu = await getMenu(env);
    return edit(
      "📱 <b>Download App</b>\n\nPilih kategori:",
      categoryKeyboard(menu)
    );
  }

  if (data === "menu:youtube") {
    const txt =
      (await env.BOT_KV.get("youtube_info")) || "Belum ada info YouTube.";
    return edit(`📺 <b>YouTube</b>\n\n${txt}`, backKeyboard());
  }

  if (data === "menu:announcements") {
    const txt =
      (await env.BOT_KV.get("latest_announcement")) ||
      "Belum ada pengumuman terbaru.";
    return edit(`📢 <b>Pengumuman Terbaru</b>\n\n${txt}`, backKeyboard());
  }

  if (data === "menu:info") {
    const txt =
      (await env.BOT_KV.get("bot_info")) ||
      "Bot untuk distribusi aplikasi dan pengumuman.";
    return edit(`ℹ️ <b>Info</b>\n\n${txt}`, backKeyboard());
  }

  if (data.startsWith("cat:")) {
    const category = data.slice(4);
    const menu = await getMenu(env);
    const versions = menu[category] || {};
    if (!Object.keys(versions).length) {
      return edit(
        `📁 <b>${category}</b>\n\nBelum ada file tersedia.`,
        backKeyboard("menu:apps")
      );
    }
    return edit(
      `📁 <b>${category}</b>\n\nPilih versi:`,
      versionKeyboard(category, versions)
    );
  }

  if (data.startsWith("file:")) {
    const parts = data.split(":");
    const category = parts[1];
    const version = parts[2];
    const menu = await getMenu(env);
    const file = menu[category]?.[version];

    if (!file) {
      return TG(token, "sendMessage", {
        chat_id: chatId,
        text: "❌ File tidak ditemukan.",
      });
    }

    const cap = file.caption || `📦 <b>${category}</b> — ${version}`;
    const sendParams = {
      chat_id: chatId,
      caption: cap,
      parse_mode: "HTML",
    };

    const methodMap = {
      document: ["sendDocument", "document"],
      video: ["sendVideo", "video"],
      photo: ["sendPhoto", "photo"],
      audio: ["sendAudio", "audio"],
      animation: ["sendAnimation", "animation"],
    };

    const [method, key] = methodMap[file.file_type] || [
      "sendDocument",
      "document",
    ];
    sendParams[key] = file.file_id;

    try {
      await TG(token, method, sendParams);
      await TG(token, "sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: `✅ <b>${version}</b> berhasil dikirim!`,
        reply_markup: backKeyboard("menu:main"),
      });
    } catch {
      TG(token, "sendMessage", {
        chat_id: chatId,
        text: "❌ Gagal mengirim file. Coba lagi nanti.",
      });
    }
    return;
  }
}

// ─── WEBHOOK HANDLER ─────────────────────────────────────────

async function handleWebhook(request, env) {
  if (request.method !== "POST")
    return new Response("Method Not Allowed", { status: 405 });

  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== env.WEBHOOK_SECRET)
    return new Response("Unauthorized", { status: 401 });

  const token = env.BOT_TOKEN;
  const adminId = String(env.ADMIN_ID);
  let update;
  try {
    update = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (update.message) {
    const msg = update.message;
    const chat = msg.chat;
    const user = msg.from;
    const isAdmin = String(user?.id) === adminId;
    const text = msg.text || "";

    if (msg.new_chat_members) {
      const me = await TG(token, "getMe");
      const botId = me.result?.id;
      if (msg.new_chat_members.some((m) => m.id === botId)) {
        await addChat(env, chat);
        TG(token, "sendMessage", {
          chat_id: chat.id,
          text: "👋 Halo! Bot sudah aktif di sini dan akan menerima siaran pengumuman dari admin.",
        });
      }
    }

    if (msg.left_chat_member) {
      const me = await TG(token, "getMe");
      if (msg.left_chat_member.id === me.result?.id) {
        await removeChat(env, chat.id);
      }
    }

    if (
      isAdmin &&
      (msg.document ||
        msg.video ||
        msg.photo ||
        msg.audio ||
        msg.animation)
    ) {
      const handled = await handleFileUpload(token, msg, env);
      if (handled) return new Response("OK");
    }

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
      TG(token, "sendMessage", {
        chat_id: chat.id,
        text: "✅ Info bot diperbarui!",
      });
    } else if (text.match(/^\/setyoutube/i) && isAdmin) {
      const val = text.replace(/^\/setyoutube\s*/i, "").trim();
      await env.BOT_KV.put("youtube_info", val);
      TG(token, "sendMessage", {
        chat_id: chat.id,
        text: "✅ Info YouTube diperbarui!",
      });
    }
  }

  if (update.callback_query) {
    await handleCallback(token, update.callback_query, env);
  }

  if (update.my_chat_member) {
    const { chat, new_chat_member } = update.my_chat_member;
    const status = new_chat_member?.status;
    if (status === "member" || status === "administrator") {
      await addChat(env, chat);
    } else if (status === "kicked" || status === "left") {
      await removeChat(env, chat.id);
    }
  }

  return new Response("OK");
}

// ─── API HANDLERS ─────────────────────────────────────────────

function checkAuth(request, env) {
  const url = new URL(request.url);
  const fromHeader = request.headers.get("X-Dashboard-Password");
  const fromQuery = url.searchParams.get("k");
  const correct = env.DASHBOARD_PASSWORD;
  if (!correct) return false;
  return fromHeader === correct || fromQuery === correct;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
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
    if (!checkAuth(request, env)) return json({ ok: false });
    return json({ ok: true });
  }

  if (!checkAuth(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);

  const token = env.BOT_TOKEN;

  if (path === "chat-list") {
    return json({ ok: true, chats: await getChats(env) });
  }

  if (path === "remove-chat") {
    const { chat_id } = await request.json();
    await removeChat(env, chat_id);
    return json({ ok: true });
  }

  if (path === "get-files") {
    return json({ ok: true, menu: await getMenu(env) });
  }

  if (path === "add-category") {
    const { name } = await request.json();
    const menu = await getMenu(env);
    if (!menu[name]) {
      menu[name] = {};
      await saveMenu(env, menu);
    }
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

  if (path === "broadcast") {
    const body = await request.json();
    const chats = await getChats(env);
    let list = Object.values(chats);

    if (body.target === "users")
      list = list.filter((c) => c.type === "private");
    else if (body.target === "groups")
      list = list.filter(
        (c) => c.type === "group" || c.type === "supergroup"
      );
    else if (body.target === "channels")
      list = list.filter((c) => c.type === "channel");

    let success = 0,
      failed = 0;
    for (const chat of list) {
      let r;
      try {
        if (body.mode === "text") {
          r = await TG(token, "sendMessage", {
            chat_id: chat.id,
            text: body.text,
            parse_mode: "HTML",
          });
        } else if (body.mode === "photo") {
          r = await TG(token, "sendPhoto", {
            chat_id: chat.id,
            photo: body.photo,
            caption: body.caption,
            parse_mode: "HTML",
          });
        } else if (body.mode === "video") {
          r = await TG(token, "sendVideo", {
            chat_id: chat.id,
            video: body.video,
            caption: body.caption,
            parse_mode: "HTML",
          });
        }
        if (r?.ok) success++;
        else {
          failed++;
          if (r?.error_code === 403) await removeChat(env, chat.id);
        }
      } catch {
        failed++;
      }
    }
    return json({ ok: true, success, failed });
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
    const allowed = ["bot_info", "youtube_info", "latest_announcement"];
    if (!allowed.includes(key))
      return json({ ok: false, error: "Invalid key" });
    await env.BOT_KV.put(key, value);
    return json({ ok: true });
  }

  if (path === "setup-webhook") {
    const webhookUrl = `${url.origin}/webhook`;
    const r = await TG(token, "setWebhook", {
      url: webhookUrl,
      secret_token: env.WEBHOOK_SECRET,
      allowed_updates: [
        "message",
        "callback_query",
        "my_chat_member",
        "chat_member",
      ],
    });
    return json({ ok: r.ok, result: r });
  }

  return json({ ok: false, error: "Not found" }, 404);
}

// ─── LOGIN PAGE ───────────────────────────────────────────────

function loginHTML(origin) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login - Bot Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0f1e;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}
.box{background:#111827;border:1px solid #1e2d4a;border-radius:1.5rem;padding:2rem;width:100%;max-width:380px}
.logo{font-size:3rem;text-align:center;margin-bottom:.5rem}
h1{font-size:1.4rem;color:#3b82f6;text-align:center;margin-bottom:.25rem}
p{color:#64748b;text-align:center;font-size:.85rem;margin-bottom:1.5rem}
label{display:block;font-size:.85rem;color:#94a3b8;margin-bottom:.4rem}
input{width:100%;background:#1a2235;border:1px solid #1e2d4a;border-radius:.6rem;color:#e2e8f0;padding:.75rem 1rem;font-size:1rem;margin-bottom:1rem}
input:focus{outline:none;border-color:#3b82f6}
button{width:100%;background:#3b82f6;color:#fff;border:none;border-radius:.6rem;padding:.8rem;font-size:1rem;font-weight:600;cursor:pointer}
button:active{background:#2563eb}
.hint{margin-top:1rem;font-size:.8rem;color:#64748b;text-align:center;line-height:1.5}
code{background:#1a2235;padding:.15rem .4rem;border-radius:.3rem;color:#93c5fd;font-size:.8rem}
</style>
</head>
<body>
<div class="box">
  <div class="logo">🤖</div>
  <h1>Bot Dashboard</h1>
  <p>Masukkan password untuk masuk</p>
  <form method="GET" action="${origin}/dashboard">
    <label>Password</label>
    <input type="password" name="k" placeholder="Ketik password kamu..." autofocus autocomplete="current-password">
    <button type="submit">Masuk →</button>
  </form>
  <div class="hint">
    Password diset di Cloudflare sebagai<br>
    variabel <code>DASHBOARD_PASSWORD</code>
  </div>
</div>
</body>
</html>`;
}

// ─── DASHBOARD HTML ───────────────────────────────────────────

function dashboardHTML(origin, k) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bot Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0a0f1e;--surface:#111827;--surface2:#1a2235;--border:#1e2d4a;
  --accent:#3b82f6;--accent2:#8b5cf6;--green:#22c55e;--red:#ef4444;
  --yellow:#f59e0b;--text:#e2e8f0;--muted:#64748b;--card:#141e33;
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}

.topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.topbar h1{font-size:1.1rem;color:var(--accent);display:flex;align-items:center;gap:.5rem}
.online{display:flex;align-items:center;gap:.5rem;font-size:.8rem;color:var(--green)}
.dot{width:8px;height:8px;background:var(--green);border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.wrapper{display:grid;grid-template-columns:220px 1fr;min-height:calc(100vh - 56px)}
@media(max-width:700px){.wrapper{grid-template-columns:1fr}}

.sidebar{background:var(--surface);border-right:1px solid var(--border);padding:1rem}
@media(max-width:700px){.sidebar{display:none}}
.nav-item{display:flex;align-items:center;gap:.6rem;padding:.7rem .9rem;border-radius:.75rem;cursor:pointer;color:var(--muted);font-size:.9rem;transition:.15s;margin-bottom:.2rem}
.nav-item:hover{background:var(--surface2);color:var(--text)}
.nav-item.active{background:rgba(59,130,246,.15);color:var(--accent)}
.nav-icon{font-size:1.1rem;width:1.5rem;text-align:center}

main{padding:1.5rem;max-width:960px}
.page{display:none}.page.active{display:block}
.page-title{font-size:1.2rem;font-weight:700;margin-bottom:1.25rem;display:flex;align-items:center;gap:.5rem}

.card{background:var(--card);border:1px solid var(--border);border-radius:1rem;padding:1.25rem;margin-bottom:1.25rem}
.card-title{font-size:.95rem;font-weight:600;color:var(--accent);margin-bottom:1rem;display:flex;align-items:center;gap:.4rem}
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1rem;margin-bottom:1.25rem}
.stat{background:var(--surface2);border:1px solid var(--border);border-radius:.75rem;padding:1rem;text-align:center}
.stat-n{font-size:2rem;font-weight:700;color:var(--accent)}
.stat-l{font-size:.75rem;color:var(--muted);margin-top:.2rem}

label{display:block;font-size:.85rem;color:var(--muted);margin-bottom:.4rem}
input,textarea,select{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:.6rem;color:var(--text);padding:.65rem .85rem;font-size:.9rem;font-family:inherit;transition:.15s}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--accent)}
textarea{resize:vertical;min-height:110px}
.fg{margin-bottom:1rem}
.row{display:flex;gap:.75rem;flex-wrap:wrap}
.row .fg{flex:1;min-width:180px}

.btn{padding:.65rem 1.25rem;border:none;border-radius:.6rem;cursor:pointer;font-size:.9rem;font-weight:600;transition:.15s;display:inline-flex;align-items:center;gap:.4rem}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:#2563eb}
.btn-success{background:var(--green);color:#fff}.btn-success:hover{background:#16a34a}
.btn-danger{background:var(--red);color:#fff}.btn-danger:hover{background:#dc2626}
.btn-sm{padding:.35rem .75rem;font-size:.8rem}
.btn-ghost{background:var(--surface2);color:var(--text);border:1px solid var(--border)}.btn-ghost:hover{border-color:var(--accent)}

.alert{padding:.75rem 1rem;border-radius:.6rem;font-size:.9rem;margin-bottom:1rem}
.alert-ok{background:#052e16;border:1px solid var(--green);color:#86efac}
.alert-err{background:#450a0a;border:1px solid var(--red);color:#fca5a5}
.alert-info{background:#0c1a3a;border:1px solid var(--accent);color:#93c5fd}

.mtabs{display:flex;gap:.4rem;margin-bottom:1rem}
.mtab{padding:.45rem .9rem;border-radius:.5rem;border:1px solid var(--border);cursor:pointer;font-size:.85rem;color:var(--muted)}
.mtab.active{background:var(--accent);border-color:var(--accent);color:#fff}

.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.875rem}
th{color:var(--muted);font-weight:600;padding:.6rem .75rem;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}
td{padding:.6rem .75rem;border-bottom:1px solid var(--border)}
tr:last-child td{border:none}

.badge{padding:.2rem .55rem;border-radius:1rem;font-size:.72rem;font-weight:700}
.badge-private{background:#0c1a3a;color:#93c5fd}
.badge-group{background:#052e16;color:#86efac}
.badge-supergroup{background:#1c1408;color:#fcd34d}
.badge-channel{background:#2d0a0a;color:#fca5a5}

.prog-wrap{background:var(--surface2);border-radius:1rem;height:8px;overflow:hidden}
.prog{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:1rem;transition:width .4s}

.tree-cat{background:var(--surface2);border:1px solid var(--border);border-radius:.75rem;overflow:hidden;margin-bottom:.75rem}
.tree-cat-header{padding:.6rem 1rem;background:rgba(59,130,246,.1);display:flex;justify-content:space-between;align-items:center;font-weight:600;color:var(--accent);font-size:.9rem}
.tree-file{padding:.5rem 1rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:.875rem}
</style>
</head>
<body>

<div class="topbar">
  <h1>🤖 Telegram Bot</h1>
  <div class="online"><div class="dot"></div><span id="botName">Online</span></div>
</div>

<div class="wrapper">
  <nav class="sidebar">
    <div class="nav-item active" onclick="go('overview',this)"><span class="nav-icon">📊</span> Overview</div>
    <div class="nav-item" onclick="go('broadcast',this)"><span class="nav-icon">📢</span> Broadcast</div>
    <div class="nav-item" onclick="go('chats',this)"><span class="nav-icon">💬</span> Chat List</div>
    <div class="nav-item" onclick="go('files',this)"><span class="nav-icon">📁</span> File Manager</div>
    <div class="nav-item" onclick="go('settings',this)"><span class="nav-icon">⚙️</span> Settings</div>
  </nav>

  <main>
    <div id="globalAlert"></div>

    <div class="page active" id="page-overview">
      <div class="page-title">📊 Overview</div>
      <div class="stats-row">
        <div class="stat"><div class="stat-n" id="stTotal">—</div><div class="stat-l">Total Chat</div></div>
        <div class="stat"><div class="stat-n" id="stUsers">—</div><div class="stat-l">Users</div></div>
        <div class="stat"><div class="stat-n" id="stGroups">—</div><div class="stat-l">Groups</div></div>
        <div class="stat"><div class="stat-n" id="stChannels">—</div><div class="stat-l">Channels</div></div>
      </div>
      <div class="card">
        <div class="card-title">🔗 Info Worker</div>
        <p style="font-size:.85rem;color:var(--muted)">Webhook URL:</p>
        <code id="webhookUrl" style="background:var(--surface2);padding:.4rem .75rem;border-radius:.4rem;display:block;margin:.5rem 0;font-size:.8rem;word-break:break-all;color:var(--accent)"></code>
        <button class="btn btn-success btn-sm" onclick="setupWebhook()">⚡ Setup / Refresh Webhook</button>
      </div>
    </div>

    <div class="page" id="page-broadcast">
      <div class="page-title">📢 Kirim Broadcast</div>
      <div class="card">
        <div class="card-title">✏️ Buat Pesan</div>

        <div class="mtabs">
          <div class="mtab active" onclick="setMode('text')">📝 Teks</div>
          <div class="mtab" onclick="setMode('photo')">🖼️ Foto</div>
          <div class="mtab" onclick="setMode('video')">🎬 Video</div>
        </div>

        <div id="m-text">
          <div class="fg">
            <label>Pesan (HTML diperbolehkan: &lt;b&gt;, &lt;i&gt;, &lt;a href&gt;)</label>
            <textarea id="bcText" placeholder="Contoh: 🎉 <b>Video baru!</b> &#10;Tonton di: https://youtu.be/..."></textarea>
          </div>
        </div>

        <div id="m-photo" style="display:none">
          <div class="fg"><label>URL Foto atau File ID Telegram</label><input type="text" id="bcPhoto" placeholder="https://... atau file_id"></div>
          <div class="fg"><label>Caption (opsional, HTML ok)</label><textarea id="bcPhotoCaption" style="min-height:70px" placeholder="Deskripsi foto..."></textarea></div>
        </div>

        <div id="m-video" style="display:none">
          <div class="fg"><label>URL Video atau File ID Telegram</label><input type="text" id="bcVideo" placeholder="https://... atau file_id"></div>
          <div class="fg"><label>Caption (opsional, HTML ok)</label><textarea id="bcVideoCaption" style="min-height:70px" placeholder="Deskripsi video..."></textarea></div>
        </div>

        <div class="row">
          <div class="fg">
            <label>Target Penerima</label>
            <select id="bcTarget">
              <option value="all">🌐 Semua (Users + Groups + Channels)</option>
              <option value="users">👤 Users saja</option>
              <option value="groups">👥 Groups saja</option>
              <option value="channels">📢 Channels saja</option>
            </select>
          </div>
        </div>

        <button class="btn btn-primary" onclick="sendBroadcast()">📤 Kirim Sekarang</button>

        <div id="bcProgress" style="margin-top:1rem;display:none">
          <div style="font-size:.85rem;color:var(--muted);margin-bottom:.4rem" id="bcStatus">Mengirim...</div>
          <div class="prog-wrap"><div class="prog" id="bcBar" style="width:0%"></div></div>
        </div>
      </div>
    </div>

    <div class="page" id="page-chats">
      <div class="page-title">💬 Chat List</div>
      <div class="card">
        <div class="card-title">📋 Semua Chat Terdaftar</div>
        <div style="display:flex;gap:.5rem;margin-bottom:1rem">
          <input type="text" id="chatQ" placeholder="Cari nama / username / ID..." oninput="filterChats()" style="flex:1">
          <button class="btn btn-ghost btn-sm" onclick="loadChats()">🔄</button>
        </div>
        <div id="chatTable" class="tbl-wrap"><p style="color:var(--muted);font-size:.9rem">Loading...</p></div>
      </div>
    </div>

    <div class="page" id="page-files">
      <div class="page-title">📁 File Manager</div>

      <div class="card">
        <div class="card-title">📂 Tambah Kategori</div>
        <div style="display:flex;gap:.5rem">
          <input type="text" id="newCat" placeholder="Contoh: Minecraft Patch" style="flex:1">
          <button class="btn btn-success" onclick="addCat()">+ Tambah</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🗂️ Kategori & File</div>
        <div id="fileTree"><p style="color:var(--muted);font-size:.9rem">Loading...</p></div>
      </div>

      <div class="card">
        <div class="card-title">➕ Tambah File ke Kategori</div>
        <div class="alert alert-info">💡 <b>Cara dapat File ID:</b> Kirim /addfile via Telegram (bot simpan file ID otomatis), atau upload file ke bot lalu salin file_id dari pesan konfirmasi.</div>
        <div class="row">
          <div class="fg"><label>Kategori</label><select id="fCat"></select></div>
          <div class="fg"><label>Nama Versi</label><input type="text" id="fVer" placeholder="v1.21.50"></div>
        </div>
        <div class="row">
          <div class="fg"><label>File ID Telegram</label><input type="text" id="fId" placeholder="BQACAgIAAxkB..."></div>
          <div class="fg"><label>Tipe File</label>
            <select id="fType">
              <option value="document">📄 Document / APK</option>
              <option value="video">🎬 Video</option>
              <option value="photo">🖼️ Foto</option>
              <option value="audio">🎵 Audio</option>
            </select>
          </div>
        </div>
        <div class="fg"><label>Caption (opsional)</label><textarea id="fCap" style="min-height:70px" placeholder="Deskripsi file..."></textarea></div>
        <button class="btn btn-primary" onclick="addFile()">💾 Simpan File</button>
      </div>
    </div>

    <div class="page" id="page-settings">
      <div class="page-title">⚙️ Pengaturan</div>

      <div class="card">
        <div class="card-title">ℹ️ Teks Info Bot</div>
        <div class="fg"><textarea id="sInfo" placeholder="Teks yang muncul ketika user tekan tombol Info..."></textarea></div>
        <button class="btn btn-primary btn-sm" onclick="saveSetting('bot_info','sInfo','Info bot')">Simpan</button>
      </div>

      <div class="card">
        <div class="card-title">📺 Teks Info YouTube</div>
        <div class="fg"><textarea id="sYt" placeholder="Teks YouTube Channel, link, deskripsi..."></textarea></div>
        <button class="btn btn-primary btn-sm" onclick="saveSetting('youtube_info','sYt','Info YouTube')">Simpan</button>
      </div>

      <div class="card">
        <div class="card-title">📢 Teks Pengumuman Terbaru</div>
        <div class="fg"><textarea id="sAnn" placeholder="Pengumuman yang muncul di menu Pengumuman..."></textarea></div>
        <button class="btn btn-primary btn-sm" onclick="saveSetting('latest_announcement','sAnn','Pengumuman')">Simpan</button>
      </div>
    </div>
  </main>
</div>

<script>
const K = '${k}';
const ORIGIN = '${origin}';
const BASE = ORIGIN + '/api';
let allChats = [], curMode = 'text';

function api(path, opts){
  const sep = path.includes('?') ? '&' : '?';
  return fetch(BASE+'/'+path+sep+'k='+encodeURIComponent(K), opts||{});
}
function apiJ(path, body){
  return api(path, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: {'Content-Type':'application/json'},
    body: body !== undefined ? JSON.stringify(body) : undefined
  }).then(function(r){ return r.json(); });
}

// ── INIT ──
function init(){
  document.getElementById('webhookUrl').textContent = ORIGIN+'/webhook';
  loadStats(); loadChats(); loadFiles(); loadSettings();
}
window.onload = init;

// ── NAV ──
function go(page, el){
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  el.classList.add('active');
  document.getElementById('page-'+page).classList.add('active');
}

// ── ALERT ──
function alert2(msg,type){
  type = type||'ok';
  var box=document.getElementById('globalAlert');
  box.innerHTML='<div class="alert alert-'+type+'">'+msg+'</div>';
  setTimeout(function(){box.innerHTML='';},4000);
}

// ── STATS ──
function loadStats(){
  apiJ('chat-list').then(function(d){
    if(!d.ok) return;
    var cs=Object.values(d.chats);
    allChats=cs;
    document.getElementById('stTotal').textContent=cs.length;
    document.getElementById('stUsers').textContent=cs.filter(function(c){return c.type==='private';}).length;
    document.getElementById('stGroups').textContent=cs.filter(function(c){return c.type==='group'||c.type==='supergroup';}).length;
    document.getElementById('stChannels').textContent=cs.filter(function(c){return c.type==='channel';}).length;
  });
}

// ── CHATS ──
function loadChats(){
  apiJ('chat-list').then(function(d){
    if(!d.ok) return;
    allChats=Object.values(d.chats);
    renderChats(allChats);
  });
}
function renderChats(list){
  var el=document.getElementById('chatTable');
  if(!list.length){el.innerHTML='<p style="color:var(--muted);font-size:.9rem">Belum ada chat.</p>';return;}
  el.innerHTML='<table><thead><tr><th>ID</th><th>Nama</th><th>Tipe</th><th>Username</th><th>Bergabung</th><th></th></tr></thead><tbody>'+
    list.map(function(c){return '<tr>'+
      '<td style="font-family:monospace;font-size:.75rem;color:var(--muted)">'+c.id+'</td>'+
      '<td>'+esc(c.title||'-')+'</td>'+
      '<td><span class="badge badge-'+c.type+'">'+c.type+'</span></td>'+
      '<td>'+(c.username?'@'+c.username:'-')+'</td>'+
      '<td style="font-size:.8rem;color:var(--muted)">'+new Date(c.added_at).toLocaleDateString('id-ID')+'</td>'+
      '<td><button class="btn btn-danger btn-sm" onclick="delChat('+c.id+')">🗑</button></td>'+
    '</tr>';}).join('')+'</tbody></table>';
}
function filterChats(){
  var q=document.getElementById('chatQ').value.toLowerCase();
  renderChats(allChats.filter(function(c){return (c.title||'').toLowerCase().indexOf(q)>-1||(c.username||'').toLowerCase().indexOf(q)>-1||String(c.id).indexOf(q)>-1;}));
}
function delChat(id){
  if(!confirm('Hapus chat '+id+' dari list?')) return;
  apiJ('remove-chat',{chat_id:id}).then(function(d){
    if(d.ok){alert2('Chat dihapus.');loadChats();loadStats();}
    else alert2('Gagal: '+d.error,'err');
  });
}

// ── FILES ──
function loadFiles(){
  apiJ('get-files').then(function(d){
    if(!d.ok) return;
    renderTree(d.menu);
    var sel=document.getElementById('fCat');
    sel.innerHTML=Object.keys(d.menu).map(function(c){return '<option value="'+esc(c)+'">'+esc(c)+'</option>';}).join('');
  });
}
function renderTree(menu){
  var el=document.getElementById('fileTree');
  var cats = Object.keys(menu);
  if(!cats.length){el.innerHTML='<p style="color:var(--muted);font-size:.9rem">Belum ada kategori.</p>';return;}
  el.innerHTML=cats.map(function(cat){
    var vers=Object.keys(menu[cat]);
    var safeCat = encodeURIComponent(cat);
    return '<div class="tree-cat">'+
      '<div class="tree-cat-header"><span>📁 '+esc(cat)+'</span>'+
      '<button class="btn btn-danger btn-sm" onclick="delCat(this,decodeURIComponent(\''+safeCat+'\'))">🗑 Hapus</button></div>'+
      (vers.length?vers.map(function(v){
        var safeVer = encodeURIComponent(v);
        return '<div class="tree-file"><span>📦 '+esc(v)+' <small style="color:var(--muted)">['+menu[cat][v].file_type+']</small></span>'+
        '<button class="btn btn-danger btn-sm" onclick="delFile(this,decodeURIComponent(\''+safeCat+'\'),decodeURIComponent(\''+safeVer+'\'))">🗑</button></div>';
      }).join(''):'<div class="tree-file" style="color:var(--muted)">Belum ada file.</div>')+
    '</div>';
  }).join('');
}
function addCat(){
  var name=document.getElementById('newCat').value.trim();
  if(!name) return alert2('Masukkan nama kategori!','err');
  apiJ('add-category',{name:name}).then(function(d){
    if(d.ok){alert2('Kategori ditambahkan!');document.getElementById('newCat').value='';loadFiles();}
    else alert2('Error: '+d.error,'err');
  });
}
function delCat(el,name){
  if(!confirm('Hapus kategori "'+name+'"?')) return;
  apiJ('delete-category',{name:name}).then(function(d){
    if(d.ok){alert2('Kategori dihapus!');loadFiles();}else alert2('Error','err');
  });
}
function addFile(){
  var cat=document.getElementById('fCat').value;
  var ver=document.getElementById('fVer').value.trim();
  var fid=document.getElementById('fId').value.trim();
  var ft=document.getElementById('fType').value;
  var cap=document.getElementById('fCap').value.trim();
  if(!cat||!ver||!fid) return alert2('Lengkapi semua field!','err');
  apiJ('add-file',{category:cat,version:ver,file_id:fid,file_type:ft,caption:cap}).then(function(d){
    if(d.ok){alert2('File disimpan!');loadFiles();}else alert2('Error: '+d.error,'err');
  });
}
function delFile(el,cat,ver){
  if(!confirm('Hapus file '+ver+'?')) return;
  apiJ('delete-file',{category:cat,version:ver}).then(function(d){
    if(d.ok){alert2('File dihapus!');loadFiles();}else alert2('Error','err');
  });
}

// ── BROADCAST ──
function setMode(m){
  curMode=m;
  ['text','photo','video'].forEach(function(x){
    document.getElementById('m-'+x).style.display=x===m?'block':'none';
  });
  document.querySelectorAll('.mtab').forEach(function(t,i){
    t.classList.toggle('active',['text','photo','video'][i]===m);
  });
}
function sendBroadcast(){
  var target=document.getElementById('bcTarget').value;
  var payload={mode:curMode,target:target};
  if(curMode==='text'){
    payload.text=document.getElementById('bcText').value.trim();
    if(!payload.text) return alert2('Tulis pesan dulu!','err');
  } else if(curMode==='photo'){
    payload.photo=document.getElementById('bcPhoto').value.trim();
    payload.caption=document.getElementById('bcPhotoCaption').value.trim();
    if(!payload.photo) return alert2('Masukkan URL/File ID foto!','err');
  } else {
    payload.video=document.getElementById('bcVideo').value.trim();
    payload.caption=document.getElementById('bcVideoCaption').value.trim();
    if(!payload.video) return alert2('Masukkan URL/File ID video!','err');
  }
  var prog=document.getElementById('bcProgress');
  prog.style.display='block';
  document.getElementById('bcStatus').textContent='Sedang mengirim...';
  document.getElementById('bcBar').style.width='30%';
  apiJ('broadcast',payload).then(function(d){
    document.getElementById('bcBar').style.width='100%';
    if(d.ok){
      document.getElementById('bcStatus').textContent='Selesai! Berhasil: '+d.success+', Gagal: '+d.failed;
      alert2('Broadcast selesai! '+d.success+' pesan terkirim.');
    } else {
      document.getElementById('bcStatus').textContent='Error: '+d.error;
      alert2('Broadcast gagal!','err');
    }
  });
}

// ── SETTINGS ──
function loadSettings(){
  apiJ('get-settings').then(function(d){
    if(!d.ok) return;
    document.getElementById('sInfo').value=d.bot_info||'';
    document.getElementById('sYt').value=d.youtube_info||'';
    document.getElementById('sAnn').value=d.latest_announcement||'';
  });
}
function saveSetting(key,elId,label){
  var value=document.getElementById(elId).value;
  apiJ('save-setting',{key:key,value:value}).then(function(d){
    if(d.ok)alert2(label+' berhasil disimpan!');else alert2('Gagal!','err');
  });
}
function setupWebhook(){
  apiJ('setup-webhook',{}).then(function(d){
    if(d.ok) alert2('Webhook berhasil di-setup!');
    else alert2('Gagal: '+JSON.stringify(d),'err');
  });
}

// ── UTILS ──
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
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

    if (url.pathname.startsWith("/api/"))
      return handleAPI(request, env, url);

    return Response.redirect(url.origin + "/dashboard", 302);
  },
};
