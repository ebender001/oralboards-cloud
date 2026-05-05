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

const ALL_SPECIALTIES_ROTATION_KEY = "__all__";

function normalizeOptionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getRotationSpecialtyKey(specialty) {
  const normalizedSpecialty = normalizeOptionalString(specialty);
  return normalizedSpecialty || ALL_SPECIALTIES_ROTATION_KEY;
}

async function getOrCreateCaseRotation(clientInstanceId, specialty) {
  const normalizedClientInstanceId = normalizeOptionalString(clientInstanceId);
  if (!normalizedClientInstanceId) {
    return null;
  }

  const specialtyKey = getRotationSpecialtyKey(specialty);
  const query = new Parse.Query("OralCaseRotation");
  query.equalTo("clientInstanceId", normalizedClientInstanceId);
  query.equalTo("specialtyKey", specialtyKey);

  let rotation = await query.first({ useMasterKey: true });
  if (!rotation) {
    rotation = new Parse.Object("OralCaseRotation");
    rotation.set("clientInstanceId", normalizedClientInstanceId);
    rotation.set("specialtyKey", specialtyKey);
    rotation.set("servedCaseIds", []);
  }

  return rotation;
}

function chooseRandomCase(cases) {
  return cases[Math.floor(Math.random() * cases.length)];
}

async function recordServedCase(clientInstanceId, specialty, oralCase) {
  const rotation = await getOrCreateCaseRotation(clientInstanceId, specialty);
  if (!rotation || !oralCase) {
    return;
  }

  const servedCaseIds = rotation.get("servedCaseIds") || [];
  if (!servedCaseIds.includes(oralCase.id)) {
    rotation.set("servedCaseIds", [...servedCaseIds, oralCase.id]);
    await rotation.save(null, { useMasterKey: true });
  }
}

async function getRandomCase(specialty, clientInstanceId, caseDomain = null) {
  const query = new Parse.Query("OralCase");
  query.equalTo("isActive", true);

  if (typeof specialty === "string" && specialty.trim().length > 0) {
    query.equalTo("specialty", specialty.trim());
  }

  if (caseDomain) {
    query.equalTo("caseDomain", caseDomain);
  }

  console.log("*****SELECTED SPECIALTY:", typeof specialty === "string" ? specialty.trim() : specialty);
  console.log("*****SELECTED CASE DOMAIN:", caseDomain || "nil");

  const cases = await query.find({ useMasterKey: true });

  if (!cases.length) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      specialty && caseDomain
        ? `No active oral cases found for specialty: ${specialty} and caseDomain: ${caseDomain}`
        : specialty
        ? `No active oral cases found for specialty: ${specialty}`
        : "No active oral cases found"
    );
  }

  const rotation = await getOrCreateCaseRotation(clientInstanceId, specialty);
  if (!rotation) {
    return chooseRandomCase(cases);
  }

  const activeCaseIds = new Set(cases.map((oralCase) => oralCase.id));
  const servedCaseIds = (rotation.get("servedCaseIds") || []).filter((caseId) =>
    activeCaseIds.has(caseId)
  );

  const unservedCases = cases.filter((oralCase) => !servedCaseIds.includes(oralCase.id));
  const candidateCases = unservedCases.length ? unservedCases : cases;
  const selectedCase = chooseRandomCase(candidateCases);
  const nextServedCaseIds = unservedCases.length ? servedCaseIds : [];

  rotation.set("servedCaseIds", [...nextServedCaseIds, selectedCase.id]);
  await rotation.save(null, { useMasterKey: true });

  return selectedCase;
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
  recordServedCase,
  getSessionWithCase,
  getTurns,
  deleteTurnsForSession,
  mergeUnique,
};
