const MEDICAL_ABBREVIATIONS = {
  // Vital signs and measurements
  'BP': 'blood pressure',
  'HR': 'heart rate',
  'RR': 'respiratory rate',
  'SBP': 'systolic blood pressure',
  'DBP': 'diastolic blood pressure',
  'MAP': 'mean arterial pressure',
  'SpO2': 'oxygen saturation',
  'SaO2': 'arterial oxygen saturation',
  'SvO2': 'venous oxygen saturation',
  'PaO2': 'partial pressure of oxygen',
  'PaCO2': 'partial pressure of carbon dioxide',
  'HCO3': 'bicarbonate',
  'BE': 'base excess',
  'FiO2': 'fraction of inspired oxygen',

  // Labs
  'WBC': 'white blood cell count',
  'RBC': 'red blood cell count',
  'Hgb': 'hemoglobin',
  'Hct': 'hematocrit',
  'Plt': 'platelet count',
  'MCV': 'mean corpuscular volume',
  'MCH': 'mean corpuscular hemoglobin',
  'MCHC': 'mean corpuscular hemoglobin concentration',
  'RDW': 'red cell distribution width',
  'Na': 'sodium',
  'K': 'potassium',
  'Cl': 'chloride',
  'CO2': 'carbon dioxide',
  'BUN': 'blood urea nitrogen',
  'Cr': 'creatinine',
  'Glu': 'glucose',
  'Ca': 'calcium',
  'Mg': 'magnesium',
  'Phos': 'phosphate',
  'Alb': 'albumin',
  'Tbil': 'total bilirubin',
  'Dbil': 'direct bilirubin',
  'AST': 'aspartate aminotransferase',
  'ALT': 'alanine aminotransferase',
  'ALP': 'alkaline phosphatase',
  'GGT': 'gamma-glutamyl transferase',
  'LDH': 'lactate dehydrogenase',
  'CK': 'creatine kinase',
  'Troponin': 'troponin',
  'BNP': 'brain natriuretic peptide',
  'NT-proBNP': 'N-terminal pro-brain natriuretic peptide',
  'CRP': 'C-reactive protein',
  'ESR': 'erythrocyte sedimentation rate',
  'PT': 'prothrombin time',
  'INR': 'international normalized ratio',
  'PTT': 'partial thromboplastin time',
  'Fibrinogen': 'fibrinogen',
  'D-dimer': 'D-dimer',

  // Imaging and procedures
  'CT': 'computed tomography',
  'MRI': 'magnetic resonance imaging',
  'US': 'ultrasound',
  'ECHO': 'echocardiogram',
  'ECG': 'electrocardiogram',
  'EKG': 'electrocardiogram',
  'TEE': 'transesophageal echocardiogram',
  'TTE': 'transthoracic echocardiogram',
  'CXR': 'chest X-ray',
  'ABG': 'arterial blood gas',
  'VBG': 'venous blood gas',
  'CBC': 'complete blood count',
  'CMP': 'comprehensive metabolic panel',
  'LFT': 'liver function test',
  'UA': 'urinalysis',
  'CSF': 'cerebrospinal fluid',

  // Medications and units
  'mg': 'milligrams',
  'mcg': 'micrograms',
  'g': 'grams',
  'mL': 'milliliters',
  'L': 'liters',
  'IU': 'international units',
  'U': 'units',
  'PO': 'by mouth',
  'IV': 'intravenous',
  'IM': 'intramuscular',
  'SC': 'subcutaneous',
  'PR': 'per rectum',
  'SL': 'sublingual',
  'TID': 'three times daily',
  'BID': 'twice daily',
  'QID': 'four times daily',
  'QD': 'once daily',
  'QHS': 'at bedtime',
  'PRN': 'as needed',

  // Common medical terms
  'MI': 'myocardial infarction',
  'CHF': 'congestive heart failure',
  'COPD': 'chronic obstructive pulmonary disease',
  'PNA': 'pneumonia',
  'UTI': 'urinary tract infection',
  'DVT': 'deep vein thrombosis',
  'PE': 'pulmonary embolism',
  'ARDS': 'acute respiratory distress syndrome',
  'SIRS': 'systemic inflammatory response syndrome',
  'MODS': 'multiple organ dysfunction syndrome',
  'AKI': 'acute kidney injury',
  'CKD': 'chronic kidney disease',
  'DM': 'diabetes mellitus',
  'HTN': 'hypertension',
  'CAD': 'coronary artery disease',
  'PAD': 'peripheral artery disease',
  'CVA': 'cerebrovascular accident',
  'TIA': 'transient ischemic attack',
  'AF': 'atrial fibrillation',
  'VT': 'ventricular tachycardia',
  'VF': 'ventricular fibrillation',
  'SVT': 'supraventricular tachycardia',
  'AV': 'atrioventricular',
  'SA': 'sinoatrial',
  'LV': 'left ventricle',
  'RV': 'right ventricle',
  'LA': 'left atrium',
  'RA': 'right atrium',
  'Ao': 'aorta',
  'PA': 'pulmonary artery',
  'SVC': 'superior vena cava',
  'IVC': 'inferior vena cava',
  'RVOT': 'right ventricular outflow tract',
  'LVOT': 'left ventricular outflow tract',
};

