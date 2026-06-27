// ============================================================
// firebase-messaging-sw.js
// Universal Packaging ERP — FCM Service Worker
//
// DEPLOY: Place this file in the SAME directory as UP_ERP_v26.html
// (or your web server root). It MUST be served from the same origin.
//
// This handles BACKGROUND push notifications when the ERP tab
// is closed or in the background.
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ── YOUR Firebase config (replace with your project values) ──
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

// ── Background message handler ────────────────────────────────
// Fires when a push arrives and the ERP tab is NOT in focus.
// Firebase auto-shows a system notification using `notification`
// payload; this handler lets us customise click behaviour.
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Background push received:', payload);

  const n = payload.notification || {};
  const d = payload.data || {};

  const title = n.title || d.title || '🔔 Maintenance Alert';
  const body  = n.body  || d.body  || 'A maintenance event requires your attention.';
  const icon  = n.icon  || '/favicon.ico';
  const badge = n.badge || '/favicon.ico';
  const tag   = d.reqId || d.tag   || 'maint-' + Date.now();

  const options = {
    body,
    icon,
    badge,
    tag,
    requireInteraction: d.priority === 'CRITICAL', // stays visible until clicked for CRITICAL
    data: {
      url:   d.url   || '/',
      reqId: d.reqId || '',
      tab:   d.tab   || 'requests'
    },
    actions: [
      { action: 'view',    title: '👁 View Request' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  return self.registration.showNotification(title, options);
});

// ── Notification click handler ────────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  const targetUrl = data.url || '/';
  const reqId = data.reqId || '';
  const tab   = data.tab   || 'requests';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If ERP tab is already open, focus it and navigate to the request
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'OPEN_MAINT_REQUEST', reqId, tab });
          return;
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow(targetUrl + (reqId ? '#maint-' + reqId : ''));
      }
    })
  );
});

// ── Push event (fallback if onBackgroundMessage doesn't fire) ─
self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const payload = event.data.json();
      // onBackgroundMessage handles this — only log here as fallback
      console.log('[SW] Raw push event data:', payload);
    } catch(e) {
      console.log('[SW] Raw push text:', event.data.text());
    }
  }
});

console.log('[SW] firebase-messaging-sw.js loaded — UP ERP push ready');
