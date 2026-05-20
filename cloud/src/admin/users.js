function requireGlobalAdmin(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required");
  }

  if (getUserRoleKey(request.user) !== "global_admin") {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only global_admin users can manage users.");
  }
}

function requireUserManager(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required");
  }

  const roleKey = getUserRoleKey(request.user);
  if (roleKey !== "global_admin" && roleKey !== "institution_admin") {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only global_admin and institution_admin users can manage users.");
  }
}

function getUserRoleKey(user) {
  const roleKey = user.get("roleKey");
  if (roleKey) {
    return roleKey;
  }

  const role = user.get("role");
  if (typeof role === "string") {
    return role;
  }

  return role?.get?.("roleKey") || "";
}

function getUserInstitution(user) {
  return user.get("institution") || null;
}

async function resolveAppRole(roleKey) {
  const key = roleKey || "institution_user";
  const query = new Parse.Query("AppRole");
  query.equalTo("roleKey", key);
  const role = await query.first({ useMasterKey: true });

  if (!role) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `AppRole not found for roleKey: ${key}`);
  }

  return role;
}

function serializeAppRole(role) {
  const roleKey = role.get("roleKey") || "";

  return {
    objectId: role.id,
    roleKey,
    displayName: role.get("displayName") || roleKey,
    description: role.get("description") || "",
    isActive: role.get("isActive") !== false,
    sortOrder: role.get("sortOrder") ?? 0
  };
}

async function resolveInstitution(objectId) {
  if (!objectId) {
    return null;
  }

  const Institution = Parse.Object.extend("Institution");
  return new Parse.Query(Institution).get(objectId, { useMasterKey: true });
}

function serializeUser(user) {
  const role = user.get("role");
  const institution = user.get("institution");
  const roleKey = getUserRoleKey(user) || "institution_user";

  return {
    objectId: user.id,
    username: user.get("username") || "",
    roleKey,
    role: role && typeof role !== "string" ? {
      objectId: role.id,
      roleKey: role.get("roleKey") || roleKey,
      displayName: role.get("displayName") || ""
    } : null,
    institution: institution ? {
      objectId: institution.id,
      institutionId: institution.get("institutionId") || "",
      name: institution.get("name") || ""
    } : null
  };
}

Parse.Cloud.define("listAppRoles", async (request) => {
  requireUserManager(request);

  const query = new Parse.Query("AppRole");
  query.notEqualTo("isActive", false);
  query.ascending(["sortOrder", "displayName", "roleKey"]);
  query.limit(1000);

  const roles = await query.find({ useMasterKey: true });
  return roles.map(serializeAppRole).filter(role => role.roleKey);
});

Parse.Cloud.define("listUsers", async (request) => {
  requireUserManager(request);

  const query = new Parse.Query(Parse.User);
  query.include("role");
  query.include("institution");
  query.ascending("username");
  query.limit(1000);

  if (getUserRoleKey(request.user) === "institution_admin") {
    const institution = getUserInstitution(request.user);
    if (!institution) {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Institution admins must be assigned to an institution.");
    }
    query.equalTo("institution", institution);
  }

  const users = await query.find({ useMasterKey: true });
  return users.map(serializeUser);
});

Parse.Cloud.define("createUser", async (request) => {
  requireUserManager(request);

  const { username, password, roleKey, role, institutionObjectId } = request.params;
  if (!username || !password) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Username and password are required.");
  }

  const normalizedRoleKey = roleKey || (typeof role === "string" ? role : role?.roleKey) || "institution_user";
  const requesterRoleKey = getUserRoleKey(request.user);

  if (requesterRoleKey === "institution_admin" && normalizedRoleKey === "global_admin") {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Institution admins cannot create global_admin users.");
  }

  const appRole = await resolveAppRole(normalizedRoleKey);
  let institution = null;

  if (requesterRoleKey === "institution_admin") {
    institution = getUserInstitution(request.user);
    if (!institution) {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Institution admins must be assigned to an institution.");
    }
  } else {
    institution = await resolveInstitution(institutionObjectId);
  }

  if (normalizedRoleKey !== "global_admin" && !institution) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Institution is required unless the new user is a global_admin.");
  }

  const user = new Parse.User();
  user.set("username", username);
  user.set("password", password);
  user.set("roleKey", normalizedRoleKey);
  user.set("role", appRole);
  if (institution) {
    user.set("institution", institution);
  } else {
    user.unset("institution");
  }

  await user.save(null, { useMasterKey: true });
  return serializeUser(user);
});

Parse.Cloud.define("deleteUser", async (request) => {
  requireUserManager(request);

  const { objectId } = request.params;
  if (!objectId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "User objectId is required.");
  }

  const query = new Parse.Query(Parse.User);
  query.include("role");
  query.include("institution");
  const user = await query.get(objectId, { useMasterKey: true });
  const username = user.get("username");
  const roleKey = getUserRoleKey(user);
  if (username === "admin" || roleKey === "global_admin") {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Cannot delete admin users.");
  }

  if (getUserRoleKey(request.user) === "institution_admin") {
    const requesterInstitution = getUserInstitution(request.user);
    const userInstitution = getUserInstitution(user);
    if (!requesterInstitution || !userInstitution || requesterInstitution.id !== userInstitution.id) {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Institution admins can only delete users in their institution.");
    }
  }

  await user.destroy({ useMasterKey: true });
  return { success: true, objectId };
});
