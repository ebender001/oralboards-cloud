function requireGlobalAdmin(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required");
  }

  if (request.user.get("role") !== "global_admin") {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only global_admin users can manage users.");
  }
}

function serializeUser(user) {
  return {
    objectId: user.id,
    username: user.get("username") || "",
    role: user.get("role") || "institution_user"
  };
}

Parse.Cloud.define("listUsers", async (request) => {
  requireGlobalAdmin(request);

  const query = new Parse.Query(Parse.User);
  query.ascending("username");
  query.limit(1000);
  const users = await query.find({ useMasterKey: true });
  return users.map(serializeUser);
});

Parse.Cloud.define("createUser", async (request) => {
  requireGlobalAdmin(request);

  const { username, password, role } = request.params;
  if (!username || !password) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Username and password are required.");
  }

  const user = new Parse.User();
  user.set("username", username);
  user.set("password", password);
  user.set("role", role || "institution_user");

  await user.save(null, { useMasterKey: true });
  return serializeUser(user);
});

Parse.Cloud.define("deleteUser", async (request) => {
  requireGlobalAdmin(request);

  const { objectId } = request.params;
  if (!objectId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "User objectId is required.");
  }

  const query = new Parse.Query(Parse.User);
  const user = await query.get(objectId, { useMasterKey: true });
  const username = user.get("username");
  const role = user.get("role");
  if (username === "admin" || role === "global_admin") {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Cannot delete admin users.");
  }

  await user.destroy({ useMasterKey: true });
  return { success: true, objectId };
});
