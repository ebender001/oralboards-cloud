import { $, clearStatus, escapeHtml, setStatus } from "./dom.js";
import { ensureInitialized } from "./parseClient.js";
import { canMutate, requireGlobalAdmin } from "./permissions.js";
import { formatFriendlyCaseValue, humanizeCaseFieldName } from "./caseFormatting.js";
import { getCaseSpecialtyGroup } from "./specialties.js";
import { state } from "./state.js";

export function createCasesController({ clearForm, populateFormFromCase }) {
  function renderCaseOptions(selectedCaseId = "") {
    const caseSelect = $("caseSelect");
    caseSelect.innerHTML = "";

    if (!state.oralCases.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No cases found";
      caseSelect.appendChild(option);
      return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a case...";
    caseSelect.appendChild(placeholder);

    const casesBySpecialty = new Map();

    state.oralCases.forEach(item => {
      const group = getCaseSpecialtyGroup(item);

      if (!casesBySpecialty.has(group.key)) {
        casesBySpecialty.set(group.key, {
          label: group.label,
          sortLabel: group.sortLabel,
          cases: []
        });
      }

      casesBySpecialty.get(group.key).cases.push(item);
    });

    [...casesBySpecialty.values()]
      .sort((a, b) => a.sortLabel.localeCompare(b.sortLabel))
      .forEach(group => {
        const optgroup = document.createElement("optgroup");
        optgroup.label = `${group.label} (${group.cases.length})`;

        group.cases
          .sort((a, b) => (a.get("title") || "").localeCompare(b.get("title") || ""))
          .forEach(item => {
            const option = document.createElement("option");
            option.value = item.id;
            option.textContent = item.get("title") || "Untitled Case";
            optgroup.appendChild(option);
          });

        caseSelect.appendChild(optgroup);
      });

    caseSelect.value = selectedCaseId;
  }

  function renderCaseDetails(item) {
    const caseDetails = $("caseDetails");

    if (!item) {
      caseDetails.classList.add("hidden");
      caseDetails.innerHTML = "";
      return;
    }

    const attributeRows = Object.entries(item.attributes)
      .filter(([key]) => key !== "createdAt" && key !== "updatedAt")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `
        <div class="case-detail-row">
          <div class="case-detail-label">${escapeHtml(humanizeCaseFieldName(key))}</div>
          <pre class="case-detail-value">${escapeHtml(formatFriendlyCaseValue(value))}</pre>
        </div>
      `)
      .join("");

    caseDetails.classList.remove("hidden");
    const caseActions = canMutate()
      ? `
        <div class="actions case-detail-actions">
          <button class="secondary" id="editSelectedCaseBtn" type="button">Edit</button>
          <button class="danger" id="deleteSelectedCaseBtn" type="button">Delete</button>
        </div>
      `
      : `<div class="small">Read-only</div>`;

    caseDetails.innerHTML = `
      <div class="case-detail-header">
        <div>
          <div class="case-title">${escapeHtml(item.get("title") || "Untitled Case")}</div>
          <div class="small">Object ID: ${escapeHtml(item.id)}</div>
        </div>
        ${caseActions}
      </div>
      <div class="case-detail-grid">
        <div class="case-detail-row">
          <div class="case-detail-label">Object ID</div>
          <pre class="case-detail-value">${escapeHtml(item.id)}</pre>
        </div>
        ${attributeRows}
      </div>
    `;

    if (canMutate()) {
      $("editSelectedCaseBtn").addEventListener("click", () => loadCaseIntoForm(item.id));
      $("deleteSelectedCaseBtn").addEventListener("click", () => deleteCase(item.id));
    }
  }

  function loadSelectedCaseDetails() {
    const selectedCase = state.oralCases.find(item => item.id === $("caseSelect").value);
    renderCaseDetails(selectedCase);
  }

  async function refreshCases() {
    try {
      ensureInitialized();
      clearStatus($("listStatus"));
      const OralCase = Parse.Object.extend("OralCase");
      const query = new Parse.Query(OralCase);
      query.include("specialtyRef");
      query.ascending("title");
      query.limit(1000);
      state.oralCases = await query.find();

      const selectedCaseId = $("caseSelect").value;
      renderCaseOptions(selectedCaseId);

      if (!state.oralCases.length) {
        renderCaseDetails(null);
        setStatus($("listStatus"), "No cases found.", "ok");
        return;
      }

      if (state.oralCases.some(item => item.id === selectedCaseId)) {
        loadSelectedCaseDetails();
      } else {
        renderCaseDetails(null);
      }

      setStatus($("listStatus"), `Loaded ${state.oralCases.length} case${state.oralCases.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus($("listStatus"), error.message || String(error), "error");
    }
  }

  async function loadCaseIntoForm(caseId) {
    try {
      ensureInitialized();
      clearStatus($("editorStatus"));
      if (!requireGlobalAdmin($("editorStatus"))) return;

      const OralCase = Parse.Object.extend("OralCase");
      const query = new Parse.Query(OralCase);
      const item = await query.get(caseId);

      populateFormFromCase(item);
    } catch (error) {
      setStatus($("editorStatus"), error.message || String(error), "error");
    }
  }

  async function deleteCase(caseId) {
    try {
      ensureInitialized();
      if (!requireGlobalAdmin($("listStatus"))) return;

      const confirmDelete = confirm("Are you sure you want to delete this case? This cannot be undone.");
      if (!confirmDelete) return;

      const OralCase = Parse.Object.extend("OralCase");
      const query = new Parse.Query(OralCase);
      const item = await query.get(caseId);

      await item.destroy();

      setStatus($("listStatus"), `Case deleted: ${caseId}`);
      await refreshCases();

      if (state.editingCaseId === caseId) {
        clearForm();
      }
    } catch (error) {
      setStatus($("listStatus"), error.message || String(error), "error");
    }
  }

  return {
    renderCaseDetails,
    loadSelectedCaseDetails,
    refreshCases
  };
}
