import { $ } from "./dom.js";
import { ensureInitialized } from "./parseClient.js";
import { state } from "./state.js";

const caseDomainsBySpecialty = {
  cardiothoracic: [
    { value: "adult_cardiac", label: "Adult Cardiac" },
    { value: "thoracic", label: "Thoracic" },
    { value: "congenital", label: "Congenital" },
    { value: "critical_care", label: "Critical Care" }
  ],
  general: [
    { value: "acute_care_surgery", label: "Acute Care Surgery" },
    { value: "trauma", label: "Trauma" },
    { value: "colorectal_surgery", label: "Colorectal Surgery" },
    { value: "hepatobiliary_surgery", label: "Hepatobiliary Surgery" },
    { value: "pancreatic_surgery", label: "Pancreatic Surgery" },
    { value: "upper_gastrointestinal_surgery", label: "Upper Gastrointestinal Surgery" },
    { value: "hernia_and_abdominal_wall", label: "Hernia and Abdominal Wall" },
    { value: "endocrine_surgery", label: "Endocrine Surgery" },
    { value: "breast_surgery", label: "Breast Surgery" },
    { value: "surgical_oncology", label: "Surgical Oncology" },
    { value: "vascular_surgery", label: "Vascular Surgery" },
    { value: "transplant_surgery", label: "Transplant Surgery" },
    { value: "minimally_invasive_surgery", label: "Minimally Invasive Surgery" },
    { value: "critical_care", label: "Critical Care" }
  ],
  anesthesiology: [
    { value: "general_anesthesiology", label: "General Anesthesiology" },
    { value: "cardiac_anesthesia", label: "Cardiac Anesthesia" },
    { value: "thoracic_anesthesia", label: "Thoracic Anesthesia" },
    { value: "obstetric_anesthesia", label: "Obstetric Anesthesia" },
    { value: "pediatric_anesthesia", label: "Pediatric Anesthesia" },
    { value: "neuro_anesthesia", label: "Neuro Anesthesia" },
    { value: "vascular_anesthesia", label: "Vascular Anesthesia" },
    { value: "trauma_and_critical_care", label: "Trauma and Critical Care" },
    { value: "regional_anesthesia_and_pain", label: "Regional Anesthesia and Pain" },
    { value: "icu_crisis_and_ethics_considerations", label: "ICU Crisis and Ethics Considerations" }
  ]
};

export async function getSpecialtyDetails(objectId) {
  try {
    const Specialty = Parse.Object.extend("Specialty");
    const query = new Parse.Query(Specialty);
    return await query.get(objectId);
  } catch (error) {
    console.error("Error fetching specialty details:", error);
    return null;
  }
}

export function getSpecialtyRefId(specialtyRef) {
  if (!specialtyRef) return "";
  if (typeof specialtyRef === "string") return specialtyRef;
  return specialtyRef.id || specialtyRef.objectId || "";
}

export function getSpecialtyOptionLabel(specialty) {
  return specialty?.get("displayName") || specialty?.get("specialtyId") || specialty?.id || "";
}

export function getCaseSpecialtyGroup(item) {
  const specialtyRef = item.get("specialtyRef");
  const specialtyRefId = getSpecialtyRefId(specialtyRef);
  const matchedSpecialty = state.specialties.find(specialty => specialty.id === specialtyRefId)
    || state.specialties.find(specialty => specialty.get("specialtyId") === item.get("specialty"));
  const pointerLabel = typeof specialtyRef?.get === "function" ? getSpecialtyOptionLabel(specialtyRef) : "";
  const legacySpecialty = item.get("specialty");
  const label = getSpecialtyOptionLabel(matchedSpecialty) || pointerLabel || legacySpecialty || "No Specialty";
  const sortLabel = label === "No Specialty" ? "zzzzzz" : label.toLowerCase();

  return {
    key: specialtyRefId || legacySpecialty || "no-specialty",
    label,
    sortLabel
  };
}

function getSpecialtyDomainKey(specialtyId) {
  const specialty = state.specialties.find(item => item.id === specialtyId);
  const displayName = (specialty?.get("displayName") || "").toLowerCase();
  const specialtyCode = (specialty?.get("specialtyId") || "").toLowerCase();
  const searchableName = `${displayName} ${specialtyCode}`;

  if (searchableName.includes("general") && searchableName.includes("surgery")) {
    return "general";
  }

  if (searchableName.includes("cardiothoracic")) {
    return "cardiothoracic";
  }

  if (searchableName.includes("anesthesiology") || searchableName.includes("anesthesia")) {
    return "anesthesiology";
  }

  return "cardiothoracic";
}

export function updateCaseDomainOptions(selectedValue) {
  const caseDomainSelect = $("caseDomain");
  const domainKey = getSpecialtyDomainKey($("specialty").value);
  const domains = caseDomainsBySpecialty[domainKey] || caseDomainsBySpecialty.cardiothoracic;

  caseDomainSelect.innerHTML = "";
  domains.forEach(domain => {
    const option = document.createElement("option");
    option.value = domain.value;
    option.textContent = domain.label;
    caseDomainSelect.appendChild(option);
  });

  if (selectedValue && domains.some(domain => domain.value === selectedValue)) {
    caseDomainSelect.value = selectedValue;
  } else {
    caseDomainSelect.value = domains[0]?.value || "";
  }
}

export async function loadSpecialties() {
  try {
    ensureInitialized();
    const Specialty = Parse.Object.extend("Specialty");
    const query = new Parse.Query(Specialty);
    query.ascending("displayName");
    console.log("Loading specialties from Specialty table...");
    state.specialties = await query.find();
    console.log("Loaded specialties:", state.specialties);

    const specialtySelect = $("specialty");
    specialtySelect.innerHTML = "";

    state.specialties.forEach(specialty => {
      const option = document.createElement("option");
      option.value = specialty.id;
      option.textContent = specialty.get("displayName") || specialty.id;

      if ((specialty.get("displayName") || "").toLowerCase().includes("cardiothoracic")) {
        state.cardiothoracicSurgeryId = specialty.id;
        option.selected = true;
      }

      specialtySelect.appendChild(option);
    });

    if (!state.cardiothoracicSurgeryId && state.specialties.length > 0) {
      state.cardiothoracicSurgeryId = state.specialties[0].id;
      specialtySelect.options[0].selected = true;
    }

    updateCaseDomainOptions();
    console.log("Specialties loaded successfully. Count:", state.specialties.length);
  } catch (error) {
    console.error("Error loading specialties:", error);
    const specialtySelect = $("specialty");
    specialtySelect.innerHTML = `<option value="">Error loading specialties: ${error.message}</option>`;
  }
}
