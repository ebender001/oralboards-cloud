const { openai, OPENAI_MODEL } = require('./config');
const { requireString, getRandomCase, recordServedCase, getSessionWithCase, getTurns, deleteTurnsForSession, mergeUnique } = require('./utils');
const { buildScoringCatalog, normalizeModelItems, detectConceptMentions } = require('./scoring');
const { buildPrompt, PROMPT_VERSION } = require('./promptBuilder');
const { savePromptDiagnostic } = require('./promptDiagnostics');

const SHORT_CLINICAL_TERMS = new Set([
  "abg",
  "aaa",
  "airway",
  "antibiotics",
  "blood",
  "bp",
  "cbc",
  "cpr",
  "ct",
  "dvt",
  "ecmo",
  "ekg",
  "exam",
  "fluids",
  "iv",
  "labs",
  "mi",
  "mri",
  "npo",
  "o2",
  "or",
  "oxygen",
  "pe",
  "resuscitate",
  "rsi",
  "scan",
  "stable",
  "stabilize",
  "trauma",
  "tube",
  "xray"
]);

const KEYBOARD_GIBBERISH_PATTERNS = [
  "asdf",
  "asdfasdf",
  "qwer",
  "qwerty",
  "zxcv",
  "hjkl",
  "wasd"
];

function hasClinicalSignal(text) {
  const words = text.match(/[a-z0-9]+/g) || [];
  return words.some((word) => SHORT_CLINICAL_TERMS.has(word));
}

function isLowConfidenceResponse(text) {
  if (typeof text !== "string") {
    return true;
  }

  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return true;
  }

  const compact = normalized.replace(/\s+/g, "");
  const alphaCount = (compact.match(/[a-z]/g) || []).length;
  const symbolOrNumberCount = (compact.match(/[^a-z]/g) || []).length;
  const alphaRatio = compact.length > 0 ? alphaCount / compact.length : 0;
  const symbolOrNumberRatio = compact.length > 0 ? symbolOrNumberCount / compact.length : 0;

  if (compact.length >= 4 && /^(.)(\1)+$/.test(compact)) {
    return true;
  }

  if (compact.length >= 3 && alphaRatio < 0.25) {
    return true;
  }

  if (compact.length >= 3 && symbolOrNumberRatio > 0.7 && !hasClinicalSignal(normalized)) {
    return true;
  }

  if (KEYBOARD_GIBBERISH_PATTERNS.includes(compact)) {
    return true;
  }

  if (
    KEYBOARD_GIBBERISH_PATTERNS.some((pattern) => (
      compact.length >= pattern.length * 2 &&
      compact === pattern.repeat(Math.floor(compact.length / pattern.length))
    ))
  ) {
    return true;
  }

  const repeatedChunk = compact.match(/^([a-z]{2,6})\1+$/);
  if (repeatedChunk && !SHORT_CLINICAL_TERMS.has(repeatedChunk[1])) {
    return true;
  }

  const words = normalized.match(/[a-z0-9]+/g) || [];
  const uniqueWords = new Set(words);
  if (
    words.length >= 2 &&
    uniqueWords.size === 1 &&
    compact.length >= 6 &&
    !hasClinicalSignal(normalized)
  ) {
    return true;
  }

  if (
    words.length === 1 &&
    compact.length <= 4 &&
    !hasClinicalSignal(normalized)
  ) {
    return true;
  }

  return false;
}

function safeStringArray(value) {
  return Array.isArray(value) ? value : [];
}

