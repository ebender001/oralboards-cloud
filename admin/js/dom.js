export const $ = (id) => document.getElementById(id);

export function setStatus(element, message, kind = "ok") {
  element.textContent = message;
  element.className = `status show ${kind}`;
}

export function clearStatus(element) {
  element.textContent = "";
  element.className = "status";
}

export function formatErrorMessage(error) {
  const parts = [];

  if (error?.message) {
    parts.push(error.message);
  } else {
    parts.push(String(error));
  }

  if (error?.code !== undefined) {
    parts.push(`Parse code: ${error.code}`);
  }

  return parts.join(" ");
}

export function setControlsDisabled(controlIds, disabled) {
  controlIds.forEach(id => {
    const element = $(id);
    if (element) {
      element.disabled = disabled;
    }
  });
}

export function linesToArray(text) {
  return text
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}
