/**
 * Admissions New — Zoho Blueprint stage names (picklist values).
 * Fallback when settings API is unavailable. Order follows the main path
 * left-to-right through the blueprint (branches included where they sit).
 */
window.BLUEPRINT_CONFIG = {
  processName: "Admissions New",
  defaultModule: "Leads",
};

window.BLUEPRINT_WORKFLOW_ORDER = [
  "Applied- StartedCheck",
  "VerifyingResidency",
  "Verify Documents",
  "Pass Criminality",
  "Verify English Proficiency",
  "VerifyingBackgroundEducation",
  "VerifyingWorkExperience",
  "VerifyingCourse Motivation",
  "VerifyingCourse Selection",
  "Change Course",
  "Post Assessment",
  "VerifyingApplicantDeclaration",
  "CheckRPL is needed",
  "InvoicingRPL",
  "EducationRPL Review",
  "InvoiceNeeded",
  "WaitingOnApplicantToPay",
  "Preparing EnrolmentContract",
  "Pending Applicant To Sign",
  "Totara Setting Up",
  "EnrolledFinished AdmissionsProcess",
  "ApplicantRejected",
  "ApplicantRestarted",
];