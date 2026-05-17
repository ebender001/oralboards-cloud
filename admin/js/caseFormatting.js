import { formatDate } from "./dom.js";

const friendlyCaseFieldNames = {
  caseDomain: "Case Domain",
  caseId: "Case ID",
  caseProgressionPoints: "Case Progression Points",
  completionCriteria: "Completion Criteria",
  complicationTriggers: "Complication Triggers",
  criticalErrorsMajor: "Major Critical Errors",
  criticalErrorsMinor: "Minor Critical Errors",
  decisionForks: "Decision Forks",
  difficulty: "Difficulty",
  examinerChallengePoints: "Examiner Challenge Points",
  firstQuestion: "First Question",
  isActive: "Active",
  managementPriorities: "Management Priorities",
  maxTurns: "Maximum Turns",
  mustCoverPoints: "Must Cover Points",
  operativeRequired: "Operative Required",
  operativeTechniquePoints: "Operative Technique Points",
  specialty: "Specialty",
  specialtyRef: "Specialty Reference",
  stem: "Case Stem",
  tags: "Tags",
  title: "Title"
};

function normalizeCaseValue(value) {
  if (value instanceof Date) {
    return formatDate(value);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeCaseValue);
  }

  if (value && typeof value === "object") {
    if (value.className && value.id) {
      return {
        className: value.className,
        objectId: value.id
      };
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeCaseValue(nestedValue)])
    );
  }

  return value ?? "";
}

function formatCaseValue(value) {
  const normalizedValue = normalizeCaseValue(value);
  return typeof normalizedValue === "object"
    ? JSON.stringify(normalizedValue, null, 2)
    : String(normalizedValue);
}

export function humanizeCaseFieldName(key) {
  if (friendlyCaseFieldNames[key]) {
    return friendlyCaseFieldNames[key];
  }

  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

export function formatFriendlyCaseValue(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => typeof item === "string" ? item : formatCaseValue(item))
      .join("\n");
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return formatCaseValue(value);
}
