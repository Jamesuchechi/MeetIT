// Detects MeetIT room codes in calendar event pages and injects a quick-join pill.
(function detectMeetItLinks() {
  const ROOM_REGEX = /\b([a-z]{3}-[a-z]{4}-[a-z]{3})\b/g;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const matches = new Set();
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue || '';
    let m;
    while ((m = ROOM_REGEX.exec(text)) !== null) {
      if (m[1]) matches.add(m[1]);
    }
  }
  if (matches.size === 0) return;

  const firstCode = Array.from(matches)[0];
  if (document.getElementById('meetit-ext-pill')) return;
  const pill = document.createElement('a');
  pill.id = 'meetit-ext-pill';
  pill.href = `http://localhost:5173/m/${firstCode}`;
  pill.target = '_blank';
  pill.rel = 'noopener noreferrer';
  pill.textContent = `Join MeetIT (${firstCode})`;
  Object.assign(pill.style, {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    zIndex: '99999',
    padding: '10px 14px',
    borderRadius: '999px',
    background: '#2563eb',
    color: '#ffffff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '13px',
    fontWeight: '600',
    textDecoration: 'none',
    boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
  });
  document.body.appendChild(pill);
})();
