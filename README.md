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

Zoho has no `setState()` in widgets. The record only moves when a **Blueprint transition** runs. This project does the next best thing:

1. **`workflow-order.js`** — ordered list of stage names (must match Zoho picklist values exactly).
2. **Widget** — reads current stage from `getBluePrint` → finds the previous name in that list → runs whichever transition’s destination is that previous stage.
3. **Zoho Blueprint** — on every stage except the first, add **one back transition** to the previous stage. The transition **name does not matter**; the destination stage does.

### Zoho checklist

- [ ] Copy stage names from Blueprint into `workflow-order.js` in process order.
- [ ] For each stage (from the 2nd onward), add a transition **to the previous stage** in the list.
- [ ] Publish the updated GitHub Pages files and test on a record in the middle of the flow.

Forward is unchanged: **continue** uses the transition you opened the widget from (`proceed()`).