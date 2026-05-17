import { $, clearStatus, formatErrorMessage, linesToArray, setStatus } from "./dom.js";
import { ensureInitialized } from "./parseClient.js";
import { canMutate, requireGlobalAdmin } from "./permissions.js";
import { getSpecialtyDetails, getSpecialtyRefId, updateCaseDomainOptions } from "./specialties.js";
import { state } from "./state.js";
import { setCollapsibleCardCollapsed } from "./collapsible.js";

const caseProgressionPointsField = $("caseProgressionPoints");
const decisionForksField = $("decisionForks");
const complicationTriggersField = $("complicationTriggers");
const examinerChallengePointsField = $("examinerChallengePoints");

export function updateOperativeTechniqueState() {
  $("operativeTechniquePoints").disabled = !canMutate() || !$("operativeRequired").checked;
}

function generateCaseId(title) {
  const base = (title || "case")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  const ts = Date.now().toString(36);
  return `${base}-${ts}`;
}

function resetEditingState() {
  state.editingCaseId = null;
  $("saveCaseBtn").textContent = "Save Case";
}

export function clearForm() {
  $("title").value = "";
  $("specialty").value = state.cardiothoracicSurgeryId || "";
  updateCaseDomainOptions("adult_cardiac");
  $("difficulty").value = "medium";
  $("maxTurns").value = "6";
  $("stem").value = "";
  $("firstQuestion").value = "";
  $("mustCoverPoints").value = "";
  $("criticalErrorsMajor").value = "";
  $("criticalErrorsMinor").value = "";
  $("managementPriorities").value = "";
  $("completionCriteria").value = "";
  $("tags").value = "";
  $("operativeRequired").checked = true;
  $("operativeTechniquePoints").value = "";
  caseProgressionPointsField.value = "";
  decisionForksField.value = "";
  complicationTriggersField.value = "";
  examinerChallengePointsField.value = "";
  updateOperativeTechniqueState();
  resetEditingState();
  clearStatus($("editorStatus"));
}

