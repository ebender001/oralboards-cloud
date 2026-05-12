/**
 * OralExamSession Visualization
 * Provides Cloud Functions to fetch OralExamSessions and their associated OralExamTurns
 * Also serves an HTML page for visualizing the data in a web browser
 */

const { requireString } = require('./utils');

/**
 * Cloud Function: getOralExamSessions
 * Fetches all OralExamSessions with optional filtering
 * 
 * @param {Object} request - The request object
 * @param {string} [request.params.status] - Filter by session status (e.g., 'active', 'completed')
 * @param {string} [request.params.clientInstanceId] - Filter by client instance
 * @returns {Array} Array of OralExamSession objects with case details
 */
Parse.Cloud.define("getOralExamSessions", async (request) => {
  try {
    const { status, clientInstanceId } = request.params;

    const query = new Parse.Query("OralExamSession");
    query.include("case");
    query.descending("createdAt");

    // Apply optional filters
    if (status) {
      query.equalTo("status", status);
    }
    if (clientInstanceId) {
      query.equalTo("clientInstanceId", clientInstanceId);
    }

    const sessions = await query.find({ useMasterKey: true });

    // Format response with essential data
    return sessions.map((session) => ({
      id: session.id,
      status: session.get("status"),
      turnCount: session.get("turnCount"),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      caseTitle: session.get("case")?.get("title") || "Unknown Case",
      caseId: session.get("case")?.id || "Unknown",
      clientInstanceId: session.get("clientInstanceId") || "",
      coveredPointsCount: (session.get("coveredPoints") || []).length,
      majorErrorsCount: (session.get("majorErrors") || []).length,
      minorErrorsCount: (session.get("minorErrors") || []).length,
      completionReason: session.get("completionReason") || "",
    }));
  } catch (error) {
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Failed to fetch sessions: ${error.message}`);
  }
});

/**
 * Cloud Function: getOralExamTurns
 * Fetches all OralExamTurn rows for a specific OralExamSession
 * 
 * @param {Object} request - The request object
 * @param {string} request.params.sessionId - The ID of the OralExamSession
 * @returns {Array} Array of OralExamTurn objects for the session
 */
Parse.Cloud.define("getOralExamTurns", async (request) => {
  try {
    const sessionId = requireString(request.params, "sessionId");

    // Fetch the session
    const sessionQuery = new Parse.Query("OralExamSession");
    const session = await sessionQuery.get(sessionId, { useMasterKey: true });

    if (!session) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Session not found");
    }

    // Fetch all turns for this session
    const turnQuery = new Parse.Query("OralExamTurn");
    turnQuery.equalTo("session", session);
    turnQuery.ascending("turnIndex");
    const turns = await turnQuery.find({ useMasterKey: true });

    // Format response with essential data
    return turns.map((turn) => ({
      id: turn.id,
      turnIndex: turn.get("turnIndex"),
      examinerPrompt: turn.get("examinerPrompt"),
      candidateResponse: turn.get("candidateResponse"),
      nextExaminerPrompt: turn.get("nextExaminerPrompt"),
      aiSummary: turn.get("aiSummary"),
      newlyCoveredPoints: turn.get("newlyCoveredPoints") || [],
      majorErrorEvidence: turn.get("majorErrorEvidence") || [],
      minorErrorEvidence: turn.get("minorErrorEvidence") || [],
      responseQuality: turn.get("responseQuality") || "normal",
      createdAt: turn.createdAt,
    }));
  } catch (error) {
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Failed to fetch turns: ${error.message}`);
  }
});

/**
 * Cloud Function: getSessionDetail
 * Fetches a specific session with all its details and turns
 * 
 * @param {Object} request - The request object
 * @param {string} request.params.sessionId - The ID of the OralExamSession
 * @returns {Object} Session object with complete details and turns array
 */
