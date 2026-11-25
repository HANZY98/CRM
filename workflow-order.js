/**
 * Optional fallback if the widget cannot load blueprint settings from Zoho.
 * On a real record, the widget prefers process_info.name (e.g. "Admissions New")
 * and loads stage order from the Blueprint API automatically.
 */
window.BLUEPRINT_CONFIG = {
  processName: "Admissions New",
  defaultModule: "Leads",
};

window.BLUEPRINT_WORKFLOW_ORDER = [
  "Admissions New",
  "Verify Age",
  "Verify Residency",
  "Verify Applicant Declarations",
  "Verify Course Selection",
  "Verify Course Motivation",
  "Verify Education",
  "Verify Work Experience",
  "Verify English Proficiency",
  "Verify Criminality",
  "Verify Disability",
  "Verify RPL",
  "Checking RPL Payment",
  "How To Send Invoice For RPL",
  "Verify Applicant Has Paid",
  "Send Payment",
  "Sending Enrolment Contract",
  "Checking Enrolment Document Is Signed",
  "Post Assessment",
  "Verify Post Assessment",
  "Change Course",
  "Send Totara",
];