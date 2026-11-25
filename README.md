# Zoho Blueprint GitHub Pages

Upload the CONTENTS of this folder directly to the GitHub repository root.

Example URLs:
https://hanzy98.github.io/CRM/verify-age/
https://hanzy98.github.io/CRM/verify-residency/

Each page includes:
- Full formatted instructions
- Zoho EmbeddedApp SDK
- **Previous state** (red) — moves the record **one stage back**
- **I understand — continue** — moves **one stage forward** via `ZOHO.CRM.BLUEPRINT.proceed()`

## One-step back (best setup)

Zoho has no `setState()` in widgets. The record only moves when a **Blueprint transition** runs.

When **Previous state** is clicked, the widget:

1. Reads the record’s blueprint (`getBluePrint`), including process name (e.g. **Admissions New**).
2. Loads that blueprint’s stages from Zoho (`settings/blueprints` API) and orders them from the blueprint canvas layout.
3. Finds the previous stage in that order and runs a transition whose destination matches it.

`workflow-order.js` is only a **fallback** if settings API access is blocked. Set `BLUEPRINT_CONFIG.processName` to **Admissions New**.

### Zoho checklist

- [ ] Widget users need permission to use CRM HTTP / blueprint settings (Developer Permissions profile).
- [ ] For each stage (from the 2nd onward), add a **back transition** to the previous stage in the process.
- [ ] Test **Previous state** on a record in the middle of the flow.

Forward is unchanged: **continue** uses the transition you opened the widget from (`proceed()`).