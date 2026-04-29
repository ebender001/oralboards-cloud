const { openai, OPENAI_MODEL } = require('./config');
const { requireString, getRandomCase, recordServedCase, getSessionWithCase, getTurns, deleteTurnsForSession, mergeUnique } = require('./utils');
const { buildScoringCatalog, normalizeModelItems, detectConceptMentions } = require('./scoring');
const { buildPrompt } = require('./promptBuilder');

Parse.Cloud.define("startOralCase", async (request) => {
  const caseId = request.params.caseId;
  const clientInstanceId = typeof request.params.clientInstanceId === "string"
    ? request.params.clientInstanceId.trim()
    : "";
  const selectedSpecialty = request.params.specialty;
  const normalizedSelectedSpecialty = typeof selectedSpecialty === "string"
    ? selectedSpecialty.trim()
    : selectedSpecialty;
  const requiredMustCoverPoints = request.params.requiredMustCoverPoints;
  const allowedMajorErrors = request.params.allowedMajorErrors;
  const allowedMinorErrors = request.params.allowedMinorErrors;
  const maxTurnsOverride = request.params.maxTurns;
  let oralCase;
  let caseSelectionSource;

  if (caseId) {
    caseSelectionSource = "caseId";
    const query = new Parse.Query("OralCase");
    oralCase = await query.get(caseId, { useMasterKey: true });

    console.log("*****START ORAL CASE BY CASE ID:", {
      requestedCaseId: caseId,
      clientInstanceId,
      selectedSpecialty: normalizedSelectedSpecialty,
      caseSpecialty: oralCase.get("specialty"),
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

    await recordServedCase(clientInstanceId, normalizedSelectedSpecialty || oralCase.get("specialty"), oralCase);
  } else {
    console.log("*****START ORAL CASE RANDOM:", {
      clientInstanceId,
      selectedSpecialty: normalizedSelectedSpecialty,
    });
    caseSelectionSource = "random";
    oralCase = await getRandomCase(normalizedSelectedSpecialty, clientInstanceId);
  }

  const caseSpecialty = oralCase.get("specialty");
  if (
    typeof normalizedSelectedSpecialty === "string" &&
    normalizedSelectedSpecialty.length > 0 &&
    caseSpecialty !== normalizedSelectedSpecialty
  ) {
    console.error("*****START ORAL CASE SPECIALTY MISMATCH:", {
      requestedSpecialty: normalizedSelectedSpecialty,
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
    requestedSpecialty: normalizedSelectedSpecialty,
    clientInstanceId,
    returnedCaseSpecialty: caseSpecialty,
    returnedCaseId: oralCase.get("caseId") || oralCase.id,
    returnedCaseTitle: oralCase.get("title"),
    returnedCaseDomain: oralCase.get("caseDomain"),
  });

  const session = new Parse.Object("OralExamSession");
  session.set("case", oralCase);
  session.set("status", "active");
  session.set("currentExaminerPrompt", oralCase.get("firstQuestion"));
  session.set("turnCount", 0);
  session.set("coveredPoints", []);
  session.set("majorErrors", []);
  session.set("minorErrors", []);
  session.set("completionReason", "");

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

  const pointEvidence = parsed.point_evidence || [];
  const majorErrorEvidence = parsed.major_error_evidence || [];
  const minorErrorEvidence = parsed.minor_error_evidence || [];

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
    pointEvidence: parsed.point_evidence || [],
    majorErrorEvidence: parsed.major_error_evidence || [],
    minorErrorEvidence: parsed.minor_error_evidence || [],
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
