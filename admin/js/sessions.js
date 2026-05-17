import { $, clearStatus, escapeHtml, formatDate, setStatus } from "./dom.js";
import { ensureInitialized } from "./parseClient.js";
import { state } from "./state.js";

function getCaseTitleFromSession(session) {
  return session.caseTitle || session.caseId || "Unknown Case";
}

function getSessionStatusLabel(session) {
  const status = String(session.status || "unknown").toLowerCase();

  if (status === "completed") {
    return { label: "COMPLETE", className: "session-status-complete" };
  }

  if (status === "active") {
    return { label: "INCOMPLETE", className: "session-status-incomplete" };
  }

  return { label: status.toUpperCase(), className: "session-status-unknown" };
}

function renderSessionOptions(selectedSessionId = "") {
  const sessionSelect = $("sessionSelect");
  sessionSelect.innerHTML = "";

  if (!state.examSessions.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No sessions found";
    sessionSelect.appendChild(option);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a session...";
  sessionSelect.appendChild(placeholder);

  state.examSessions.forEach(session => {
    const option = document.createElement("option");
    option.value = session.id;
    option.textContent = `${getCaseTitleFromSession(session)} - ${session.status || "unknown"} - ${session.turnCount || 0} turns - ${formatDate(session.createdAt)}`;
    sessionSelect.appendChild(option);
  });

  sessionSelect.value = selectedSessionId;
}

function renderSessionSummary(session) {
  const coveredPoints = session.coveredPoints || [];
  const majorErrors = session.majorErrors || [];
  const minorErrors = session.minorErrors || [];
  const coveredPointsCount = session.coveredPointsCount ?? coveredPoints.length;
  const majorErrorsCount = session.majorErrorsCount ?? majorErrors.length;
  const minorErrorsCount = session.minorErrorsCount ?? minorErrors.length;
  const statusLabel = getSessionStatusLabel(session);

  $("sessionSummary").classList.remove("hidden");
  $("sessionSummary").innerHTML = `
    <div class="case-title">${escapeHtml(getCaseTitleFromSession(session))}</div>
    <div class="small">Status: <span class="${escapeHtml(statusLabel.className)}">${escapeHtml(statusLabel.label)}</span> · Turns: ${escapeHtml(session.turnCount || 0)} · Created: ${escapeHtml(formatDate(session.createdAt))}</div>
    <div class="small">Covered points: <span class="metric-covered">${escapeHtml(coveredPointsCount)}</span> · Major errors: <span class="metric-major">${escapeHtml(majorErrorsCount)}</span> · Minor errors: <span class="metric-minor">${escapeHtml(minorErrorsCount)}</span></div>
  `;
}

function renderTurns(turns) {
  const turnList = $("turnList");
  turnList.innerHTML = "";

  if (!turns.length) {
    turnList.innerHTML = `<div class="empty-state">No turns recorded for this session.</div>`;
    return;
  }

  turns.forEach(turn => {
    const turnIndex = Number(turn.turnIndex ?? 0);
    const div = document.createElement("div");
    div.className = "turn-item";
    div.innerHTML = `
      <div class="turn-header">
        <span>Turn ${escapeHtml(turnIndex + 1)}</span>
        <span>${escapeHtml(formatDate(turn.createdAt))}</span>
      </div>
      <div class="turn-field">
        <div class="turn-label">Examiner Prompt</div>
        <div class="turn-text">${escapeHtml(turn.examinerPrompt || "N/A")}</div>
      </div>
      <div class="turn-field">
        <div class="turn-label">Candidate Response</div>
        <div class="turn-text">${escapeHtml(turn.candidateResponse || "N/A")}</div>
      </div>
      <div class="turn-field">
        <div class="turn-label">AI Summary</div>
        <div class="turn-text">${escapeHtml(turn.aiSummary || "N/A")}</div>
      </div>
    `;
    turnList.appendChild(div);
  });
}

export async function refreshSessions() {
  try {
    ensureInitialized();
    clearStatus($("sessionStatus"));
    $("sessionSummary").classList.add("hidden");
    $("turnList").innerHTML = "";

    state.examSessions = await Parse.Cloud.run("getOralExamSessions", {});

    renderSessionOptions($("sessionSelect").value);

    if (!state.examSessions.length) {
      setStatus($("sessionStatus"), "No exam sessions found.", "ok");
    } else {
      setStatus($("sessionStatus"), `Loaded ${state.examSessions.length} exam session${state.examSessions.length === 1 ? "" : "s"}.`);
    }
  } catch (error) {
    setStatus($("sessionStatus"), error.message || String(error), "error");
  }
}

export async function loadSelectedSessionTurns() {
  try {
    ensureInitialized();
    clearStatus($("sessionStatus"));

    const sessionId = $("sessionSelect").value;
    const session = state.examSessions.find(item => item.id === sessionId);

    if (!session) {
      $("sessionSummary").classList.add("hidden");
      $("turnList").innerHTML = "";
      return;
    }

    renderSessionSummary(session);
    $("turnList").innerHTML = `<div class="empty-state">Loading turns...</div>`;

    const detail = await Parse.Cloud.run("getSessionDetail", { sessionId });
    const turns = [...(detail.turns || [])];
    turns.sort((a, b) => Number(a.turnIndex ?? 0) - Number(b.turnIndex ?? 0));

    renderSessionSummary(detail.session || session);
    renderTurns(turns);
    setStatus($("sessionStatus"), `Showing ${turns.length} turn${turns.length === 1 ? "" : "s"} in ascending turn order.`);
  } catch (error) {
    setStatus($("sessionStatus"), error.message || String(error), "error");
  }
}