Parse.Cloud.define("getSessionDetail", async (request) => {
  try {
    const sessionId = requireString(request.params, "sessionId");

    // Fetch the session with case details
    const sessionQuery = new Parse.Query("OralExamSession");
    sessionQuery.include("case");
    const session = await sessionQuery.get(sessionId, { useMasterKey: true });

    if (!session) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Session not found");
    }

    // Fetch all turns for this session
    const turnQuery = new Parse.Query("OralExamTurn");
    turnQuery.equalTo("session", session);
    turnQuery.ascending("turnIndex");
    const turns = await turnQuery.find({ useMasterKey: true });

    // Build comprehensive response
    return {
      session: {
        id: session.id,
        status: session.get("status"),
        turnCount: session.get("turnCount"),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        caseTitle: session.get("case")?.get("title") || "Unknown Case",
        caseId: session.get("case")?.id || "Unknown",
        caseStem: session.get("case")?.get("stem") || "",
        clientInstanceId: session.get("clientInstanceId") || "",
        coveredPoints: session.get("coveredPoints") || [],
        majorErrors: session.get("majorErrors") || [],
        minorErrors: session.get("minorErrors") || [],
        completionReason: session.get("completionReason") || "",
      },
      turns: turns.map((turn) => ({
        id: turn.id,
        turnIndex: turn.get("turnIndex"),
        examinerPrompt: turn.get("examinerPrompt"),
        candidateResponse: turn.get("candidateResponse"),
        nextExaminerPrompt: turn.get("nextExaminerPrompt"),
        aiSummary: turn.get("aiSummary"),
        newlyCoveredPoints: turn.get("newlyCoveredPoints") || [],
        majorErrorEvidence: turn.get("majorErrorEvidence") || [],
        minorErrorEvidence: turn.get("minorErrorEvidence") || [],
        responseQuality: turn.get("responseQuality") || "normal",
        createdAt: turn.createdAt,
      })),
    };
  } catch (error) {
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Failed to fetch session detail: ${error.message}`);
  }
});

/**
 * Serves the HTML visualization page
 * This function can be used with Express if needed:
 * app.get('/exam-sessions', (req, res) => { res.send(getVisualizationHTML()); });
 */
function getVisualizationHTML() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OralExam Sessions Viewer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 350px 1fr;
            gap: 20px;
            height: calc(100vh - 40px);
        }

        .sessions-panel {
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .panel-header {
            background: #333;
            color: white;
            padding: 20px;
            font-size: 18px;
            font-weight: 600;
            border-bottom: 2px solid #667eea;
        }

        .sessions-list {
            flex: 1;
            overflow-y: auto;
        }

        .session-item {
            padding: 15px;
            border-bottom: 1px solid #eee;
            cursor: pointer;
            transition: all 0.2s ease;
            background: white;
        }

        .session-item:hover {
            background: #f5f5f5;
            border-left: 4px solid #667eea;
            padding-left: 11px;
        }

        .session-item.active {
            background: #667eea;
            color: white;
            border-left: 4px solid #764ba2;
            padding-left: 11px;
        }

        .session-title {
            font-weight: 600;
            margin-bottom: 5px;
            font-size: 14px;
        }

        .session-meta {
            font-size: 12px;
            opacity: 0.7;
            margin: 2px 0;
        }

        .session-item.active .session-meta {
            opacity: 0.9;
        }

        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            margin-top: 5px;
        }

        .status-active {
            background: #d4edda;
            color: #155724;
        }

        .status-active.active {
            background: rgba(255, 255, 255, 0.3);
            color: white;
        }

        .status-completed {
            background: #d1ecf1;
            color: #0c5460;
        }

        .status-completed.active {
            background: rgba(255, 255, 255, 0.3);
            color: white;
        }

        .details-panel {
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .details-header {
            background: #333;
            color: white;
            padding: 20px;
            border-bottom: 2px solid #667eea;
        }

        .details-header h2 {
            font-size: 20px;
            margin-bottom: 5px;
        }

        .details-header p {
            font-size: 14px;
            opacity: 0.8;
        }

        .details-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }

        .no-selection {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #999;
            font-size: 16px;
        }

        .session-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            font-size: 14px;
        }

        .info-label {
            font-weight: 600;
            color: #333;
        }

        .info-value {
            color: #666;
        }

        .case-stem {
            background: white;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid #ddd;
            font-size: 14px;
            line-height: 1.6;
            max-height: 200px;
            overflow-y: auto;
        }

        .turns-section h3 {
            font-size: 16px;
            font-weight: 600;
            margin: 20px 0 15px;
            color: #333;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }

        .turn-card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 6px;
            margin-bottom: 15px;
            overflow: hidden;
        }

        .turn-header {
            background: #f0f0f0;
            padding: 12px 15px;
            border-bottom: 1px solid #ddd;
            font-weight: 600;
            color: #333;
            font-size: 13px;
        }

        .turn-body {
            padding: 15px;
        }

        .turn-field {
            margin-bottom: 12px;
        }

        .turn-label {
            font-weight: 600;
            color: #555;
            font-size: 12px;
            text-transform: uppercase;
            margin-bottom: 5px;
        }

        .turn-text {
            color: #333;
            font-size: 13px;
            line-height: 1.5;
            padding: 8px;
            background: #f9f9f9;
            border-radius: 4px;
            border-left: 3px solid #667eea;
        }

        .quality-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            margin-top: 5px;
        }

        .quality-normal {
            background: #e3f2fd;
            color: #1976d2;
        }

        .quality-low_confidence {
            background: #fff3e0;
            color: #f57c00;
        }

        .points-list {
            font-size: 13px;
            color: #333;
            padding-left: 20px;
        }

        .points-list li {
            margin: 4px 0;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: #999;
        }

        .error {
            background: #f8d7da;
            color: #721c24;
            padding: 12px;
            border-radius: 4px;
            margin: 10px 0;
            border: 1px solid #f5c6cb;
        }

        @media (max-width: 768px) {
            .container {
                grid-template-columns: 1fr;
            }

            .sessions-panel {
                max-height: 300px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="sessions-panel">
            <div class="panel-header">Sessions</div>
            <div class="sessions-list" id="sessionsList"></div>
        </div>

        <div class="details-panel">
            <div class="details-header">
                <h2 id="detailsTitle">Select a session to view details</h2>
                <p id="detailsSubtitle"></p>
            </div>
            <div class="details-content" id="detailsContent">
                <div class="no-selection">Select a session from the left to view its turns</div>
            </div>
        </div>
    </div>

    <script>
        // Parse SDK initialization - update with your Parse server URL and app ID
        // Parse.initialize('YOUR_APP_ID');
        // Parse.serverURL = 'https://your-parse-server.com/parse';

        let allSessions = [];
        let currentSessionId = null;

        async function loadSessions() {
            try {
                const result = await Parse.Cloud.run('getOralExamSessions', {});
                allSessions = result;
                renderSessionsList();
            } catch (error) {
                console.error('Error loading sessions:', error);
                showError('Failed to load sessions: ' + error.message);
            }
        }

        function renderSessionsList() {
            const list = document.getElementById('sessionsList');
            if (allSessions.length === 0) {
                list.innerHTML = '<div class="no-selection">No sessions found</div>';
                return;
            }

            list.innerHTML = allSessions.map(session => \`
                <div class="session-item \${session.id === currentSessionId ? 'active' : ''}" 
                     onclick="selectSession('\${session.id}')">
                    <div class="session-title">\${session.caseTitle}</div>
                    <div class="session-meta">ID: \${session.id.substring(0, 8)}...</div>
                    <div class="session-meta">Status: \${session.status}</div>
                    <div class="session-meta">Turns: \${session.turnCount}</div>
                    <div class="status-badge status-\${session.status} \${session.id === currentSessionId ? 'active' : ''}">\${session.status}</div>
                </div>
            \`).join('');
        }

        async function selectSession(sessionId) {
            currentSessionId = sessionId;
            renderSessionsList();

            try {
                const detail = await Parse.Cloud.run('getSessionDetail', { sessionId });
                renderSessionDetails(detail);
            } catch (error) {
                console.error('Error loading session detail:', error);
                showError('Failed to load session details: ' + error.message);
            }
        }

        function renderSessionDetails(detail) {
            const { session, turns } = detail;

            const header = document.querySelector('.details-header');
            header.innerHTML = \`
                <h2>\${session.caseTitle}</h2>
                <p>Session ID: \${session.id}</p>
            \`;

            let content = \`
                <div class="session-info">
                    <div class="info-row">
                        <span class="info-label">Status:</span>
                        <span class="info-value">\${session.status}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Total Turns:</span>
                        <span class="info-value">\${session.turnCount}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Covered Points:</span>
                        <span class="info-value">\${session.coveredPoints.length}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Major Errors:</span>
                        <span class="info-value">\${session.majorErrors.length}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Minor Errors:</span>
                        <span class="info-value">\${session.minorErrors.length}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Created:</span>
                        <span class="info-value">\${new Date(session.createdAt).toLocaleString()}</span>
                    </div>
                </div>
            \`;

            if (session.caseStem) {
                content += \`
                    <div class="case-stem">
                        <strong>Case Stem:</strong><br>\${session.caseStem}
                    </div>
                \`;
            }

            if (turns.length > 0) {
                content += '<div class="turns-section"><h3>Exam Turns (\${turns.length})</h3>';
                content += turns.map(turn => \`
                    <div class="turn-card">
                        <div class="turn-header">Turn \${turn.turnIndex + 1}</div>
                        <div class="turn-body">
                            <div class="turn-field">
                                <div class="turn-label">Examiner Prompt</div>
                                <div class="turn-text">\${turn.examinerPrompt || 'N/A'}</div>
                            </div>
                            <div class="turn-field">
                                <div class="turn-label">Candidate Response</div>
                                <div class="turn-text">\${turn.candidateResponse || 'N/A'}</div>
                            </div>
                            <div class="turn-field">
                                <div class="turn-label">Summary</div>
                                <div class="turn-text">\${turn.aiSummary || 'N/A'}</div>
                            </div>
                            \${turn.responseQuality !== 'normal' ? \`<div class="quality-badge quality-\${turn.responseQuality}">\${turn.responseQuality}</div>\` : ''}
                        </div>
                    </div>
                \`).join('');
                content += '</div>';
            } else {
                content += '<p style="padding: 20px; color: #999;">No turns recorded for this session.</p>';
            }

            document.getElementById('detailsContent').innerHTML = content;
        }

        function showError(message) {
            const content = document.getElementById('detailsContent');
            content.innerHTML = \`<div class="error">\${message}</div>\`;
        }

        // Load sessions on page load
        window.addEventListener('load', loadSessions);
    </script>
</body>
</html>
  \`;
}

module.exports = {
  getVisualizationHTML,
};
