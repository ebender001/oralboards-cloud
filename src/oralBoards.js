//oralBoards.js
const OpenAI = require("openai");
const { buildPrompt } = require("./promptBuilder");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

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

async function getRandomCase() {
  const query = new Parse.Query("OralCase");
  query.equalTo("isActive", true);
  const cases = await query.find({ useMasterKey: true });

  if (!cases.length) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      "No active oral cases found"
    );
  }

  return cases[Math.floor(Math.random() * cases.length)];
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

// Delete all OralExamTurn rows for a session
async function deleteTurnsForSession(session) {
  const turnQuery = new Parse.Query("OralExamTurn");
  turnQuery.equalTo("session", session);
  const turns = await turnQuery.find({ useMasterKey: true });

  if (turns.length > 0) {
    await Parse.Object.destroyAll(turns, { useMasterKey: true });
  }

  return turns.length;
}

// Helper to merge unique array values
function mergeUnique(existing = [], incoming = []) {
  return [...new Set([...(existing || []), ...(incoming || [])])];
}

const STOP_WORDS = new Set([
  "a", "an", "the", "of", "and", "or", "to", "for", "with", "without",
  "in", "on", "at", "by", "from", "into", "over", "under", "after",
  "before", "during", "through", "via", "as", "is", "are", "be"
]);

const TOKEN_EQUIVALENTS = {
  esophageal: "esophagus",
  oesophageal: "esophagus",
  esophagus: "esophagus",
  perforated: "perforation",
  perforate: "perforation",
  ruptured: "rupture",
  ruptureds: "rupture",
  rupturing: "rupture",
  pulmonary: "lung",
  pulmonic: "lung",
  pleural: "pleura",
  gastric: "stomach",
  abdominal: "abdomen",
  thoracic: "chest",
  mediastinal: "mediastinum",
  septic: "sepsis",
  septicemia: "sepsis",
  haemorrhage: "hemorrhage",
  haemorrhagic: "hemorrhage",
  haemodynamic: "hemodynamic",
  haemodynamically: "hemodynamic"
};

