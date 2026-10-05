const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const db = require('../database/mongodb');
const { sendMail, safeSend, sendSupportReceivedEmail, hasSmtpConfig } = require('../utils/mail.utils');
const templates = require('../utils/mail-templates');

// La bandeja de Gmail (IMAP) se lee como mucho una vez por minuto entre TODAS las instancias,
// solo trae lo nuevo y las pantallas no esperan más de READ_WAIT_MS por ella: usan lo guardado.
const SYNC_MS = 60_000;
const LEASE_MS = 90_000;
const READ_WAIT_MS = 1_500;
const STATE_ID = 'support-inbox';
let lastSync = 0;
let syncing = null;

function mailboxAddress() {
  const raw = String(process.env.MAIL_FROM || process.env.SMTP_USER || '');
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

function canReadInbox() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function clip(value, max = 6000) {
  const text = String(value || '').replace(/\s+\n/g, '\n').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function bareId(value) {
  return String(value || '').replace(/[<>]/g, '').trim().toLowerCase();
}

function wrapId(value) {
  const bare = bareId(value);
  return bare ? `<${bare}>` : '';
}

function referenceIds(parsed) {
  const raw = []
    .concat(parsed?.inReplyTo || [])
    .concat(parsed?.references || []);
  return [...new Set(raw.flatMap((item) => String(item || '').split(/\s+/)).map(bareId).filter(Boolean))];
}

function replyIdVariants(ids) {
  return [...new Set(ids.flatMap((id) => {
    const bare = bareId(id);
    return bare ? [bare, `<${bare}>`] : [];
  }))];
}

function subjectKey(subject) {
  return String(subject || '')
    .replace(/^(\s*(re|rv|fwd|fw)\s*:\s*)+/i, '')
    .trim()
    .toLowerCase();
}

function replySubject(subject) {
  const clean = String(subject || '').replace(/^(\s*(re|rv|fwd|fw)\s*:\s*)+/i, '').trim();
  return clean ? `Re: ${clean}` : 'Re: Mi Tiendita';
}

function makeMessageId() {
  return `<ticket.${Date.now()}.${Math.random().toString(36).slice(2, 10)}@mitiendita.software>`;
}

function addressList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(/[,;]+/);
  return list
    .map((item) => {
      const raw = String(item && typeof item === 'object' ? item.address || '' : item || '');
      const angled = raw.match(/<([^>]+)>/);
      return (angled ? angled[1] : raw).trim().toLowerCase();
    })
    .filter((email) => email.includes('@'));
}

function staffEmailOf(user) {
  return String(user?.email || '').trim().toLowerCase();
}

async function staffContext() {
  const mailbox = mailboxAddress();
  const staff = await db.ListPlatformUsers();
  const staffEmails = new Set(staff.map(staffEmailOf).filter((email) => email.includes('@')));
  return {
    mailbox,
    mailboxOwner: mailbox,
    staffEmails,
  };
}

function pickAssignee({ to, parentAssignee, mailbox, mailboxOwner, staffEmails }) {
  const inherited = String(parentAssignee || '').trim().toLowerCase();
  if (inherited.includes('@')) return inherited;
  const recipients = addressList(to);
  const addressedStaff = recipients.find((email) => staffEmails.has(email) && email !== mailbox);
  if (addressedStaff) return addressedStaff;
  return mailboxOwner || mailbox;
}

function messageOwner(row, mailboxOwner) {
  return String(row?.assignedTo || mailboxOwner || '').trim().toLowerCase();
}

function mineMessages(messages, staffEmail, mailboxOwner) {
  const me = String(staffEmail || '').trim().toLowerCase();
  if (!me.includes('@')) return [];
  return messages.filter((row) => messageOwner(row, mailboxOwner) === me);
}

function ticketAssignee(ticket, mailboxOwner) {
  const owned = [...(ticket.messages || [])].reverse().find((row) => row.assignedTo) || ticket.messages?.[0];
  return messageOwner(owned, mailboxOwner);
}

function mineOnly(tickets, staffEmail, mailboxOwner) {
  const me = String(staffEmail || '').trim().toLowerCase();
  if (!me.includes('@')) return [];
  return tickets.filter((ticket) => ticketAssignee(ticket, mailboxOwner) === me);
}

function forbidForeignTicket(ticket, staffEmail, mailboxOwner) {
  const me = String(staffEmail || '').trim().toLowerCase();
  const owner = ticketAssignee(ticket, mailboxOwner);
  if (owner && me && owner !== me) {
    const err = new Error('Ese correo está asignado a otra persona.');
    err.status = 403;
    throw err;
  }
}

async function backfillAssignees() {
  const { mailbox, mailboxOwner, staffEmails } = await staffContext();
  await db.AssignUnassignedSupportMail(mailboxOwner);
  const rows = await db.ListSupportMailRaw();
  const byMessage = new Map();
  const byTicket = new Map();
  for (const row of rows) {
    const refs = [row.inReplyTo, ...(row.references || [])].map(bareId).filter(Boolean);
    const inherited = String(row.assignedTo || '').trim().toLowerCase()
      || refs.map((id) => byMessage.get(id)).find(Boolean)
      || (row.ticketId ? byTicket.get(row.ticketId) : '')
      || '';
    const assignedTo = pickAssignee({
      to: row.to,
      parentAssignee: inherited,
      mailbox,
      mailboxOwner,
      staffEmails,
    });
    if (assignedTo && assignedTo !== String(row.assignedTo || '').trim().toLowerCase()) {
      await db.SaveSupportMail({ messageId: row.messageId, assignedTo });
    }
    if (row.messageId) byMessage.set(bareId(row.messageId), assignedTo);
    if (row.ticketId) byTicket.set(row.ticketId, assignedTo);
  }
  return { mailbox, mailboxOwner, staffEmails };
}

async function clientDirectory() {
  const tenants = await db.ListTenants();
  const byEmail = new Map();
  const usersByTenant = await db.ListUsersByTenants(tenants.map((t) => t.id));
  for (const [tenantId, users] of usersByTenant) {
    for (const user of users) {
      const email = String(user.email || '').trim().toLowerCase();
      if (email.includes('@')) byEmail.set(email, tenantId);
    }
  }
  return byEmail;
}

async function rememberMessage(doc) {
  await db.SaveSupportMail(doc);
}

async function pullInbox(state = {}) {
  if (!canReadInbox()) {
    await backfillAssignees().catch(() => {});
    return { ok: false, reason: 'sin buzón' };
  }
  const ours = mailboxAddress();
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const uidValidity = String(client.mailbox?.uidValidity || '');
    const sameBox = state.uidValidity && state.uidValidity === uidValidity && Number(state.lastUid) > 0;
    let uids;
    if (sameBox) {
      // Solo lo que llegó después de la última lectura
      uids = (await client.search({ uid: `${Number(state.lastUid) + 1}:*` }, { uid: true })) || [];
      uids = uids.filter((uid) => uid > Number(state.lastUid));
    } else {
      const since = new Date();
      since.setDate(since.getDate() - 45);
      uids = (await client.search({ since }, { uid: true })) || [];
    }
    const recent = uids.slice(-80);
    const maxUid = recent.length ? Math.max(...recent) : Number(state.lastUid) || 0;
    if (!recent.length) return { ok: true, added: 0, uidValidity, lastUid: maxUid };

    // Primero solo los encabezados: lo que ya está guardado no se descarga ni se vuelve a procesar
    const heads = [];
    for await (const msg of client.fetch(recent, { envelope: true, uid: true }, { uid: true })) {
      heads.push({ uid: msg.uid, messageId: String(msg.envelope?.messageId || '').trim() });
    }
    const known = new Set(
      (await db.FindSupportMailByMessageIds(heads.map((h) => h.messageId).filter(Boolean))).map((row) => row.messageId)
    );
    const fresh = heads.filter((h) => !h.messageId || !known.has(h.messageId)).map((h) => h.uid);
    if (!fresh.length) return { ok: true, added: 0, uidValidity, lastUid: maxUid };

    const { mailboxOwner, staffEmails } = await backfillAssignees();
    const directory = await clientDirectory();
    let added = 0;
    for await (const msg of client.fetch(fresh, { envelope: true, source: true, uid: true }, { uid: true })) {
      const parsed = await simpleParser(msg.source);
      const messageId = String(parsed.messageId || msg.envelope?.messageId || `uid-${msg.uid}`).trim();
      const from = addressList(parsed.from?.value)[0] || '';
      const to = [...addressList(parsed.to?.value), ...addressList(parsed.cc?.value)].join(', ');
      const participants = [from, ...addressList(parsed.to?.value)].filter((email) => email && email !== ours);
      const replyIds = referenceIds(parsed);
      const linked = await db.FindSupportMailByMessageIds(replyIdVariants(replyIds));
      const parent = linked.find((row) => row.ticketId || row.tenantId) || linked[0] || null;
      const tenantId = parent?.tenantId || participants.map((email) => directory.get(email)).find(Boolean) || null;
      const ticketId = parent?.ticketId || (parent ? bareId(parent.messageId) : bareId(messageId));
      const direction = from === ours ? 'out' : 'in';
      const assignedTo = pickAssignee({
        to,
        parentAssignee: parent?.assignedTo,
        mailbox: ours,
        mailboxOwner,
        staffEmails,
      });
      if (parent && tenantId && (!parent.tenantId || !parent.ticketId)) {
        await rememberMessage({
          messageId: parent.messageId,
          tenantId,
          ticketId,
          direction: parent.direction,
          from: parent.from,
          to: parent.to,
          subject: parent.subject,
          text: parent.text,
          assignedTo,
          at: parent.at,
        });
      }
      await rememberMessage({
        messageId,
        tenantId,
        ticketId,
        direction,
        from,
        to,
        subject: clip(parsed.subject || msg.envelope?.subject || '(sin asunto)', 180),
        text: clip(parsed.text || ''),
        inReplyTo: replyIds[0] ? wrapId(replyIds[0]) : '',
        references: replyIds.map(wrapId),
        assignedTo,
        at: parsed.date || msg.envelope?.date || new Date(),
      });
      added += 1;
    }
    return { ok: true, added, uidValidity, lastUid: maxUid };
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

/** Toma el turno de leer la bandeja (una instancia a la vez, como mucho cada SYNC_MS). */
async function takeSyncTurn() {
  const col = db.appState ? db.appState() : null;
  if (!col) return { taken: true, state: {} };
  const now = Date.now();
  try {
    const r = await col.findOneAndUpdate(
      {
        _id: STATE_ID,
        $and: [
          { $or: [{ lastSync: { $lt: now - SYNC_MS } }, { lastSync: { $exists: false } }] },
          { $or: [{ lockUntil: { $lt: now } }, { lockUntil: { $exists: false } }] },
        ],
      },
      { $set: { lockUntil: now + LEASE_MS } },
      { upsert: true, returnDocument: 'before' }
    );
    const before = r && Object.prototype.hasOwnProperty.call(r, 'value') ? r.value : r;
    return { taken: true, state: before || {} };
  } catch (err) {
    // Clave repetida: otra instancia tiene el turno o ya leyó hace poco
    if (err && err.code === 11000) return { taken: false };
    throw err;
  }
}

async function releaseSyncTurn(result) {
  const col = db.appState ? db.appState() : null;
  if (!col) return;
  const patch = { lockUntil: 0, lastSync: Date.now() };
  if (result?.uidValidity) {
    patch.uidValidity = result.uidValidity;
    patch.lastUid = result.lastUid || 0;
  }
  await col.updateOne({ _id: STATE_ID }, { $set: patch }, { upsert: true }).catch(() => {});
}

async function syncInbox() {
  const now = Date.now();
  if (now - lastSync < SYNC_MS) return { ok: true, cached: true };
  if (syncing) return syncing;
  syncing = (async () => {
    const turn = await takeSyncTurn();
    if (!turn.taken) return { ok: true, cached: true };
    let result = null;
    try {
      result = await pullInbox(turn.state);
      return result;
    } finally {
      await releaseSyncTurn(result);
    }
  })()
    .then((result) => {
      lastSync = Date.now();
      return result;
    })
    .catch((err) => {
      console.error('[soporte] No pude leer la bandeja:', err.message);
      return { ok: false, reason: 'No pude leer los correos que te mandaron. Revisa que Gmail tenga IMAP activo.' };
    })
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

/**
 * Para pantallas: espera la lectura de la bandeja solo un momento. Si Gmail tarda, se responde
 * con lo ya guardado y la lectura sigue por su cuenta.
 */
async function syncForRead() {
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ ok: true, pending: true }), READ_WAIT_MS));
  return Promise.race([syncInbox(), timeout]);
}

