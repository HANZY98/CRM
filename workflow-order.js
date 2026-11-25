/**
 * Stage names must match Zoho Blueprint picklist values exactly
 * (process_info.field_value from getBluePrint).
 *
 * Reorder this list to match your live process. Branches (e.g. Reject)
 * can be omitted if you do not need one-step back from them.
 */
window.BLUEPRINT_WORKFLOW_ORDER = [
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