function normalizeTextForScoring(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(token = "") {
  const cleaned = String(token).toLowerCase().trim();
  if (!cleaned) return "";

  const singular = cleaned.endsWith("s") && cleaned.length > 3
    ? cleaned.slice(0, -1)
    : cleaned;

  return TOKEN_EQUIVALENTS[singular] || singular;
}

function conceptTokens(text = "") {
  return normalizeTextForScoring(text)
    .split(" ")
    .map(normalizeToken)
    .filter((token) => token && !STOP_WORDS.has(token));
}

function uniqueConceptTokens(text = "") {
  return [...new Set(conceptTokens(text))];
}

function buildScoringCatalog(oralCase) {
  return {
    mustCoverPoints: oralCase.get("mustCoverPoints") || [],
    majorErrors: oralCase.get("criticalErrorsMajor") || [],
    minorErrors: oralCase.get("criticalErrorsMinor") || []
  };
}

function matchCanonicalLabel(rawItem, allowedLabels = []) {
  if (!rawItem || !allowedLabels.length) return null;

  const rawNormalized = normalizeTextForScoring(rawItem);
  const rawTokens = uniqueConceptTokens(rawItem);
  if (!rawTokens.length) return null;

  let bestLabel = null;
  let bestScore = 0;

  for (const label of allowedLabels) {
    const labelNormalized = normalizeTextForScoring(label);
    if (rawNormalized === labelNormalized) {
      return label;
    }

    const labelTokens = uniqueConceptTokens(label);
    if (!labelTokens.length) continue;

    const overlap = labelTokens.filter((token) => rawTokens.includes(token)).length;
    const score = overlap / labelTokens.length;

    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }

  return bestScore >= 0.75 ? bestLabel : null;
}

function normalizeModelItems(items = [], allowedLabels = []) {
  return (items || [])
    .map((item) => matchCanonicalLabel(item, allowedLabels))
    .filter(Boolean);
}

function detectConceptMentions(candidateResponse, allowedLabels = []) {
  const responseTokens = uniqueConceptTokens(candidateResponse);
  if (!responseTokens.length) return [];

  return allowedLabels.filter((label) => {
    const labelTokens = uniqueConceptTokens(label);
    if (!labelTokens.length) return false;

    return labelTokens.every((token) => responseTokens.includes(token));
  });
}

Parse.Cloud.define("startOralCase", async (request) => {
  const caseId = request.params.caseId;
  const requiredMustCoverPoints = request.params.requiredMustCoverPoints;
  const allowedMajorErrors = request.params.allowedMajorErrors;
  const allowedMinorErrors = request.params.allowedMinorErrors;
  const maxTurnsOverride = request.params.maxTurns;
  let oralCase;

  if (caseId) {
    const query = new Parse.Query("OralCase");
    oralCase = await query.get(caseId, { useMasterKey: true });
  } else {
    oralCase = await getRandomCase();
  }

  const session = new Parse.Object("OralExamSession");
  session.set("case", oralCase);
  session.set("status", "active");
  session.set("currentExaminerPrompt", oralCase.get("firstQuestion"));
  session.set("turnCount", 0);
  session.set("coveredPoints", []);
  session.set("majorErrors", []);
  session.set("minorErrors", []);
  session.set("completionReason", "");

  if (typeof requiredMustCoverPoints === "number") {
    session.set("requiredMustCoverPoints", requiredMustCoverPoints);
  }
  if (typeof allowedMajorErrors === "number") {
    session.set("allowedMajorErrors", allowedMajorErrors);
  }
  if (typeof allowedMinorErrors === "number") {
    session.set("allowedMinorErrors", allowedMinorErrors);
  }
  if (typeof maxTurnsOverride === "number") {
    session.set("maxTurnsOverride", maxTurnsOverride);
  }

  await session.save(null, { useMasterKey: true });

  return {
    sessionId: session.id,
    caseId: oralCase.get("caseId") || oralCase.id,
    caseTitle: oralCase.get("title"),
    caseStem: oralCase.get("stem"),
    examinerPrompt: oralCase.get("firstQuestion"),
    maxTurns: (typeof maxTurnsOverride === "number") ? maxTurnsOverride : (oralCase.get("maxTurns") || 6),
  };
});

Parse.Cloud.define("submitOralResponse", async (request) => {
  const sessionId = requireString(request.params, "sessionId");
  const responseText = requireString(request.params, "responseText");

  const session = await getSessionWithCase(sessionId);
  const oralCase = session.get("case");
  const priorTurns = await getTurns(session);
  const currentExaminerPrompt = session.get("currentExaminerPrompt");

  const prompt = buildPrompt({
    oralCase,
    currentExaminerPrompt,
    candidateResponse: responseText,
    priorTurns,
    session: {
      coveredPoints: session.get("coveredPoints") || [],
      majorErrors: session.get("majorErrors") || [],
      minorErrors: session.get("minorErrors") || [],
      turnCount: session.get("turnCount") || 0,
      maxTurnsOverride: session.get("maxTurnsOverride"),
      requiredMustCoverPoints: session.get("requiredMustCoverPoints"),
      allowedMajorErrors: session.get("allowedMajorErrors"),
      allowedMinorErrors: session.get("allowedMinorErrors")
    }
  });

  console.log("submitOralResponse sessionId:", sessionId);
  console.log("submitOralResponse turnCount:", priorTurns.length);
  console.log("submitOralResponse currentExaminerPrompt:", currentExaminerPrompt);
  console.log("submitOralResponse candidateResponse:", responseText);
  const maxTurns = session.get("maxTurnsOverride") || oralCase.get("maxTurns") || 6;
  const reachedMaxTurns = priorTurns.length + 1 >= maxTurns;
  console.log("submitOralResponse maxTurns:", maxTurns);

  const requiredMustCoverPoints = session.get("requiredMustCoverPoints") ?? (oralCase.get("mustCoverPoints") || []).length;
  const allowedMajorErrors = session.get("allowedMajorErrors") ?? 0;
  const allowedMinorErrors = session.get("allowedMinorErrors") ?? 2;
  const scoringCatalog = buildScoringCatalog(oralCase);

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input: prompt,
    temperature: 0.2,
    text: {
      format: {
        type: "json_schema",
        name: "oral_board_followup",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            next_examiner_prompt: { type: "string" },
            brief_evaluation: { type: "string" },
            newly_covered_points: {
              type: "array",
              items: { type: "string" }
            },
            new_major_errors: {
              type: "array",
              items: { type: "string" }
            },
            new_minor_errors: {
              type: "array",
              items: { type: "string" }
            },
            point_evidence: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string" },
                  evidence: { type: "string" }
                },
                required: ["label", "evidence"]
              }
            },
            major_error_evidence: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string" },
                  evidence: { type: "string" }
                },
                required: ["label", "evidence"]
              }
            },
            minor_error_evidence: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string" },
                  evidence: { type: "string" }
                },
                required: ["label", "evidence"]
              }
            },
            is_case_complete: { type: "boolean" },
            completion_reason: { type: "string" }
          },
          required: [
            "next_examiner_prompt",
            "brief_evaluation",
            "newly_covered_points",
            "new_major_errors",
            "new_minor_errors",
            "point_evidence",
            "major_error_evidence",
            "minor_error_evidence",
            "is_case_complete",
            "completion_reason"
          ]
        }
      }
    }
  });

  const outputText = response.output_text;
  console.log("OpenAI raw output_text:", outputText);

  if (!outputText) {
    console.error("OpenAI returned empty output_text", JSON.stringify(response));
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      "OpenAI returned no output_text"
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    console.error("JSON parse failed for outputText:", outputText);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      "Invalid JSON from OpenAI"
    );
  }

  console.log("Parsed AI response:", parsed);

  const normalizedCoveredFromModel = normalizeModelItems(
    parsed.newly_covered_points || [],
    scoringCatalog.mustCoverPoints
  );
  const deterministicallyCoveredPoints = detectConceptMentions(
    responseText,
    scoringCatalog.mustCoverPoints
  );
  const coveredPoints = mergeUnique(
    session.get("coveredPoints") || [],
    mergeUnique(normalizedCoveredFromModel, deterministicallyCoveredPoints)
  );

  const normalizedMajorErrors = normalizeModelItems(
    parsed.new_major_errors || [],
    scoringCatalog.majorErrors
  );
  const majorErrors = mergeUnique(
    session.get("majorErrors") || [],
    normalizedMajorErrors
  );

  const normalizedMinorErrors = normalizeModelItems(
    parsed.new_minor_errors || [],
    scoringCatalog.minorErrors
  );
  const minorErrors = mergeUnique(
    session.get("minorErrors") || [],
    normalizedMinorErrors
  );

  const hasEnoughCoveredPoints = coveredPoints.length >= requiredMustCoverPoints;
  const exceededMajorErrors = majorErrors.length > allowedMajorErrors;
  const exceededMinorErrors = minorErrors.length > allowedMinorErrors;

  const turn = new Parse.Object("OralExamTurn");
  turn.set("session", session);
  turn.set("turnIndex", priorTurns.length);
  turn.set("examinerPrompt", currentExaminerPrompt);
  turn.set("candidateResponse", responseText);
  turn.set("nextExaminerPrompt", parsed.next_examiner_prompt);
  turn.set("aiSummary", parsed.brief_evaluation);
  turn.set("newlyCoveredPoints", mergeUnique(normalizedCoveredFromModel, deterministicallyCoveredPoints));
  turn.set("newMajorErrors", normalizedMajorErrors);
  turn.set("newMinorErrors", normalizedMinorErrors);
  turn.set("pointEvidence", parsed.point_evidence || []);
  turn.set("majorErrorEvidence", parsed.major_error_evidence || []);
  turn.set("minorErrorEvidence", parsed.minor_error_evidence || []);
  turn.set("completionReason", parsed.completion_reason || "");
  await turn.save(null, { useMasterKey: true });

  session.set("coveredPoints", coveredPoints);
  session.set("majorErrors", majorErrors);
  session.set("minorErrors", minorErrors);

  let finalIsCaseComplete = parsed.is_case_complete;
  let finalCompletionReason = parsed.completion_reason || "";

  if (!finalIsCaseComplete && exceededMajorErrors) {
    finalIsCaseComplete = true;
    finalCompletionReason = "major_error_threshold_exceeded";
  }

  if (!finalIsCaseComplete && exceededMinorErrors) {
    finalIsCaseComplete = true;
    finalCompletionReason = "minor_error_threshold_exceeded";
  }

  if (!finalIsCaseComplete && hasEnoughCoveredPoints) {
    finalIsCaseComplete = true;
    finalCompletionReason = "required_key_points_covered";
  }

  if (!finalIsCaseComplete && reachedMaxTurns) {
    finalIsCaseComplete = true;
    finalCompletionReason = "max_turns_reached";
  }

  if (finalIsCaseComplete) {
    session.set("status", "completed");
  }

  session.set("completionReason", finalCompletionReason);
  session.set("currentExaminerPrompt", parsed.next_examiner_prompt);
  session.set("turnCount", priorTurns.length + 1);

  await session.save(null, { useMasterKey: true });

  return {
    nextExaminerPrompt: parsed.next_examiner_prompt,
    briefEvaluation: parsed.brief_evaluation,
    isCaseComplete: finalIsCaseComplete,
    completionReason: finalCompletionReason,
    coveredPoints,
    majorErrors,
    minorErrors,
    pointEvidence: parsed.point_evidence || [],
    majorErrorEvidence: parsed.major_error_evidence || [],
    minorErrorEvidence: parsed.minor_error_evidence || [],
    maxTurns
  };
});

// Cloud Function to abort a started case by deleting its OralExamTurn rows and the OralExamSession row
Parse.Cloud.define("abortOralCase", async (request) => {
  const sessionId = requireString(request.params, "sessionId");

  const session = await getSessionWithCase(sessionId);
  const deletedTurnCount = await deleteTurnsForSession(session);

  await session.destroy({ useMasterKey: true });

  return {
    success: true,
    sessionId,
    deletedTurnCount
  };
});
