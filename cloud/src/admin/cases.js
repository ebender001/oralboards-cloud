function requireGlobalAdmin(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required");
  }

  if (request.user.get("role") !== "global_admin") {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only global_admin users can manage cases.");
  }
}

function serializeCase(oralCase) {
  const attributes = {
    ...oralCase.toJSON(),
    objectId: oralCase.id
  };

  return {
    objectId: oralCase.id,
    ...attributes
  };
}

function buildSpecialtyPointer(specialtyRefId) {
  if (!specialtyRefId) return null;
  const Specialty = Parse.Object.extend("Specialty");
  const pointer = new Specialty();
  pointer.id = specialtyRefId;
  return pointer;
}

Parse.Cloud.define("listCases", async (request) => {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required");
  }

  const OralCase = Parse.Object.extend("OralCase");
  const query = new Parse.Query(OralCase);
  query.include("specialtyRef");
  query.ascending("title");
  query.limit(1000);

  const cases = await query.find({ useMasterKey: true });
  return cases.map(serializeCase);
});

Parse.Cloud.define("getCaseDetail", async (request) => {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required");
  }

  const { objectId } = request.params;
  if (!objectId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Case objectId is required.");
  }

  const OralCase = Parse.Object.extend("OralCase");
  const query = new Parse.Query(OralCase);
  query.include("specialtyRef");
  const oralCase = await query.get(objectId, { useMasterKey: true });
  return serializeCase(oralCase);
});

Parse.Cloud.define("saveCase", async (request) => {
  requireGlobalAdmin(request);

  const params = request.params;
  const requiredFields = ["title", "stem", "firstQuestion", "caseDomain", "specialtyRef"];
  for (const field of requiredFields) {
    if (!params[field]) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `${field} is required.`);
    }
  }

  const OralCase = Parse.Object.extend("OralCase");
  const oralCase = params.objectId
    ? await new Parse.Query(OralCase).get(params.objectId, { useMasterKey: true })
    : new OralCase();

  oralCase.set("title", params.title);
  oralCase.set("caseDomain", params.caseDomain);
  oralCase.set("stem", params.stem);
  oralCase.set("firstQuestion", params.firstQuestion);
  oralCase.set("mustCoverPoints", Array.isArray(params.mustCoverPoints) ? params.mustCoverPoints : []);
  oralCase.set("criticalErrorsMajor", Array.isArray(params.criticalErrorsMajor) ? params.criticalErrorsMajor : []);
  oralCase.set("criticalErrorsMinor", Array.isArray(params.criticalErrorsMinor) ? params.criticalErrorsMinor : []);
  oralCase.set("managementPriorities", Array.isArray(params.managementPriorities) ? params.managementPriorities : []);
  oralCase.set("completionCriteria", Array.isArray(params.completionCriteria) ? params.completionCriteria : []);
  oralCase.set("maxTurns", Number(params.maxTurns) || 6);
  oralCase.set("difficulty", params.difficulty || "medium");
  oralCase.set("tags", Array.isArray(params.tags) ? params.tags : []);
  oralCase.set("operativeRequired", params.operativeRequired === true);
  oralCase.set("operativeTechniquePoints", params.operativeRequired === true && Array.isArray(params.operativeTechniquePoints) ? params.operativeTechniquePoints : []);
  oralCase.set("caseProgressionPoints", Array.isArray(params.caseProgressionPoints) ? params.caseProgressionPoints : []);
  oralCase.set("decisionForks", Array.isArray(params.decisionForks) ? params.decisionForks : []);
  oralCase.set("complicationTriggers", Array.isArray(params.complicationTriggers) ? params.complicationTriggers : []);
  oralCase.set("examinerChallengePoints", Array.isArray(params.examinerChallengePoints) ? params.examinerChallengePoints : []);
  oralCase.set("isActive", params.isActive !== false);

  const specialtyPointer = buildSpecialtyPointer(params.specialtyRef);
  if (specialtyPointer) {
    oralCase.set("specialtyRef", specialtyPointer);
  }

  if (!oralCase.get("caseId")) {
    const base = (params.title || "case").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
    oralCase.set("caseId", `${base}-${Date.now().toString(36)}`);
  }

  await oralCase.save(null, { useMasterKey: true });
  return serializeCase(oralCase);
});

Parse.Cloud.define("deleteCase", async (request) => {
  requireGlobalAdmin(request);

  const { objectId } = request.params;
  if (!objectId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Case objectId is required.");
  }

  const OralCase = Parse.Object.extend("OralCase");
  const oralCase = await new Parse.Query(OralCase).get(objectId, { useMasterKey: true });
  await oralCase.destroy({ useMasterKey: true });
  return { success: true, objectId };
});
