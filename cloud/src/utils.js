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

async function getRandomCase(specialty) {
  const query = new Parse.Query("OralCase");
  query.equalTo("isActive", true);

  if (typeof specialty === "string" && specialty.trim().length > 0) {
    query.equalTo("specialty", specialty.trim());
  }

  console.log("*****SELECTED SPECIALTY:", typeof specialty === "string" ? specialty.trim() : specialty);

  const cases = await query.find({ useMasterKey: true });

  if (!cases.length) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      specialty
        ? `No active oral cases found for specialty: ${specialty}`
        : "No active oral cases found"
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

module.exports = {
  requireString,
  getRandomCase,
  getSessionWithCase,
  getTurns,
  deleteTurnsForSession,
  mergeUnique,
};