Parse.Cloud.define("startOralCase", async (request) => {
  const caseId = request.params.caseId;
  const clientInstanceId = typeof request.params.clientInstanceId === "string"
    ? request.params.clientInstanceId.trim()
    : "";
  const selectedSpecialty = request.params.specialty;
  const normalizedSelectedSpecialty = typeof selectedSpecialty === "string"
    ? selectedSpecialty.trim()
    : selectedSpecialty;
  const caseDomain = request.params.caseDomain || null;
  const normalizedCaseDomain = typeof caseDomain === "string"
    ? caseDomain.trim()
    : caseDomain;
  const requiredMustCoverPoints = request.params.requiredMustCoverPoints;
  const allowedMajorErrors = request.params.allowedMajorErrors;
  const allowedMinorErrors = request.params.allowedMinorErrors;
  const maxTurnsOverride = request.params.maxTurns;
  let oralCase;
  let caseSelectionSource;

  if (caseId) {
    caseSelectionSource = "caseId";
    const query = new Parse.Query("OralCase");
    if (
      typeof normalizedSelectedSpecialty === "string" &&
      normalizedSelectedSpecialty.length > 0
    ) {
      query.equalTo("specialty", normalizedSelectedSpecialty);
    }
    if (normalizedCaseDomain) {
      query.equalTo("caseDomain", normalizedCaseDomain);
    }
    oralCase = await query.get(caseId, { useMasterKey: true });

    console.log("*****START ORAL CASE BY CASE ID:", {
      requestedCaseId: caseId,
      clientInstanceId,
      selectedSpecialty: normalizedSelectedSpecialty,
      caseDomain: normalizedCaseDomain || "nil",
      caseSpecialty: oralCase.get("specialty"),
      returnedCaseDomain: oralCase.get("caseDomain"),
      caseTitle: oralCase.get("title"),
    });

    if (
      typeof normalizedSelectedSpecialty === "string" &&
      normalizedSelectedSpecialty.length > 0 &&
      oralCase.get("specialty") !== normalizedSelectedSpecialty
    ) {
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        "Selected case does not match requested specialty"
      );
    }

    if (normalizedCaseDomain && oralCase.get("caseDomain") !== normalizedCaseDomain) {
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        "Selected case does not match requested case domain"
      );
    }

    await recordServedCase(clientInstanceId, normalizedSelectedSpecialty || oralCase.get("specialty"), oralCase);
  } else {
    console.log("*****START ORAL CASE RANDOM:", {
      clientInstanceId,
      selectedSpecialty: normalizedSelectedSpecialty,
      caseDomain: normalizedCaseDomain || "nil",
    });
    caseSelectionSource = "random";
    oralCase = await getRandomCase(normalizedSelectedSpecialty, clientInstanceId, normalizedCaseDomain);
  }

  const caseSpecialty = oralCase.get("specialty");
  if (
    typeof normalizedSelectedSpecialty === "string" &&
    normalizedSelectedSpecialty.length > 0 &&
    caseSpecialty !== normalizedSelectedSpecialty
  ) {
    console.error("*****START ORAL CASE SPECIALTY MISMATCH:", {
      requestedSpecialty: normalizedSelectedSpecialty,
      requestedCaseDomain: normalizedCaseDomain || "nil",
      returnedCaseSpecialty: caseSpecialty,
      returnedCaseId: oralCase.get("caseId") || oralCase.id,
      returnedCaseTitle: oralCase.get("title"),
      returnedCaseDomain: oralCase.get("caseDomain"),
    });

    throw new Parse.Error(
      Parse.Error.INVALID_QUERY,
      "Selected case does not match requested specialty"
    );
  }

  console.log("*****START ORAL CASE SELECTED CASE:", {
    operativeRequired: oralCase.get("operativeRequired") === true,
    operativeTechniquePointCount: safeStringArray(oralCase.get("operativeTechniquePoints")).length,
    requestedSpecialty: normalizedSelectedSpecialty,
    requestedCaseDomain: normalizedCaseDomain || "nil",
    clientInstanceId,
    returnedCaseSpecialty: caseSpecialty,
    returnedCaseId: oralCase.get("caseId") || oralCase.id,
    returnedCaseTitle: oralCase.get("title"),
    returnedCaseDomain: oralCase.get("caseDomain"),
  });

  const operativeRequired = oralCase.get("operativeRequired") === true;
  const operativeTechniquePoints = safeStringArray(oralCase.get("operativeTechniquePoints"));

  const session = new Parse.Object("OralExamSession");
  session.set("case", oralCase);
  session.set("status", "active");
  session.set("currentExaminerPrompt", oralCase.get("firstQuestion"));
  session.set("turnCount", 0);
  session.set("coveredPoints", []);
  session.set("majorErrors", []);
  session.set("minorErrors", []);
  session.set("completionReason", "");
  session.set("operativeRequired", operativeRequired);
  session.set("operativeTechniquePoints", operativeTechniquePoints);

  if (clientInstanceId) {
    session.set("clientInstanceId", clientInstanceId);
  }
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
    clientInstanceId: clientInstanceId || undefined,
    requestedSpecialty: normalizedSelectedSpecialty,
    specialty: caseSpecialty,
    caseSelectionSource,
    usedRandomCase: caseSelectionSource === "random",
    maxTurns: (typeof maxTurnsOverride === "number") ? maxTurnsOverride : (oralCase.get("maxTurns") || 6),
  };
});

