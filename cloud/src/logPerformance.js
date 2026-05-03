Parse.Cloud.define("logPerformance", async (request) => {
  const {
    deviceId,
    caseId,
    completionReason,
    turnCount,
    majorErrorsCount = 0,
    minorErrorsCount = 0,
    coveredPointsCount = 0
  } = request.params;

  if (!deviceId || !caseId) {
    throw new Error("Missing required parameters");
  }

  const Performance = Parse.Object.extend("UserPerformance");
  const record = new Performance();

  record.set("deviceId", deviceId);
  record.set("caseId", caseId);
  record.set("completionReason", completionReason);
  record.set("turnCount", turnCount);
  record.set("majorErrorsCount", majorErrorsCount);
  record.set("minorErrorsCount", minorErrorsCount);
  record.set("coveredPointsCount", coveredPointsCount);

  await record.save(null, { useMasterKey: true });

  return { success: true };
});