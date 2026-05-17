function requireAuthenticated(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required");
  }
}

function serializeSpecialty(specialty) {
  return {
    objectId: specialty.id,
    specialtyId: specialty.get("specialtyId") || "",
    displayName: specialty.get("displayName") || "",
    description: specialty.get("description") || ""
  };
}

Parse.Cloud.define("listSpecialties", async (request) => {
  requireAuthenticated(request);

  const Specialty = Parse.Object.extend("Specialty");
  const query = new Parse.Query(Specialty);
  query.ascending("displayName");
  query.limit(1000);

  const specialties = await query.find({ useMasterKey: true });
  return specialties.map(serializeSpecialty);
});

Parse.Cloud.define("getSpecialtyDetails", async (request) => {
  requireAuthenticated(request);

  const { objectId } = request.params;
  if (!objectId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Specialty objectId is required.");
  }

  const Specialty = Parse.Object.extend("Specialty");
  const specialty = await new Parse.Query(Specialty).get(objectId, { useMasterKey: true });
  return serializeSpecialty(specialty);
});