const NUMBER_PATTERNS = [
  // Blood pressure: 120/80 -> one twenty over eighty
  { regex: /(\d{2,3})\/(\d{2,3})/g, replacement: (match, sys, dia) => `${numberToWords(sys)} over ${numberToWords(dia)}` },

  // Fractions: 1/2 -> one half
  { regex: /(\d+)\/(\d+)/g, replacement: (match, num, den) => `${numberToWords(num)} ${fractionToWords(den)}` },

  // Ranges: 100-200 -> one hundred to two hundred
  { regex: /(\d+)-(\d+)/g, replacement: (match, start, end) => `${numberToWords(start)} to ${numberToWords(end)}` },

  // Decimals: 12.5 -> twelve point five
  { regex: /(\d+)\.(\d+)/g, replacement: (match, whole, decimal) => `${numberToWords(whole)} point ${decimal.split('').map(d => numberToWords(d)).join(' ')}` },

  // Percentages: 95% -> ninety five percent
  { regex: /(\d+)%/g, replacement: (match, num) => `${numberToWords(num)} percent` },

  // Temperatures: 98.6F -> ninety eight point six degrees Fahrenheit
  { regex: /(\d+(?:\.\d+)?)([CF])/gi, replacement: (match, temp, unit) => `${numberToWords(temp)} degrees ${unit.toUpperCase() === 'C' ? 'Celsius' : 'Fahrenheit'}` },
];

function numberToWords(num) {
  const words = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'
  ];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const scales = ['', 'thousand', 'million', 'billion'];

  if (num === 0) return 'zero';
  if (num < 20) return words[num];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + words[num % 10] : '');
  if (num < 1000) return words[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
  for (let i = 0; i < scales.length; i++) {
    const scale = Math.pow(1000, i + 1);
    if (num < scale * 1000) {
      return numberToWords(Math.floor(num / scale)) + ' ' + scales[i] + (num % scale ? ' ' + numberToWords(num % scale) : '');
    }
  }
  return num.toString();
}

function fractionToWords(den) {
  const fractions = {
    2: 'half', 3: 'third', 4: 'quarter', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth'
  };
  return fractions[den] || `over ${numberToWords(den)}`;
}

function normalizeMedicalAbbreviations(text) {
  let normalized = text;
  for (const [abbr, full] of Object.entries(MEDICAL_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    normalized = normalized.replace(regex, full);
  }
  return normalized;
}

function normalizeNumbers(text) {
  let normalized = text;
  for (const pattern of NUMBER_PATTERNS) {
    normalized = normalized.replace(pattern.regex, pattern.replacement);
  }
  return normalized;
}

function normalizeForTTS(text) {
  if (!text) return '';

  let normalized = text;

  // Normalize medical abbreviations
  normalized = normalizeMedicalAbbreviations(normalized);

  // Normalize numbers and measurements
  normalized = normalizeNumbers(normalized);

  // Handle common punctuation for better TTS
  normalized = normalized.replace(/(\d+)\s*\/\s*(\d+)/g, '$1 over $2'); // Ensure BP format
  normalized = normalized.replace(/(\w+)\s*-\s*(\w+)/g, '$1 $2'); // Hyphenated terms
  normalized = normalized.replace(/(\w+)\s*\.\s*(\w+)/g, '$1 $2'); // Abbreviations with periods

  // Clean up extra spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

module.exports = {
  normalizeForTTS,
  normalizeMedicalAbbreviations,
  normalizeNumbers,
};