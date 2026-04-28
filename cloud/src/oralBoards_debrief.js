// oralBoards_debrief.js
//
// Companion cloud code for oralBoards_3.js
// Returns a completed-session debrief with points/errors aligned to turns.

function requireString(params, key) {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      `Missing or invalid parameter: ${key}`
    );
  }
  return value.trim();
}

async function getSessionWithCase(sessionId) {
  const query = new Parse.Query("OralExamSession");
  query.include("case");
  return await query.get(sessionId, { useMasterKey: true });
}

async function getTurns(session) {
  const turnQuery = new Parse.Query("OralExamTurn");
  turnQuery.equalTo("session", session);
  turnQuery.ascending("turnIndex");
  return await turnQuery.find({ useMasterKey: true });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildThresholds(session, oralCase) {
  const mustCoverPoints = safeArray(oralCase.get("mustCoverPoints"));
  const majorCriticalErrors = safeArray(oralCase.get("criticalErrorsMajor"));
  const minorCriticalErrors = safeArray(oralCase.get("criticalErrorsMinor"));

  return {
    requiredMustCoverPoints:
      typeof session.get("requiredMustCoverPoints") === "number"
        ? session.get("requiredMustCoverPoints")
        : mustCoverPoints.length,
    allowedMajorErrors:
      typeof session.get("allowedMajorErrors") === "number"
        ? session.get("allowedMajorErrors")
        : 0,
    allowedMinorErrors:
      typeof session.get("allowedMinorErrors") === "number"
        ? session.get("allowedMinorErrors")
        : minorCriticalErrors.length,
    maxTurns:
      session.get("maxTurnsOverride") || oralCase.get("maxTurns") || 6
  };
}

function buildPointDefinitions(oralCase) {
  const mustCoverPoints = safeArray(oralCase.get("mustCoverPoints"));
  const completionCriteria = safeArray(oralCase.get("completionCriteria"));

  const definitions = [];

  mustCoverPoints.forEach((text, index) => {
    definitions.push({
      code: `must_cover_${index + 1}`,
      title: text,
      detail: text,
      kind: "mustCoverPoint",
      isMustCover: true
    });
  });

  completionCriteria.forEach((text, index) => {
    definitions.push({
      code: `completion_${index + 1}`,
      title: text,
      detail: text,
      kind: "completionCriterion",
      isMustCover: false
    });
  });

  return definitions;
}

function buildErrorDefinitions(oralCase) {
  const majorErrors = safeArray(oralCase.get("criticalErrorsMajor"));
  const minorErrors = safeArray(oralCase.get("criticalErrorsMinor"));

  const definitions = [];

  majorErrors.forEach((text, index) => {
    definitions.push({
      code: `major_error_${index + 1}`,
      title: text,
      detail: text,
      severity: "major"
    });
  });

  minorErrors.forEach((text, index) => {
    definitions.push({
      code: `minor_error_${index + 1}`,
      title: text,
      detail: text,
      severity: "minor"
    });
  });

  return definitions;
}

function normalizeText(text) {
  return String(text || "").trim().toLowerCase();
}

function lookupDefinitionCode(definitions, text, fallbackPrefix) {
  const normalized = normalizeText(text);
  const match = definitions.find(
    (item) => normalizeText(item.title) === normalized || normalizeText(item.detail) === normalized
  );

  if (match) return match.code;

  return `${fallbackPrefix}_${normalized
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "item"}`;
}

function buildEvaluationEvents(turns, pointDefinitions, errorDefinitions) {
  const events = [];

  for (const turn of turns) {
    const turnIndex = turn.get("turnIndex");
    const aiSummary = turn.get("aiSummary") || "";

    const newlyCoveredPoints = safeArray(turn.get("newlyCoveredPoints"));
    const newMajorErrors = safeArray(turn.get("newMajorErrors"));
    const newMinorErrors = safeArray(turn.get("newMinorErrors"));

    newlyCoveredPoints.forEach((pointText) => {
      events.push({
        turnIndex,
        turnId: turn.id,
        kind: "mustCoverPoint",
        pointCode: lookupDefinitionCode(pointDefinitions, pointText, "point"),
        coverageStatus: "covered",
        explanation: aiSummary || `Point covered: ${pointText}`,
        coachingText: null,
        isDecisive: false
      });
    });

    newMajorErrors.forEach((errorText) => {
      events.push({
        turnIndex,
        turnId: turn.id,
        kind: "error",
        severity: "major",
        errorCode: lookupDefinitionCode(errorDefinitions, errorText, "major_error"),
        explanation: aiSummary || `Major error identified: ${errorText}`,
        coachingText: null,
        isDecisive: true
      });
    });

    newMinorErrors.forEach((errorText) => {
      events.push({
        turnIndex,
        turnId: turn.id,
        kind: "error",
        severity: "minor",
        errorCode: lookupDefinitionCode(errorDefinitions, errorText, "minor_error"),
        explanation: aiSummary || `Minor error identified: ${errorText}`,
        coachingText: null,
        isDecisive: false
      });
    });

    const completionReason = (turn.get("completionReason") || "").trim();
    if (completionReason) {
      events.push({
        turnIndex,
        turnId: turn.id,
        kind: "caseStatus",
        status: completionReason,
        explanation: `Completion reason recorded at this turn: ${completionReason}`,
        coachingText: null,
        isDecisive: true
      });
    }
  }

  return events.sort((a, b) => {
    if (a.turnIndex !== b.turnIndex) return a.turnIndex - b.turnIndex;
    return String(a.kind).localeCompare(String(b.kind));
  });
}

function buildTurnPayloads(turns) {
  return turns.map((turn) => ({
    id: turn.id,
    turnIndex: turn.get("turnIndex"),
    examinerPrompt: turn.get("examinerPrompt") || "",
    candidateResponse: turn.get("candidateResponse") || "",
    nextExaminerPrompt: turn.get("nextExaminerPrompt") || "",
    aiSummary: turn.get("aiSummary") || "",
    completionReason: turn.get("completionReason") || "",
    newlyCoveredPoints: safeArray(turn.get("newlyCoveredPoints")),
    newMajorErrors: safeArray(turn.get("newMajorErrors")),
    newMinorErrors: safeArray(turn.get("newMinorErrors"))
  }));
}

function buildPerformanceSummary(session, oralCase, thresholds) {
  const coveredPoints = safeArray(session.get("coveredPoints"));
  const majorErrors = safeArray(session.get("majorErrors"));
  const minorErrors = safeArray(session.get("minorErrors"));
  const completionReason = session.get("completionReason") || "";
  const mustCoverCatalog = safeArray(oralCase.get("mustCoverPoints"));

  const mustCoverPointsCovered = coveredPoints.filter((point) =>
    mustCoverCatalog.some(
      (catalogPoint) => normalizeText(catalogPoint) === normalizeText(point)
    )
  ).length;

  const totalMajorErrors = majorErrors.length;
  const totalMinorErrors = minorErrors.length;

  const failureReasons = [];

  if (mustCoverPointsCovered < thresholds.requiredMustCoverPoints) {
    failureReasons.push("insufficient_must_cover_points");
  }
  if (totalMajorErrors > thresholds.allowedMajorErrors) {
    failureReasons.push("major_error_threshold_exceeded");
  }
  if (totalMinorErrors > thresholds.allowedMinorErrors) {
    failureReasons.push("minor_error_threshold_exceeded");
  }
  if (completionReason) {
    failureReasons.push(completionReason);
  }

  const passed =
    totalMajorErrors <= thresholds.allowedMajorErrors &&
    totalMinorErrors <= thresholds.allowedMinorErrors &&
    mustCoverPointsCovered >= thresholds.requiredMustCoverPoints &&
    completionReason !== "major_error" &&
    completionReason !== "major_error_threshold_exceeded";

  return {
    mustCoverPointsRequired: thresholds.requiredMustCoverPoints,
    mustCoverPointsCovered,
    totalMajorErrors,
    totalMinorErrors,
    passed,
    outcome: passed ? "passed" : "failed",
    failureReasons: [...new Set(failureReasons)]
  };
}

function buildTurnAlignment(turns, evaluationEvents) {
  return turns.map((turn) => ({
    turnId: turn.id,
    turnIndex: turn.get("turnIndex"),
    examinerPrompt: turn.get("examinerPrompt") || "",
    candidateResponse: turn.get("candidateResponse") || "",
    aiSummary: turn.get("aiSummary") || "",
    completionReason: turn.get("completionReason") || "",
    events: evaluationEvents.filter((event) => event.turnId === turn.id)
  }));
}

Parse.Cloud.define("downloadOralCaseDebrief", async (request) => {
  const sessionId = requireString(request.params, "sessionId");

  const session = await getSessionWithCase(sessionId);
  const oralCase = session.get("case");

  if (!oralCase) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      "Session has no associated oral case"
    );
  }

  const turns = await getTurns(session);

  const pointDefinitions = buildPointDefinitions(oralCase);
  const errorDefinitions = buildErrorDefinitions(oralCase);
  const thresholds = buildThresholds(session, oralCase);
  const evaluationEvents = buildEvaluationEvents(
    turns,
    pointDefinitions,
    errorDefinitions
  );
  const performanceSummary = buildPerformanceSummary(
    session,
    oralCase,
    thresholds
  );
  const turnAlignment = buildTurnAlignment(turns, evaluationEvents);

  return {
    sessionId: session.id,
    status: session.get("status") || "unknown",
    completionReason: session.get("completionReason") || "",
    case: {
      id: oralCase.id,
      title: oralCase.get("title") || "",
      specialty: oralCase.get("specialty") || "",
      stem: oralCase.get("stem") || ""
    },
    thresholds,
    pointDefinitions,
    errorDefinitions,
    turns: buildTurnPayloads(turns),
    evaluationEvents,
    turnAlignment,
    aggregate: {
      coveredPoints: safeArray(session.get("coveredPoints")),
      majorErrors: safeArray(session.get("majorErrors")),
      minorErrors: safeArray(session.get("minorErrors")),
      turnCount: session.get("turnCount") || turns.length
    },
    performanceSummary
  };
});