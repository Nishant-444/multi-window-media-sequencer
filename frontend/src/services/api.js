// API client service for communicating with the Golang backend

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export async function fetchWindows() {
  const res = await fetch(`${API_BASE_URL}/api/windows`);
  if (!res.ok) throw new Error(`Failed to fetch windows: ${res.statusText}`);
  return res.json();
}

export async function createWindow(name) {
  const res = await fetch(`${API_BASE_URL}/api/windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create window');
  }
  return res.json();
}

export async function addMediaItem(windowId, { title, type, url, duration }) {
  const res = await fetch(`${API_BASE_URL}/api/windows/${windowId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, type, url, duration: parseInt(duration, 10) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to add media item');
  }
  return res.json();
}

export async function deleteMediaItem(mediaId) {
  const res = await fetch(`${API_BASE_URL}/api/media/${mediaId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete media item');
  }
  return res.json();
}

export async function fetchSyncStatus() {
  const res = await fetch(`${API_BASE_URL}/api/sync/status`);
  if (!res.ok) throw new Error(`Failed to fetch sync status: ${res.statusText}`);
  return res.json();
}

export async function triggerSync(mediaItemId, durationSeconds) {
  const res = await fetch(`${API_BASE_URL}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_item_id: mediaItemId,
      duration_seconds: parseInt(durationSeconds, 10),
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to trigger sync');
  }
  return res.json();
}

export async function stopSync() {
  const res = await fetch(`${API_BASE_URL}/api/sync/stop`, {
    method: 'POST',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to stop sync');
  }
  return res.json();
}