function counterparty(messages) {
  const inbound = [...messages].reverse().find((row) => row.direction === 'in' && row.from);
  if (inbound) return String(inbound.from).trim().toLowerCase();
  const outbound = messages.find((row) => row.direction === 'out' && row.to);
  return outbound ? String(outbound.to).split(',')[0].trim().toLowerCase() : '';
}

function buildTickets(messages) {
  const sorted = [...messages].sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
  const tickets = [];
  const byMessage = new Map();

  for (const message of sorted) {
    const refs = [message.inReplyTo, ...(message.references || [])].map(bareId).filter(Boolean);
    let ticket = refs.map((id) => byMessage.get(id)).find(Boolean) || null;
    if (!ticket && message.ticketId) {
      ticket = tickets.find((item) => item.id === message.ticketId) || null;
    }
    if (!ticket) {
      const key = subjectKey(message.subject);
      const owner = messageOwner(message, '');
      const bySubject = key
        ? tickets.find((item) => subjectKey(item.subject) === key && ticketAssignee(item, '') === owner) || null
        : null;
      if (bySubject && (!message.ticketId || message.ticketId === bySubject.id)) ticket = bySubject;
    }
    if (!ticket) {
      ticket = {
        id: message.ticketId || bareId(message.messageId) || message.id,
        subject: String(message.subject || '').replace(/^(\s*(re|rv|fwd|fw)\s*:\s*)+/i, '').trim() || '(sin asunto)',
        messages: [],
      };
      tickets.push(ticket);
    }
    ticket.messages.push(message);
    if (message.messageId) byMessage.set(bareId(message.messageId), ticket);
  }

  return tickets
    .map((ticket) => {
      const last = ticket.messages[ticket.messages.length - 1];
      return {
        id: ticket.id,
        subject: ticket.subject,
        status: last?.direction === 'in' ? 'open' : 'answered',
        updatedAt: last?.at || null,
        to: counterparty(ticket.messages),
        assignedTo: ticketAssignee({ messages: ticket.messages }, ''),
        messages: ticket.messages,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
}

function scopedThread(messages, { staffEmail, clientEmail, mailboxOwner } = {}) {
  if (clientEmail) {
    const mine = String(clientEmail).trim().toLowerCase();
    const tickets = buildTickets(messages).filter((ticket) => ticket.to === mine);
    const allowed = new Set(tickets.flatMap((ticket) => ticket.messages.map((row) => row.messageId || row.id)));
    return {
      messages: messages.filter((row) => allowed.has(row.messageId) || allowed.has(row.id)),
      tickets,
    };
  }
  const mine = mineMessages(messages, staffEmail, mailboxOwner);
  const tickets = mineOnly(buildTickets(mine), staffEmail, mailboxOwner);
  const allowed = new Set(tickets.flatMap((ticket) => ticket.messages.map((row) => row.messageId || row.id)));
  return {
    messages: mine.filter((row) => allowed.has(row.messageId) || allowed.has(row.id)),
    tickets,
  };
}

async function threadForLocal(tenantId, opts = {}) {
  const { mailboxOwner } = await staffContext();
  const messages = await db.ListSupportMail(
    tenantId,
    opts.staffEmail ? { assignedTo: opts.staffEmail, mailboxOwner } : {}
  );
  return scopedThread(messages, { ...opts, mailboxOwner });
}

async function threadFor(tenantId, opts = {}) {
  const sync = await syncForRead();
  const { mailboxOwner } = await staffContext();
  const messages = await db.ListSupportMail(tenantId, {
    assignedTo: opts.staffEmail,
    mailboxOwner,
  });
  return {
    ...scopedThread(messages, { ...opts, mailboxOwner }),
    inboxError: sync.ok ? '' : sync.reason || '',
  };
}

async function sendFromClient({ tenantId, from, storeName, subject, message }) {
  const body = String(message || '').trim();
  const title = String(subject || '').trim();
  if (title.length < 3) {
    const err = new Error('Escribe un asunto.');
    err.status = 400;
    throw err;
  }
  if (body.length < 8) {
    const err = new Error('Escribe el mensaje.');
    err.status = 400;
    throw err;
  }
  const { mailboxOwner } = await staffContext();
  const messageId = makeMessageId();
  const ticketId = bareId(messageId);
  await rememberMessage({
    messageId,
    tenantId: String(tenantId),
    ticketId,
    direction: 'in',
    from: String(from || '').toLowerCase(),
    to: mailboxAddress(),
    subject: title,
    text: body,
    assignedTo: mailboxOwner,
    at: new Date(),
  });
  if (hasSmtpConfig() && from) {
    await safeSend(() =>
      sendSupportReceivedEmail({
        to: from,
        storeName,
        subject: title,
        message: body,
      })
    );
  }
  return threadForLocal(tenantId, { clientEmail: String(from || '').toLowerCase() });
}

async function sendToClient({ tenantId, to, subject, message, storeName, ticketId, staffEmail }) {
  const body = String(message || '').trim();
  if (body.length < 2) {
    const err = new Error('Escribe el mensaje.');
    err.status = 400;
    throw err;
  }

  const { mailboxOwner } = await staffContext();
  const assignee = String(staffEmail || mailboxOwner).trim().toLowerCase();
  const existing = await db.ListSupportMail(tenantId);
  const tickets = buildTickets(existing);
  const ticket = ticketId ? tickets.find((item) => item.id === String(ticketId)) : null;
  if (ticketId && !ticket) {
    const err = new Error('No encontré ese ticket.');
    err.status = 404;
    throw err;
  }
  if (ticket) forbidForeignTicket(ticket, assignee, mailboxOwner);

  const recipient = String(ticket?.to || to || '').trim().toLowerCase();
  const title = ticket ? replySubject(ticket.subject) : String(subject || '').trim();
  if (!recipient.includes('@')) {
    const err = new Error('Ese cliente no tiene un correo.');
    err.status = 400;
    throw err;
  }
  if (!ticket && title.length < 2) {
    const err = new Error('Escribe el asunto del ticket.');
    err.status = 400;
    throw err;
  }

  const parent = ticket?.messages?.[ticket.messages.length - 1] || null;
  const priorIds = parent
    ? [...(parent.references || []), parent.messageId].map(wrapId).filter(Boolean)
    : [];
  const messageId = makeMessageId();
  const resolvedTicket = ticket?.id || bareId(messageId);
  const assignedTo = ticket ? ticketAssignee(ticket, mailboxOwner) : assignee;
  const built = templates.supportReplyEmail({ storeName, message: body });
  const sent = await sendMail({
    to: recipient,
    subject: title,
    html: built.html,
    messageId,
    inReplyTo: parent?.messageId ? wrapId(parent.messageId) : undefined,
    references: priorIds,
  });
  await rememberMessage({
    messageId: sent.id || messageId,
    tenantId: String(tenantId),
    ticketId: resolvedTicket,
    direction: 'out',
    from: mailboxAddress(),
    to: recipient,
    subject: title,
    text: body,
    inReplyTo: parent?.messageId ? wrapId(parent.messageId) : '',
    references: priorIds,
    assignedTo,
    at: new Date(),
  });
  if (ticket) {
    for (const row of ticket.messages) {
      await rememberMessage({
        messageId: row.messageId,
        tenantId: String(tenantId),
        ticketId: resolvedTicket,
        assignedTo,
      });
    }
  }
  return threadFor(tenantId, { staffEmail: assignee });
}

async function unmatchedInbox(staffEmail) {
  const sync = await syncForRead();
  const { mailboxOwner } = await staffContext();
  return {
    messages: await db.ListUnmatchedSupportMail({ assignedTo: staffEmail, mailboxOwner }),
    inboxError: sync.ok ? '' : sync.reason || '',
  };
}

/**
 * Tickets de todos los clientes que le tocan a `staffEmail` (nunca los asignados a otra persona).
 * onlyOpen: solo los que esperan respuesta.
 */
async function collectTickets(staffEmail, { onlyOpen = false } = {}) {
  const sync = await syncForRead();
  const { mailboxOwner } = await staffContext();
  const messages = await db.ListSupportMailAll({ assignedTo: staffEmail, mailboxOwner });
  const byTenant = new Map();
  for (const message of messages) {
    const tenantId = String(message.tenantId || '');
    if (!tenantId) continue;
    if (!byTenant.has(tenantId)) byTenant.set(tenantId, []);
    byTenant.get(tenantId).push(message);
  }

  const tenantIds = [...byTenant.keys()];
  const [tenantRows, settingsMap] = await Promise.all([db.ListTenants(), db.GetSettingsMany(tenantIds)]);
  const tenantMap = new Map(tenantRows.map((t) => [String(t.id), t]));
  const tenants = tenantIds.map((id) => tenantMap.get(id) || null);
  const settings = tenantIds.map((id) => settingsMap.get(id) || null);

  const items = [];
  tenantIds.forEach((tenantId, index) => {
    const built = buildTickets(byTenant.get(tenantId)).filter((ticket) => !onlyOpen || ticket.status === 'open');
    const storeName = settings[index]?.businessName || tenants[index]?.name || 'Cliente';
    for (const ticket of mineOnly(built, staffEmail, mailboxOwner)) {
      const lastIn = [...ticket.messages].reverse().find((row) => row.direction === 'in') || ticket.messages.at(-1);
      const last = ticket.messages.at(-1);
      items.push({
        tenantId,
        businessName: storeName,
        ticketId: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        from: ticket.to,
        preview: clip(lastIn?.text || '', 160),
        lastFrom: last?.direction === 'out' ? 'Mi Tiendita' : ticket.to,
        messageCount: ticket.messages.length,
        updatedAt: ticket.updatedAt,
      });
    }
  });

  items.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return { items, inboxError: sync.ok ? '' : sync.reason || '' };
}

async function waitingInbox(staffEmail) {
  return collectTickets(staffEmail, { onlyOpen: true });
}

/**
 * Bandeja de soporte: todos los tickets de la persona, con filtro por estado y búsqueda.
 * Primero los que esperan respuesta (los más viejos arriba: llevan más tiempo esperando).
 */
async function ticketBoard(staffEmail, { status = 'all', q = '', limit = 200 } = {}) {
  const { items, inboxError } = await collectTickets(staffEmail);
  const counts = {
    open: items.filter((t) => t.status === 'open').length,
    answered: items.filter((t) => t.status === 'answered').length,
  };
  const needle = String(q || '').trim().toLowerCase();
  let list = items;
  if (status === 'open' || status === 'answered') list = list.filter((t) => t.status === status);
  if (needle) {
    list = list.filter((t) =>
      [t.businessName, t.subject, t.from, t.preview].some((v) => String(v || '').toLowerCase().includes(needle))
    );
  }
  list = [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    const da = new Date(a.updatedAt || 0);
    const dbb = new Date(b.updatedAt || 0);
    return a.status === 'open' ? da - dbb : dbb - da;
  });
  return { items: list.slice(0, Math.min(500, Math.max(1, Number(limit) || 200))), counts, inboxError };
}

module.exports = {
  threadFor,
  threadForLocal,
  sendFromClient,
  sendToClient,
  unmatchedInbox,
  waitingInbox,
  ticketBoard,
};
