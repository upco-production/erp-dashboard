// ============================================================
// firebase-messaging-sw.js — UP ERP v2.0
// Universal Packaging ERP — FCM Service Worker
//
// DEPLOY: Same directory as index.html (web server root)
// Must be served from same origin.
//
// Features:
//   - Rich lock screen notifications (like WhatsApp)
//   - Background push when Chrome closed / phone locked
//   - Tap → opens ERP directly on Maintenance tab
//   - Action buttons: My Queue | View | Dismiss
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey:            "AIzaSyCbJ8T53-qfez9x5xHgekoxV-GQtxfF-Jo",
  authDomain:        "up-erp-dashboard.firebaseapp.com",
  projectId:         "up-erp-dashboard",
  storageBucket:     "up-erp-dashboard.firebasestorage.app",
  messagingSenderId: "945586402394",
  appId:             "1:945586402394:web:1255da2622a1c9891b5463"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ── ERP URL (update if your domain changes) ───────────────────
const ERP_URL = 'https://upco-production.github.io/erp-dashboard';
const LOGO_URL = 'https://upco-production.github.io/erp-dashboard/upco-logo.png';

// ── Months for date formatting ────────────────────────────────
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function fmtDatetime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const day  = String(d.getDate()).padStart(2, '0');
    const mon  = MONTHS[d.getMonth()];
    const yr   = d.getFullYear();
    let   hr   = d.getHours();
    const min  = String(d.getMinutes()).padStart(2, '0');
    const ampm = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12 || 12;
    return day + '-' + mon + '-' + yr + ', ' + String(hr).padStart(2,'0') + ':' + min + ' ' + ampm;
  } catch(e) { return iso; }
}

// ── Build rich notification body ──────────────────────────────
// Format matches the mockup image:
//   ME/PT/26/06/015 | ROTO-01 | Printing
//   [description]
//   Priority: HIGH    Status: OPEN
//   Dept: Printing    Machine: ROTO-01
//   Type: ME          Date & Time: 27-JUN-2026, 10:22 AM
//   Requested By: @BAQIR
function buildNotification(d, n) {
  const notifNo    = d.notifNo    || d.reqId  || '';
  const machine    = d.machine    || '';
  const dept       = d.reqDept    || d.dept   || '';
  const type       = d.reqType    || d.type   || '';
  const priority   = d.priority   || '';
  const status     = d.status     || '';
  const desc       = d.description|| n.body   || '';
  const requestedBy= d.requestedBy|| d.submittedByUser || '';
  const submittedAt= d.submittedAt|| d.timestamp || new Date().toISOString();
  const event      = d.event      || '';

  // Title: NotifNo | Machine | Dept
  const titleParts = [notifNo, machine, dept].filter(Boolean);
  const title = 'UPCO Maintenance Alert' + (titleParts.length ? ' — ' + titleParts.join(' | ') : '');

  // Event label for context
  const eventLabels = {
    newRequest  : '🆕 New maintenance request created',
    accepted    : '✅ Request accepted by technical team',
    rejected    : '❌ Request rejected',
    techComplete: '🔧 Repair complete — please verify',
    confirmed   : '🔒 Request confirmed and locked',
  };
  const eventLine = eventLabels[event] || n.body || 'Maintenance update';

  // Body: structured like the mockup
  const lines = [];
  lines.push(eventLine);
  if (desc) lines.push('');
  if (desc) lines.push(desc.slice(0, 120) + (desc.length > 120 ? '…' : ''));
  lines.push('');
  if (priority || status)
    lines.push('Priority: ' + (priority||'-') + '    Status: ' + (status||'-'));
  if (dept || machine)
    lines.push('Dept: ' + (dept||'-') + '    Machine: ' + (machine||'-'));
  if (submittedAt)
    lines.push('Date & Time: ' + fmtDatetime(submittedAt));
  if (requestedBy)
    lines.push('Requested By: @' + requestedBy);
  lines.push('');
  lines.push('Tap to view request details in ERP →');

  return { title, body: lines.join('\n') };
}

// ── Background message handler ────────────────────────────────
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Background push:', payload);

  const n = payload.notification || {};
  const d = payload.data         || {};

  const { title, body } = buildNotification(d, n);

  const reqId    = d.reqId || d.notifNo || '';
  const priority = (d.priority || '').toUpperCase();
  const event    = d.event || '';

  // Deep link: open ERP on maintenance tab
  const deepLink = ERP_URL + '/index.html#maintenance' + (reqId ? '?req=' + reqId : '');

  // Check silent mode flag sent from ERP
  var isSilent = d.silent === 'true' || d.silent === true;

  const options = {
    body,
    icon : LOGO_URL,
    image: LOGO_URL,
    tag  : reqId || ('maint-' + Date.now()),
    // CRITICAL stays on screen until dismissed
    requireInteraction: !isSilent && (priority === 'CRITICAL' || event === 'newRequest'),
    // Silent mode: no sound, no vibration — notification still appears on lock screen
    silent : isSilent,
    vibrate: isSilent ? [] : (priority === 'CRITICAL' ? [200,100,200,100,200] : [200,100,200]),
    data: {
      url   : deepLink,
      reqId : reqId,
      event : event,
      silent: isSilent,
    },
    actions: [
      { action: 'queue',   title: '📋 My Queue'    },
      { action: 'view',    title: '👁 View Request' },
      { action: 'dismiss', title: 'Dismiss'         },
    ],
  };

  return self.registration.showNotification(title, options);
});

// ── Notification click handler ────────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const data  = event.notification.data || {};
  const reqId = data.reqId || '';
  const isQueue = event.action === 'queue';

  // URL: maintenance tab, optionally highlight specific request
  const targetUrl = isQueue
    ? ERP_URL + '/index.html#maint-queue'
    : ERP_URL + '/index.html#maintenance' + (reqId ? '?req=' + reqId : '');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {

      // 1. ERP tab already open → focus + navigate
      for (const client of clientList) {
        if (client.url.startsWith(ERP_URL)) {
          client.focus();
          client.postMessage({
            type  : 'OPEN_MAINT_REQUEST',
            reqId : reqId,
            tab   : isQueue ? 'queue' : 'requests',
            event : data.event || '',
          });
          return;
        }
      }

      // 2. No tab open → open new window (works on Android Chrome, iOS Safari PWA)
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Push fallback (if onBackgroundMessage doesn't fire) ───────
self.addEventListener('push', function(event) {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    console.log('[SW] Raw push:', payload);

    // If Firebase didn't handle it, show manually
    const n = payload.notification || {};
    const d = payload.data         || {};

    if (n.title || d.title) {
      const { title, body } = buildNotification(d, n);
      event.waitUntil(
        self.registration.showNotification(title, {
          body,
          icon: LOGO_URL,
          image: LOGO_URL,
          tag  : d.reqId || ('maint-' + Date.now()),
          requireInteraction: (d.priority||'').toUpperCase() === 'CRITICAL',
          data : { url: ERP_URL + '/index.html#maintenance', reqId: d.reqId || '' },
          actions: [
            { action: 'queue',   title: '📋 My Queue'    },
            { action: 'view',    title: '👁 View Request' },
            { action: 'dismiss', title: 'Dismiss'         },
          ],
        })
      );
    }
  } catch(e) {
    console.log('[SW] Push parse error:', e.message);
  }
});

// ── Service Worker lifecycle ──────────────────────────────────
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(clients.claim()));

console.log('[SW] UP ERP firebase-messaging-sw.js v2.0 loaded');
