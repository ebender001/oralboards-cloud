import { $, clearStatus, setStatus } from "./js/dom.js";
import { setupCollapsibleCard } from "./js/collapsible.js";
import { initializeParse, ensureInitialized } from "./js/parseClient.js";
import { getCurrentUserRole, canMutate, createPermissionController } from "./js/permissions.js";
import { loadSpecialties, updateCaseDomainOptions } from "./js/specialties.js";
import { createUser, refreshUsers, renderUserList } from "./js/users.js";
import { clearInstitutionForm, refreshInstitutions, renderInstitutionList, saveInstitution } from "./js/institutions.js";
import { clearForm, createCaseFormController, populateFormFromCase, updateOperativeTechniqueState } from "./js/caseForm.js";
import { createCasesController } from "./js/cases.js";
import { loadSelectedSessionTurns, refreshSessions } from "./js/sessions.js";
import { state } from "./js/state.js";

const ADMIN_APP_VERSION = "2026-05-14-save-debug";

console.info(`OralBoards admin app.js loaded: ${ADMIN_APP_VERSION}`);

const casesController = createCasesController({
  clearForm,
  populateFormFromCase
});

const permissionController = createPermissionController({
  renderCaseDetails: casesController.renderCaseDetails,
  renderInstitutionList,
  renderUserList,
  updateOperativeTechniqueState
});

const caseFormController = createCaseFormController({
  refreshCases: casesController.refreshCases
});

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const appPill = document.querySelector(".pill");
    if (appPill) {
      appPill.textContent = `Local browser app - ${ADMIN_APP_VERSION}`;
    }

    initializeParse();

    $("configCard").classList.add("hidden");
    $("authCard").classList.remove("hidden");

    setStatus($("configStatus"), "Parse initialized automatically.");
    await loadSpecialties();
  } catch (error) {
    setStatus($("configStatus"), error.message || String(error), "error");
  }
});

$("loginBtn").addEventListener("click", async () => {
  try {
    ensureInitialized();
    clearStatus($("authStatus"));
    const user = await Parse.User.logIn($("username").value.trim(), $("password").value);
    state.currentUserRole = getCurrentUserRole();
    setStatus($("authStatus"), `Logged in as ${user.get("username")} (${state.currentUserRole || "no role"}).${canMutate() ? "" : " Read-only access."}`);
    permissionController.showAuthenticatedUI();
    await casesController.refreshCases();
    await refreshSessions();
    await refreshUsers();
    await refreshInstitutions();
  } catch (error) {
    setStatus($("authStatus"), error.message || String(error), "error");
  }
});

$("whoAmIBtn").addEventListener("click", async () => {
  try {
    ensureInitialized();
    const currentUser = Parse.User.current();
    if (currentUser) {
      state.currentUserRole = getCurrentUserRole();
      setStatus($("authStatus"), `Current user: ${currentUser.get("username")} (${state.currentUserRole || "no role"}).${canMutate() ? "" : " Read-only access."}`);
      permissionController.showAuthenticatedUI();
      await casesController.refreshCases();
      await refreshSessions();
      await refreshUsers();
      await refreshInstitutions();
    } else {
      setStatus($("authStatus"), "No current user session.", "error");
    }
  } catch (error) {
    setStatus($("authStatus"), error.message || String(error), "error");
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await Parse.User.logOut();
  permissionController.hideAuthenticatedUI();
  setStatus($("authStatus"), "Logged out.");
});

$("clearBtn").addEventListener("click", clearForm);
$("refreshCasesBtn").addEventListener("click", casesController.refreshCases);
$("caseSelect").addEventListener("change", casesController.loadSelectedCaseDetails);
$("refreshSessionsBtn").addEventListener("click", refreshSessions);
$("sessionSelect").addEventListener("change", loadSelectedSessionTurns);
$("specialty").addEventListener("change", () => updateCaseDomainOptions());
$("operativeRequired").addEventListener("change", updateOperativeTechniqueState);
$("refreshUsersBtn").addEventListener("click", refreshUsers);
$("createUserBtn").addEventListener("click", createUser);
$("refreshInstitutionsBtn").addEventListener("click", refreshInstitutions);
$("saveInstitutionBtn").addEventListener("click", saveInstitution);
$("clearInstitutionBtn").addEventListener("click", clearInstitutionForm);

setupCollapsibleCard("userCard", "userCardContent", "toggleUserCardBtn");
setupCollapsibleCard("institutionCard", "institutionCardContent", "toggleInstitutionCardBtn");
setupCollapsibleCard("editorCard", "editorCardContent", "toggleEditorCardBtn");
updateOperativeTechniqueState();

window.saveCaseFromAdmin = caseFormController.saveCaseFromAdmin;
$("saveCaseBtn").addEventListener("click", caseFormController.saveCaseFromAdmin);
document.addEventListener("click", (event) => {
  if (event.target?.closest?.("#saveCaseBtn")) {
    caseFormController.saveCaseFromAdmin(event);
  }
}, true);
