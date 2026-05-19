const PUSH_DEVICE_CLASS = "PushDevice";
const VALID_ENVIRONMENTS = new Set(["sandbox", "production"]);
const TOKEN_LOG_PREFIX_LENGTH = 6;

function parseValidationError(message) {
  return new Parse.Error(Parse.Error.VALIDATION_ERROR, message);
}

function normalizeDeviceToken(deviceToken) {
  if (typeof deviceToken !== "string") {
    throw parseValidationError("deviceToken is required and must be a string");
  }

  const normalized = deviceToken.trim().toLowerCase();
  if (!normalized) {
    throw parseValidationError("deviceToken is required and cannot be empty");
  }

  return normalized;
}

function normalizeInstallationId(installationId) {
  if (typeof installationId !== "string") {
    throw parseValidationError("installationId is required and must be a string");
  }

  const normalized = installationId.trim();
  if (!normalized) {
    throw parseValidationError("installationId is required and cannot be empty");
  }

  return normalized;
}

function validateEnvironment(environment) {
  if (typeof environment !== "string" || !VALID_ENVIRONMENTS.has(environment)) {
    throw parseValidationError("environment must be either sandbox or production");
  }

  return environment;
}

function validatePlatform(platform) {
  if (platform !== "ios") {
    throw parseValidationError("platform must equal ios");
  }

  return platform;
}

function validateNotificationEnabled(notificationEnabled) {
  if (typeof notificationEnabled !== "boolean") {
    throw parseValidationError("notificationEnabled must be a boolean");
  }

  return notificationEnabled;
}

function normalizeOptionalString(value, fieldName) {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== "string") {
    throw parseValidationError(`${fieldName} must be a string`);
  }

  return value.trim();
}

function normalizeChannels(channels) {
  if (channels === undefined || channels === null) {
    return [];
  }

  if (!Array.isArray(channels)) {
    throw parseValidationError("channels must be an array of strings");
  }

  return channels.map((channel) => {
    if (typeof channel !== "string") {
      throw parseValidationError("channels must contain only strings");
    }

    return channel.trim();
  }).filter(Boolean);
}

function normalizeOptionalDate(value) {
  if (!value) {
    return new Date();
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw parseValidationError("lastRegisteredAt must be a valid date");
  }

  return parsedDate;
}

function tokenLogPrefix(deviceToken) {
  return `${deviceToken.slice(0, TOKEN_LOG_PREFIX_LENGTH)}...`;
}

async function findExistingPushDevice(deviceToken, environment) {
  const query = new Parse.Query(PUSH_DEVICE_CLASS);
  query.equalTo("deviceToken", deviceToken);
  query.equalTo("environment", environment);

  return query.first({ useMasterKey: true });
}

function assignPushDeviceFields(pushDevice, params, requestUser) {
  pushDevice.set("deviceToken", params.deviceToken);
  pushDevice.set("environment", params.environment);
  pushDevice.set("platform", params.platform);
  pushDevice.set("installationId", params.installationId);
  pushDevice.set("anonymousPerformanceId", params.anonymousPerformanceId);
  pushDevice.set("appVersion", params.appVersion);
  pushDevice.set("buildNumber", params.buildNumber);
  pushDevice.set("notificationEnabled", params.notificationEnabled);
  pushDevice.set("lastPermissionStatus", params.lastPermissionStatus);
  pushDevice.set("lastRegisteredAt", params.lastRegisteredAt);
  pushDevice.set("channels", params.channels);
  pushDevice.set("selectedSpecialty", params.selectedSpecialty);

  if (requestUser) {
    pushDevice.set("user", requestUser);
  }
}

function validateAndNormalizeParams(params) {
  return {
    deviceToken: normalizeDeviceToken(params.deviceToken),
    environment: validateEnvironment(params.environment),
    platform: validatePlatform(params.platform),
    installationId: normalizeInstallationId(params.installationId),
    anonymousPerformanceId: params.anonymousPerformanceId,
    appVersion: params.appVersion,
    buildNumber: params.buildNumber,
    notificationEnabled: validateNotificationEnabled(params.notificationEnabled),
    lastPermissionStatus: params.lastPermissionStatus,
    lastRegisteredAt: normalizeOptionalDate(params.lastRegisteredAt),
    channels: normalizeChannels(params.channels),
    selectedSpecialty: normalizeOptionalString(params.selectedSpecialty, "selectedSpecialty"),
  };
}

// Recommended PushDevice security:
// - no public find access
// - no client create/update/delete access; write only through Cloud Code
// - unique logical index on deviceToken + environment
//
// TODO: Add stale token cleanup.
// TODO: Add specialty targeting.
// TODO: Add notification analytics.
// TODO: Add APNs production/sandbox migration checks.
// TODO: Add invalid token pruning.
Parse.Cloud.define("registerPushDevice", async (request) => {
  const params = validateAndNormalizeParams(request.params || {});
  const existingPushDevice = await findExistingPushDevice(
    params.deviceToken,
    params.environment
  );
  const created = !existingPushDevice;
  const pushDevice = existingPushDevice || new Parse.Object(PUSH_DEVICE_CLASS);

  assignPushDeviceFields(pushDevice, params, request.user);

  const savedPushDevice = await pushDevice.save(null, { useMasterKey: true });
  const action = created ? "Created" : "Updated";
  const updatedAt = savedPushDevice.updatedAt || new Date();

  console.log(
    `[PushDevice] ${action} ${params.environment} token ${tokenLogPrefix(params.deviceToken)}`
  );

  return {
    ok: true,
    objectId: savedPushDevice.id,
    created,
    updatedAt,
  };
});
