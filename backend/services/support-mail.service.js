const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const db = require('../database/mongodb');
const { sendMail, safeSend, sendSupportReceivedEmail, hasSmtpConfig } = require('../utils/mail.utils');
const templates = require('../utils/mail-templates');

const SYNC_MS = 25_000;
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
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => String(item.address || item || '').trim().toLowerCase())
    .filter((email) => email.includes('@'));
}

async function clientDirectory() {
  const tenants = await db.ListTenants();
  const byEmail = new Map();
  await Promise.all(
    tenants.map(async (tenant) => {
      const users = await db.ListUsersByTenant(tenant.id);
      for (const user of users) {
        const email = String(user.email || '').trim().toLowerCase();
        if (email.includes('@')) byEmail.set(email, tenant.id);
      }
    })
  );
  return byEmail;
}

async function rememberMessage(doc) {
  await db.SaveSupportMail(doc);
}

async function pullInbox() {
  if (!canReadInbox()) return { ok: false, reason: 'sin buzón' };
  const ours = mailboxAddress();
  const directory = await clientDirectory();
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
    const since = new Date();
    since.setDate(since.getDate() - 45);
    const uids = await client.search({ since });
    const recent = (uids || []).slice(-80);
    if (!recent.length) return { ok: true, added: 0 };

    let added = 0;
    for await (const msg of client.fetch(recent, { envelope: true, source: true, uid: true })) {
      const parsed = await simpleParser(msg.source);
      const messageId = String(parsed.messageId || msg.envelope?.messageId || `uid-${msg.uid}`).trim();
      const from = addressList(parsed.from?.value)[0] || '';
      const to = addressList(parsed.to?.value).join(', ');
      const participants = [from, ...addressList(parsed.to?.value)].filter((email) => email && email !== ours);
      const replyIds = referenceIds(parsed);
      const linked = await db.FindSupportMailByMessageIds(replyIdVariants(replyIds));
      const parent = linked.find((row) => row.ticketId || row.tenantId) || linked[0] || null;
      const tenantId = parent?.tenantId || participants.map((email) => directory.get(email)).find(Boolean) || null;
      const ticketId = parent?.ticketId || (parent ? bareId(parent.messageId) : bareId(messageId));
      const direction = from === ours ? 'out' : 'in';
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
        at: parsed.date || msg.envelope?.date || new Date(),
      });
      added += 1;
    }
    return { ok: true, added };
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

async function syncInbox() {
  const now = Date.now();
  if (now - lastSync < SYNC_MS) return { ok: true, cached: true };
  if (syncing) return syncing;
  syncing = pullInbox()
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
      const bySubject = key ? tickets.find((item) => subjectKey(item.subject) === key) || null : null;
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
        messages: ticket.messages,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
}

async function threadForLocal(tenantId) {
  const messages = await db.ListSupportMail(tenantId);
  return { messages, tickets: buildTickets(messages) };
}

async function threadFor(tenantId) {
  const sync = await syncInbox();
  const messages = await db.ListSupportMail(tenantId);
  return { messages, tickets: buildTickets(messages), inboxError: sync.ok ? '' : sync.reason || '' };
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
  return threadForLocal(tenantId);
}

async function sendToClient({ tenantId, to, subject, message, storeName, ticketId }) {
  const body = String(message || '').trim();
  if (body.length < 2) {
    const err = new Error('Escribe el mensaje.');
    err.status = 400;
    throw err;
  }

  const existing = await db.ListSupportMail(tenantId);
  const tickets = buildTickets(existing);
  const ticket = ticketId ? tickets.find((item) => item.id === String(ticketId)) : null;
  if (ticketId && !ticket) {
    const err = new Error('No encontré ese ticket.');
    err.status = 404;
    throw err;
  }

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
    at: new Date(),
  });
  if (ticket) {
    for (const row of ticket.messages) {
      if (row.ticketId === resolvedTicket) continue;
      await rememberMessage({
        messageId: row.messageId,
        tenantId: String(tenantId),
        ticketId: resolvedTicket,
      });
    }
  }
  return threadFor(tenantId);
}

async function unmatchedInbox() {
  const sync = await syncInbox();
  return {
    messages: await db.ListUnmatchedSupportMail(),
    inboxError: sync.ok ? '' : sync.reason || '',
  };
}

async function waitingInbox() {
  const sync = await syncInbox();
  const messages = await db.ListSupportMailAll();
  const byTenant = new Map();
  for (const message of messages) {
    const tenantId = String(message.tenantId || '');
    if (!tenantId) continue;
    if (!byTenant.has(tenantId)) byTenant.set(tenantId, []);
    byTenant.get(tenantId).push(message);
  }

  const tenantIds = [...byTenant.keys()];
  const [tenants, settings] = await Promise.all([
    Promise.all(tenantIds.map((id) => db.GetTenantById(id))),
    Promise.all(tenantIds.map((id) => db.GetSettings(id))),
  ]);

  const items = [];
  tenantIds.forEach((tenantId, index) => {
    const open = buildTickets(byTenant.get(tenantId)).filter((ticket) => ticket.status === 'open');
    const storeName = settings[index]?.businessName || tenants[index]?.name || 'Cliente';
    for (const ticket of open) {
      const lastIn = [...ticket.messages].reverse().find((row) => row.direction === 'in') || ticket.messages.at(-1);
      items.push({
        tenantId,
        businessName: storeName,
        ticketId: ticket.id,
        subject: ticket.subject,
        from: ticket.to,
        preview: clip(lastIn?.text || '', 160),
        updatedAt: ticket.updatedAt,
      });
    }
  });

  items.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return { items, inboxError: sync.ok ? '' : sync.reason || '' };
}

module.exports = {
  threadFor,
  threadForLocal,
  sendFromClient,
  sendToClient,
  unmatchedInbox,
  waitingInbox,
};
