import { $, setControlsDisabled, setStatus } from "./dom.js";
import { state } from "./state.js";

const caseFormControlIds = [
  "title",
  "caseDomain",
  "specialty",
  "difficulty",
  "maxTurns",
  "stem",
  "firstQuestion",
  "mustCoverPoints",
  "criticalErrorsMajor",
  "criticalErrorsMinor",
  "managementPriorities",
  "completionCriteria",
  "tags",
  "operativeRequired",
  "operativeTechniquePoints",
  "caseProgressionPoints",
  "decisionForks",
  "complicationTriggers",
  "examinerChallengePoints",
  "saveCaseBtn",
  "clearBtn"
];

const userMutationControlIds = [
  "newUsername",
  "newPassword",
  "confirmPassword",
  "userRole",
  "createUserBtn"
];

const institutionMutationControlIds = [
  "institutionId",
  "institutionName",
  "institutionSpecialties",
  "institutionIsActive",
  "institutionSeatLimit",
  "institutionSubscriptionStatus",
  "institutionSubscriptionStartDate",
  "institutionSubscriptionEndDate",
  "institutionBillingContactName",
  "institutionBillingContactEmail",
  "institutionCode",
  "institutionAllowSelfEnrollment",
  "saveInstitutionBtn",
  "clearInstitutionBtn"
];

export function getCurrentUserRole() {
  if (typeof Parse === "undefined") {
    return "";
  }

  const currentUser = Parse.User.current();
  return currentUser?.get("role") || "";
}

export function canMutate() {
  state.currentUserRole = getCurrentUserRole();
  return state.currentUserRole === "global_admin";
}

export function requireGlobalAdmin(statusElement) {
  if (canMutate()) {
    return true;
  }

  setStatus(statusElement, "Read-only access: only global_admin users can create, update, or delete records.", "error");
  return false;
}

export function createPermissionController({ renderCaseDetails, renderInstitutionList, renderUserList, updateOperativeTechniqueState }) {
  function applyPermissionState() {
    const readOnly = !canMutate();
    $("editorCard").classList.toggle("hidden", readOnly);
    document.querySelector('a[href="#editorCard"]')?.classList.toggle("hidden", readOnly);
    setControlsDisabled(caseFormControlIds, readOnly);
    setControlsDisabled(userMutationControlIds, readOnly);
    setControlsDisabled(institutionMutationControlIds, readOnly);
    updateOperativeTechniqueState();
    renderCaseDetails(state.oralCases.find(item => item.id === $("caseSelect").value));
    renderInstitutionList();
    renderUserList();
  }

  function showAuthenticatedUI() {
    $("listCard").classList.remove("hidden");
    $("sessionReviewCard").classList.remove("hidden");
    $("userCard").classList.remove("hidden");
    $("institutionCard").classList.remove("hidden");
    applyPermissionState();
  }

  function hideAuthenticatedUI() {
    $("editorCard").classList.add("hidden");
    $("listCard").classList.add("hidden");
    $("sessionReviewCard").classList.add("hidden");
    $("userCard").classList.add("hidden");
    $("institutionCard").classList.add("hidden");
    state.currentUserRole = "";
    applyPermissionState();
  }

  return {
    applyPermissionState,
    showAuthenticatedUI,
    hideAuthenticatedUI
  };
}
