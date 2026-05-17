import { $, clearStatus, escapeHtml, formatDate, linesToArray, setStatus } from "./dom.js";
import { ensureInitialized } from "./parseClient.js";
import { canMutate, requireGlobalAdmin } from "./permissions.js";
import { state } from "./state.js";

let editingInstitutionId = null;

function formatDateInputValue(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parseDateInputValue(value) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function setSelectValue(select, value) {
  if (!value) {
    select.value = "";
    return;
  }

  if (![...select.options].some(option => option.value === value)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  select.value = value;
}

function getInstitutionPayload() {
  const seatLimitValue = $("institutionSeatLimit").value;

  return {
    institutionId: $("institutionId").value.trim(),
    name: $("institutionName").value.trim(),
    specialties: linesToArray($("institutionSpecialties").value),
    isActive: $("institutionIsActive").checked,
    seatLimit: seatLimitValue === "" ? null : Number(seatLimitValue),
    subscriptionStatus: $("institutionSubscriptionStatus").value.trim(),
    subscriptionStartDate: parseDateInputValue($("institutionSubscriptionStartDate").value),
    subscriptionEndDate: parseDateInputValue($("institutionSubscriptionEndDate").value),
    billingContactName: $("institutionBillingContactName").value.trim(),
    billingContactEmail: $("institutionBillingContactEmail").value.trim(),
    institutionCode: $("institutionCode").value.trim(),
    allowSelfEnrollment: $("institutionAllowSelfEnrollment").checked
  };
}

function applyInstitutionPayload(item, payload) {
  item.set("institutionId", payload.institutionId);
  item.set("name", payload.name);
  item.set("specialties", payload.specialties);
  item.set("isActive", payload.isActive);
  item.set("subscriptionStatus", payload.subscriptionStatus);
  item.set("billingContactName", payload.billingContactName);
  item.set("billingContactEmail", payload.billingContactEmail);
  item.set("institutionCode", payload.institutionCode);
  item.set("allowSelfEnrollment", payload.allowSelfEnrollment);

  if (payload.seatLimit === null) {
    item.unset("seatLimit");
  } else {
    item.set("seatLimit", payload.seatLimit);
  }

  if (payload.subscriptionStartDate) {
    item.set("subscriptionStartDate", payload.subscriptionStartDate);
  } else {
    item.unset("subscriptionStartDate");
  }

  if (payload.subscriptionEndDate) {
    item.set("subscriptionEndDate", payload.subscriptionEndDate);
  } else {
    item.unset("subscriptionEndDate");
  }
}

function normalizeInstitutionResult(result) {
  const normalized = { ...result };
  ["subscriptionStartDate", "subscriptionEndDate"].forEach(fieldName => {
    if (normalized[fieldName]?.iso) {
      normalized[fieldName] = new Date(normalized[fieldName].iso);
    } else if (normalized[fieldName]) {
      normalized[fieldName] = new Date(normalized[fieldName]);
    }
  });

  return {
    id: normalized.objectId || normalized.id,
    get(fieldName) {
      return normalized[fieldName];
    }
  };
}

function resetInstitutionEditingState() {
  editingInstitutionId = null;
  $("saveInstitutionBtn").textContent = "Create Institution";
}

export function clearInstitutionForm() {
  $("institutionId").value = "";
  $("institutionName").value = "";
  $("institutionSpecialties").value = "";
  $("institutionIsActive").checked = true;
  $("institutionSeatLimit").value = "";
  $("institutionSubscriptionStatus").value = "active";
  $("institutionSubscriptionStartDate").value = "";
  $("institutionSubscriptionEndDate").value = "";
  $("institutionBillingContactName").value = "";
  $("institutionBillingContactEmail").value = "";
  $("institutionCode").value = "";
  $("institutionAllowSelfEnrollment").checked = false;
  resetInstitutionEditingState();
  clearStatus($("institutionStatus"));
}

function populateInstitutionForm(item) {
  editingInstitutionId = item.id;
  $("institutionId").value = item.get("institutionId") || "";
  $("institutionName").value = item.get("name") || "";
  $("institutionSpecialties").value = (item.get("specialties") || []).join("\n");
  $("institutionIsActive").checked = item.get("isActive") !== false;
  $("institutionSeatLimit").value = item.get("seatLimit") ?? "";
  setSelectValue($("institutionSubscriptionStatus"), item.get("subscriptionStatus") || "active");
  $("institutionSubscriptionStartDate").value = formatDateInputValue(item.get("subscriptionStartDate"));
  $("institutionSubscriptionEndDate").value = formatDateInputValue(item.get("subscriptionEndDate"));
  $("institutionBillingContactName").value = item.get("billingContactName") || "";
  $("institutionBillingContactEmail").value = item.get("billingContactEmail") || "";
  $("institutionCode").value = item.get("institutionCode") || "";
  $("institutionAllowSelfEnrollment").checked = item.get("allowSelfEnrollment") === true;
  $("saveInstitutionBtn").textContent = "Update Institution";
  setStatus($("institutionStatus"), `Loaded institution: ${item.get("name") || item.id}`);
}

export function renderInstitutionList() {
  const institutionList = $("institutionList");
  institutionList.innerHTML = "";

  if (!state.institutions.length) {
    institutionList.innerHTML = `<div class="empty-state">No institutions found.</div>`;
    return;
  }

  state.institutions.forEach(item => {
    const name = item.get("name") || "Untitled Institution";
    const institutionId = item.get("institutionId") || "No institutionId";
    const status = item.get("subscriptionStatus") || "No status";
    const seatLimit = item.get("seatLimit") ?? "No seat limit";
    const code = item.get("institutionCode") || "No code";
    const specialties = (item.get("specialties") || []).join(", ") || "No specialties";
    const activeLabel = item.get("isActive") === false ? "Inactive" : "Active";
    const actions = canMutate()
      ? `
        <button class="secondary small" data-institution-edit-id="${item.id}" type="button">Edit</button>
        <button class="danger small" data-institution-delete-id="${item.id}" type="button">Delete</button>
      `
      : `<span class="small">Read-only</span>`;

    const div = document.createElement("div");
    div.className = "institution-item";
    div.innerHTML = `
      <div class="institution-info">
        <div class="institution-name">${escapeHtml(name)}</div>
        <div class="small">Object ID: ${escapeHtml(item.id)} · ${escapeHtml(institutionId)} · ${escapeHtml(activeLabel)}</div>
        <div class="small">Subscription: ${escapeHtml(status)} · Seats: ${escapeHtml(seatLimit)} · Code: ${escapeHtml(code)}</div>
        <div class="small">Billing: ${escapeHtml(item.get("billingContactName") || "N/A")} · ${escapeHtml(item.get("billingContactEmail") || "N/A")}</div>
        <div class="small">Dates: ${escapeHtml(formatDate(item.get("subscriptionStartDate")))} to ${escapeHtml(formatDate(item.get("subscriptionEndDate")))}</div>
        <div class="small">Specialties: ${escapeHtml(specialties)}</div>
      </div>
      <div class="actions institution-actions">
        ${actions}
      </div>
    `;

    institutionList.appendChild(div);
  });

  institutionList.querySelectorAll("button[data-institution-edit-id]").forEach(btn => {
    btn.addEventListener("click", () => loadInstitutionIntoForm(btn.dataset.institutionEditId));
  });

  institutionList.querySelectorAll("button[data-institution-delete-id]").forEach(btn => {
    btn.addEventListener("click", () => deleteInstitution(btn.dataset.institutionDeleteId));
  });
}

export async function refreshInstitutions() {
  try {
    ensureInitialized();
    clearStatus($("institutionListStatus"));
    const results = await Parse.Cloud.run("listInstitutions", {});
    state.institutions = results.map(normalizeInstitutionResult);

    renderInstitutionList();
    setStatus($("institutionListStatus"), `Loaded ${state.institutions.length} institution${state.institutions.length === 1 ? "" : "s"}.`);
  } catch (error) {
    setStatus($("institutionListStatus"), error.message || String(error), "error");
  }
}

export async function saveInstitution() {
  try {
    ensureInitialized();
    clearStatus($("institutionStatus"));
    if (!requireGlobalAdmin($("institutionStatus"))) return;

    const payload = getInstitutionPayload();
    if (!payload.name) {
      throw new Error("Institution name is required.");
    }

    const wasEditing = Boolean(editingInstitutionId);
    const result = await Parse.Cloud.run("upsertInstitution", {
      objectId: editingInstitutionId,
      ...payload
    });
    const item = normalizeInstitutionResult(result);

    editingInstitutionId = item.id;
    $("saveInstitutionBtn").textContent = "Update Institution";
    setStatus($("institutionStatus"), `Institution ${wasEditing ? "updated" : "created"}: ${item.get("name") || item.id}`);
    await refreshInstitutions();
  } catch (error) {
    setStatus($("institutionStatus"), error.message || String(error), "error");
  }
}

async function loadInstitutionIntoForm(institutionId) {
  try {
    ensureInitialized();
    clearStatus($("institutionStatus"));
    const item = state.institutions.find(institution => institution.id === institutionId);
    if (!item) {
      throw new Error("Institution not found. Refresh the institution list and try again.");
    }

    populateInstitutionForm(item);
  } catch (error) {
    setStatus($("institutionStatus"), error.message || String(error), "error");
  }
}

async function deleteInstitution(institutionId) {
  try {
    ensureInitialized();
    if (!requireGlobalAdmin($("institutionListStatus"))) return;

    const item = state.institutions.find(institution => institution.id === institutionId);
    const name = item?.get?.("name") || institutionId;
    const confirmDelete = confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`);
    if (!confirmDelete) return;

    await Parse.Cloud.run("deleteInstitution", { objectId: institutionId });

    if (editingInstitutionId === institutionId) {
      clearInstitutionForm();
    }

    setStatus($("institutionListStatus"), `Institution deleted: ${name}`);
    await refreshInstitutions();
  } catch (error) {
    setStatus($("institutionListStatus"), error.message || String(error), "error");
  }
}