Parse.Cloud.define("submitOralResponse", async (request) => {
  const sessionId = requireString(request.params, "sessionId");
  const responseText = requireString(request.params, "responseText");
  const responseQuality = isLowConfidenceResponse(responseText) ? "low_confidence" : null;

  const session = await getSessionWithCase(sessionId);
  const oralCase = session.get("case");
  const priorTurns = await getTurns(session);
  const currentExaminerPrompt = session.get("currentExaminerPrompt");

  console.log("submitOralResponse sessionId:", sessionId);
  console.log("submitOralResponse turnCount:", priorTurns.length);
  console.log("submitOralResponse currentExaminerPrompt:", currentExaminerPrompt);
  console.log("submitOralResponse candidateResponse:", responseText);
  console.log("submitOralResponse responseQuality:", responseQuality || "normal");
  const maxTurns = session.get("maxTurnsOverride") || oralCase.get("maxTurns") || 6;
  const reachedMaxTurns = priorTurns.length + 1 >= maxTurns;
  console.log("submitOralResponse maxTurns:", maxTurns);

  if (responseQuality === "low_confidence") {
    const nextExaminerPrompt = "I'm not sure I understood your response. Please walk me through your assessment and management plan.";
    const briefEvaluation = "The response could not be interpreted as clinical reasoning.";
    const pointEvidence = [];
    const majorErrorEvidence = [];
    const minorErrorEvidence = [];
    const missedConcepts = [];
    const examinerWasLookingFor = [];
    const coveredPoints = session.get("coveredPoints") || [];
    const majorErrors = session.get("majorErrors") || [];
    const minorErrors = session.get("minorErrors") || [];
    const completionReason = session.get("completionReason") || "";

    const turn = new Parse.Object("OralExamTurn");
    turn.set("session", session);
    turn.set("turnIndex", priorTurns.length);
    turn.set("examinerPrompt", currentExaminerPrompt);
    turn.set("candidateResponse", responseText);
    turn.set("nextExaminerPrompt", nextExaminerPrompt);
    turn.set("aiSummary", briefEvaluation);
    turn.set("newlyCoveredPoints", []);
    turn.set("newMajorErrors", []);
    turn.set("newMinorErrors", []);
    turn.set("pointEvidence", pointEvidence);
    turn.set("majorErrorEvidence", majorErrorEvidence);
    turn.set("minorErrorEvidence", minorErrorEvidence);
    turn.set("missedConcepts", missedConcepts);
    turn.set("examinerWasLookingFor", examinerWasLookingFor);
    turn.set("completionReason", "");
    turn.set("responseQuality", responseQuality);
    await turn.save(null, { useMasterKey: true });

    session.set("currentExaminerPrompt", nextExaminerPrompt);
    session.set("turnCount", priorTurns.length + 1);
    session.set("completionReason", completionReason);

    await session.save(null, { useMasterKey: true });

    return {
      nextExaminerPrompt,
      briefEvaluation,
      pointEvidence,
      majorErrorEvidence,
      minorErrorEvidence,
      missedConcepts,
      examinerWasLookingFor,
      isCaseComplete: false,
      completionReason,
      coveredPoints,
      majorErrors,
      minorErrors,
      maxTurns,
      responseQuality
    };
  }

  const requiredMustCoverPoints = session.get("requiredMustCoverPoints") ?? (oralCase.get("mustCoverPoints") || []).length;
  const allowedMajorErrors = session.get("allowedMajorErrors") ?? 0;
  const allowedMinorErrors = session.get("allowedMinorErrors") ?? 2;
  const operativeRequired = session.get("operativeRequired") === true || oralCase.get("operativeRequired") === true;
  const operativeTechniquePoints = safeStringArray(
    session.get("operativeTechniquePoints") || oralCase.get("operativeTechniquePoints") || []
  );
  const scoringCatalog = buildScoringCatalog(oralCase);

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
      allowedMinorErrors: session.get("allowedMinorErrors"),
      operativeRequired,
      operativeTechniquePoints
    }
  });

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
            missed_concepts: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string" },
                  severity: { type: "string", enum: ["major", "minor"] },
                  missed_concept: { type: "string" }
                },
                required: ["label", "severity", "missed_concept"]
              }
            },
            examiner_was_looking_for: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string" },
                  severity: { type: "string", enum: ["major", "minor"] },
                  explanation: { type: "string" }
                },
                required: ["label", "severity", "explanation"]
              }
            },
            prompt_diagnostic: {
              type: "object",
              additionalProperties: false,
              properties: {
                likely_prompt_issue: { type: "boolean" },
                issue_type: { type: "string" },
                suggested_prompt_adjustment: { type: "string" }
              },
              required: [
                "likely_prompt_issue",
                "issue_type",
                "suggested_prompt_adjustment"
              ]
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
            "missed_concepts",
            "examiner_was_looking_for",
            "prompt_diagnostic",
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

  const pointEvidence = parsed.point_evidence || [];
  const majorErrorEvidence = parsed.major_error_evidence || [];
  const minorErrorEvidence = parsed.minor_error_evidence || [];
  const missedConcepts = parsed.missed_concepts || [];
  const examinerWasLookingFor = parsed.examiner_was_looking_for || [];

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
  turn.set("pointEvidence", pointEvidence);
  turn.set("majorErrorEvidence", majorErrorEvidence);
  turn.set("minorErrorEvidence", minorErrorEvidence);
  turn.set("missedConcepts", missedConcepts);
  turn.set("examinerWasLookingFor", examinerWasLookingFor);
  turn.set("completionReason", parsed.completion_reason || "");
  await turn.save(null, { useMasterKey: true });

  await savePromptDiagnostic({
    session,
    oralCase,
    turnIndex: priorTurns.length,
    candidateResponse: responseText,
    examinerPrompt: currentExaminerPrompt,
    nextExaminerPrompt: parsed.next_examiner_prompt,
    briefEvaluation: parsed.brief_evaluation,
    promptDiagnostic: parsed.prompt_diagnostic,
    promptVersion: PROMPT_VERSION
  });

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

  if (!finalIsCaseComplete && hasEnoughCoveredPoints && !operativeRequired) {
    finalIsCaseComplete = true;
    finalCompletionReason = "required_key_points_covered";
  }

  if (!finalIsCaseComplete && reachedMaxTurns) {
    finalIsCaseComplete = true;
    finalCompletionReason = "max_turns_reached";
  }

  if (finalIsCaseComplete) {
    session.set("status", "completed");
    const existingCaseEndedAt = session.get("caseEndedAt");
    const caseEndedAt = existingCaseEndedAt instanceof Date ? existingCaseEndedAt : new Date();

    if (!existingCaseEndedAt) {
      session.set("caseEndedAt", caseEndedAt);
    }

    if (session.createdAt instanceof Date) {
      const durationSeconds = Math.max(
        0,
        Math.floor((caseEndedAt.getTime() - session.createdAt.getTime()) / 1000)
      );
      session.set("durationSeconds", durationSeconds);
    }
  }

  session.set("completionReason", finalCompletionReason);
  session.set("currentExaminerPrompt", parsed.next_examiner_prompt);
  session.set("turnCount", priorTurns.length + 1);

  await session.save(null, { useMasterKey: true });

  return {
    nextExaminerPrompt: parsed.next_examiner_prompt,
    briefEvaluation: parsed.brief_evaluation,
    pointEvidence,
    majorErrorEvidence,
    minorErrorEvidence,
    missedConcepts,
    examinerWasLookingFor,
    isCaseComplete: finalIsCaseComplete,
    completionReason: finalCompletionReason,
    coveredPoints,
    majorErrors,
    minorErrors,
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

module.exports = {};
