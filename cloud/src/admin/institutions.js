function requireGlobalAdmin(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required");
  }

  if (request.user.get("role") !== "global_admin") {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only global_admin users can manage institutions.");
  }
}

function normalizeOptionalDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Invalid subscription date.");
  }

  return date;
}

function applyInstitutionPayload(institution, params) {
  institution.set("institutionId", params.institutionId || "");
  institution.set("name", params.name || "");
  institution.set("specialties", Array.isArray(params.specialties) ? params.specialties : []);
  institution.set("isActive", params.isActive !== false);
  institution.set("subscriptionStatus", params.subscriptionStatus || "");
  institution.set("billingContactName", params.billingContactName || "");
  institution.set("billingContactEmail", params.billingContactEmail || "");
  institution.set("institutionCode", params.institutionCode || "");
  institution.set("allowSelfEnrollment", params.allowSelfEnrollment === true);

  if (params.seatLimit === null || params.seatLimit === undefined || params.seatLimit === "") {
    institution.unset("seatLimit");
  } else {
    institution.set("seatLimit", Number(params.seatLimit));
  }

  const subscriptionStartDate = normalizeOptionalDate(params.subscriptionStartDate);
  const subscriptionEndDate = normalizeOptionalDate(params.subscriptionEndDate);

  if (subscriptionStartDate) {
    institution.set("subscriptionStartDate", subscriptionStartDate);
  } else {
    institution.unset("subscriptionStartDate");
  }

  if (subscriptionEndDate) {
    institution.set("subscriptionEndDate", subscriptionEndDate);
  } else {
    institution.unset("subscriptionEndDate");
  }
}

function serializeInstitution(institution) {
  return {
    objectId: institution.id,
    institutionId: institution.get("institutionId") || "",
    name: institution.get("name") || "",
    specialties: institution.get("specialties") || [],
    isActive: institution.get("isActive") !== false,
    seatLimit: institution.get("seatLimit"),
    subscriptionStatus: institution.get("subscriptionStatus") || "",
    subscriptionStartDate: institution.get("subscriptionStartDate") || null,
    subscriptionEndDate: institution.get("subscriptionEndDate") || null,
    billingContactName: institution.get("billingContactName") || "",
    billingContactEmail: institution.get("billingContactEmail") || "",
    institutionCode: institution.get("institutionCode") || "",
    allowSelfEnrollment: institution.get("allowSelfEnrollment") === true
  };
}

Parse.Cloud.define("upsertInstitution", async (request) => {
  requireGlobalAdmin(request);

  const { objectId, name } = request.params;
  if (!name) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Institution name is required.");
  }

  const Institution = Parse.Object.extend("Institution");
  const institution = objectId
    ? await new Parse.Query(Institution).get(objectId, { useMasterKey: true })
    : new Institution();

  applyInstitutionPayload(institution, request.params);
  await institution.save(null, { useMasterKey: true });

  return serializeInstitution(institution);
});

Parse.Cloud.define("listInstitutions", async (request) => {
  requireGlobalAdmin(request);

  const Institution = Parse.Object.extend("Institution");
  const query = new Parse.Query(Institution);
  query.ascending("name");
  query.limit(1000);

  const institutions = await query.find({ useMasterKey: true });
  return institutions.map(serializeInstitution);
});

Parse.Cloud.define("deleteInstitution", async (request) => {
  requireGlobalAdmin(request);

  const { objectId } = request.params;
  if (!objectId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Institution objectId is required.");
  }

  const Institution = Parse.Object.extend("Institution");
  const institution = await new Parse.Query(Institution).get(objectId, { useMasterKey: true });
  await institution.destroy({ useMasterKey: true });

  return { success: true, objectId };
});
