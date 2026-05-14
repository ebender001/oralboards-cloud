async function savePromptDiagnostic({
  session,
  oralCase,
  turnIndex,
  candidateResponse,
  examinerPrompt,
  nextExaminerPrompt,
  briefEvaluation,
  promptDiagnostic,
  promptVersion
}) {
  if (!promptDiagnostic) {
    return;
  }

  if (promptDiagnostic.likely_prompt_issue !== true) {
    return;
  }

  try {
    const diagnostic = new Parse.Object("PromptDiagnostic");
    diagnostic.set("session", session);
    diagnostic.set("case", oralCase);
    diagnostic.set("turnIndex", turnIndex);
    diagnostic.set("candidateResponse", candidateResponse || "");
    diagnostic.set("examinerPrompt", examinerPrompt || "");
    diagnostic.set("nextExaminerPrompt", nextExaminerPrompt || "");
    diagnostic.set("briefEvaluation", briefEvaluation || "");
    diagnostic.set("likelyPromptIssue", true);
    diagnostic.set("issueType", promptDiagnostic.issue_type || "");
    diagnostic.set(
      "suggestedPromptAdjustment",
      promptDiagnostic.suggested_prompt_adjustment || ""
    );
    diagnostic.set("promptVersion", promptVersion ?? "current");

    await diagnostic.save(null, { useMasterKey: true });
  } catch (error) {
    console.error("Failed to save PromptDiagnostic:", error);
  }
}

module.exports = {
  savePromptDiagnostic,
};
