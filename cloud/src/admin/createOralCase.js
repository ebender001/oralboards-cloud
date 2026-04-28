 //createOralcase.js
//for inserting from admin pages to database
Parse.Cloud.define("createOralCase", async (request) => {
  // Optional: enforce login
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required");
  }

  const {
    title,
    caseDomain,
    stem,
    firstQuestion,
    keyPoints,
    criticalErrors,
    managementPriorities,
    maxTurns,
    difficulty,
    tags,
    isActive
  } = request.params;

  const oralCase = new Parse.Object("OralCase");

  oralCase.set("title", title);
  oralCase.set("caseDomain", caseDomain);
  oralCase.set("stem", stem);
  oralCase.set("firstQuestion", firstQuestion);
  oralCase.set("keyPoints", keyPoints || []);
  oralCase.set("criticalErrors", criticalErrors || []);
  oralCase.set("managementPriorities", managementPriorities || []);
  oralCase.set("maxTurns", maxTurns || 6);
  oralCase.set("difficulty", difficulty || "medium");
  oralCase.set("tags", tags || []);
  oralCase.set("isActive", isActive ?? true);

  await oralCase.save(null, { useMasterKey: true });

  return {
    success: true,
    caseId: oralCase.id
  };
});