export function populateFormFromCase(item) {
  state.editingCaseId = item.id;

  $("title").value = item.get("title") || "";
  $("specialty").value = getSpecialtyRefId(item.get("specialtyRef")) || state.cardiothoracicSurgeryId || "";
  updateCaseDomainOptions(item.get("caseDomain") || "adult_cardiac");
  $("difficulty").value = item.get("difficulty") || "medium";
  $("maxTurns").value = String(item.get("maxTurns") || 6);
  $("stem").value = item.get("stem") || "";
  $("firstQuestion").value = item.get("firstQuestion") || "";
  $("mustCoverPoints").value = (item.get("mustCoverPoints") || []).join("\n");
  $("criticalErrorsMajor").value = (item.get("criticalErrorsMajor") || []).join("\n");
  $("criticalErrorsMinor").value = (item.get("criticalErrorsMinor") || []).join("\n");
  $("managementPriorities").value = (item.get("managementPriorities") || []).join("\n");
  $("completionCriteria").value = (item.get("completionCriteria") || []).join("\n");
  $("tags").value = (item.get("tags") || []).join("\n");
  $("operativeRequired").checked = item.get("operativeRequired") !== false;
  $("operativeTechniquePoints").value = (item.get("operativeTechniquePoints") || []).join("\n");
  caseProgressionPointsField.value = (item.get("caseProgressionPoints") || []).join("\n");
  decisionForksField.value = (item.get("decisionForks") || []).join("\n");
  complicationTriggersField.value = (item.get("complicationTriggers") || []).join("\n");
  examinerChallengePointsField.value = (item.get("examinerChallengePoints") || []).join("\n");
  updateOperativeTechniqueState();

  $("saveCaseBtn").textContent = "Update Case";
  setCollapsibleCardCollapsed("editorCard", false);
  setStatus($("editorStatus"), `Loaded case for editing: ${item.get("title") || item.id}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function buildCasePayload() {
  const payload = {
    title: $("title").value.trim(),
    caseDomain: $("caseDomain").value,
    specialtyRef: $("specialty").value,
    stem: $("stem").value.trim(),
    firstQuestion: $("firstQuestion").value.trim(),
    mustCoverPoints: linesToArray($("mustCoverPoints").value),
    criticalErrorsMajor: linesToArray($("criticalErrorsMajor").value),
    criticalErrorsMinor: linesToArray($("criticalErrorsMinor").value),
    managementPriorities: linesToArray($("managementPriorities").value),
    completionCriteria: linesToArray($("completionCriteria").value),
    maxTurns: Number($("maxTurns").value || 6),
    difficulty: $("difficulty").value,
    tags: linesToArray($("tags").value),
    operativeRequired: $("operativeRequired").checked,
    operativeTechniquePoints: $("operativeRequired").checked
      ? linesToArray($("operativeTechniquePoints").value)
      : [],
    caseProgressionPoints: linesToArray(caseProgressionPointsField.value),
    decisionForks: linesToArray(decisionForksField.value),
    complicationTriggers: linesToArray(complicationTriggersField.value),
    examinerChallengePoints: linesToArray(examinerChallengePointsField.value),
    isActive: true
  };

  if (!state.editingCaseId) {
    payload.caseId = generateCaseId(payload.title);
  }

  return payload;
}

async function applySpecialtyFields(item, specialtyRefId) {
  const Specialty = Parse.Object.extend("Specialty");
  const specialtyPointer = new Specialty();
  specialtyPointer.id = specialtyRefId;
  item.set("specialtyRef", specialtyPointer);

  const specialtyDetails = await getSpecialtyDetails(specialtyRefId);
  if (specialtyDetails) {
    item.set("specialty", specialtyDetails.get("specialtyId"));
  }
}

function applyCasePayload(item, payload) {
  item.set("title", payload.title);
  item.set("caseDomain", payload.caseDomain);
  item.set("stem", payload.stem);
  item.set("firstQuestion", payload.firstQuestion);
  item.set("mustCoverPoints", payload.mustCoverPoints);
  item.set("criticalErrorsMajor", payload.criticalErrorsMajor);
  item.set("criticalErrorsMinor", payload.criticalErrorsMinor);
  item.set("managementPriorities", payload.managementPriorities);
  item.set("completionCriteria", payload.completionCriteria);
  item.set("maxTurns", payload.maxTurns);
  item.set("difficulty", payload.difficulty);
  item.set("tags", payload.tags);
  item.set("operativeRequired", payload.operativeRequired);
  item.set("operativeTechniquePoints", payload.operativeTechniquePoints);
  item.set("caseProgressionPoints", payload.caseProgressionPoints);
  item.set("decisionForks", payload.decisionForks);
  item.set("complicationTriggers", payload.complicationTriggers);
  item.set("examinerChallengePoints", payload.examinerChallengePoints);
  item.set("isActive", payload.isActive);
}

export function createCaseFormController({ refreshCases }) {
  async function saveCaseFromAdmin(event) {
    event?.preventDefault();
    event?.stopPropagation();

    if (state.isSavingCase) return;

    const saveCaseBtn = $("saveCaseBtn");

    try {
      state.isSavingCase = true;
      console.info("Save Case clicked.");
      ensureInitialized();
      clearStatus($("editorStatus"));
      if (!requireGlobalAdmin($("editorStatus"))) return;

      saveCaseBtn.disabled = true;
      setStatus($("editorStatus"), "Saving case...");

      const payload = buildCasePayload();

      if (!payload.title || !payload.stem || !payload.firstQuestion) {
        throw new Error("Title, stem, and first question are required.");
      }

      if (!payload.specialtyRef) {
        throw new Error("Specialty is required.");
      }

      if (!payload.caseDomain) {
        throw new Error("Case domain is required.");
      }

      if (state.editingCaseId) {
        const OralCase = Parse.Object.extend("OralCase");
        const query = new Parse.Query(OralCase);
        const item = await query.get(state.editingCaseId);

        applyCasePayload(item, payload);
        await applySpecialtyFields(item, payload.specialtyRef);

        if (!item.get("caseId")) {
          item.set("caseId", generateCaseId(payload.title));
        }

        await item.save();
        setStatus($("editorStatus"), `Case updated: ${item.id}`);
      } else {
        const OralCase = Parse.Object.extend("OralCase");
        const newCase = new OralCase();

        newCase.set("caseId", payload.caseId);
        applyCasePayload(newCase, payload);
        await applySpecialtyFields(newCase, payload.specialtyRef);

        await newCase.save();
        state.editingCaseId = newCase.id;
        $("saveCaseBtn").textContent = "Update Case";
        setStatus($("editorStatus"), `Case saved. New case ID: ${newCase.get("caseId")}`);
      }

      await refreshCases();
    } catch (error) {
      console.error("Error saving case:", error);
      setStatus($("editorStatus"), formatErrorMessage(error), "error");
    } finally {
      state.isSavingCase = false;
      saveCaseBtn.disabled = !canMutate();
    }
  }

  return { saveCaseFromAdmin };
}
