// Versioned local save. Systems expose serialize() / hydrate() so this file
// only stitches their snapshots together.
import { SAVE_KEY, SAVE_VERSION } from "../config/balance.js";

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch (_) {
    return false;
  }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) return null;
    return data;
  } catch (_) {
    return null;
  }
}

export function writeSave(data) {
  const payload = { version: SAVE_VERSION, savedAt: Date.now(), ...data };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  return payload;
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}
