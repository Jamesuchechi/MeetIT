const WEB_APP_URL = 'http://localhost:5173';
const SIGNALING_URL = 'http://localhost:8787';

document.getElementById('start-btn')?.addEventListener('click', async () => {
  try {
    const res = await fetch(`${SIGNALING_URL}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.code) {
      chrome.tabs.create({ url: `${WEB_APP_URL}/m/${data.code}` });
      return;
    }
  } catch {
    // fallback to landing page
  }
  chrome.tabs.create({ url: WEB_APP_URL });
});

document.getElementById('join-btn')?.addEventListener('click', () => {
  const input = document.getElementById('code-input');
  const code = (input?.value || '').trim().toLowerCase();
  if (code) {
    chrome.tabs.create({ url: `${WEB_APP_URL}/m/${encodeURIComponent(code)}` });
  }
});
