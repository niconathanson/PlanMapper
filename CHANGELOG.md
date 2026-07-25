# Changelog

The version you're running is shown at the bottom of the tool rail, under **Guide**.

## v0.4.0 — 2026-07-25

### Fixed

- **Export CSV and Export .txt did nothing in the desktop app.** They wrote the file
  through a hidden download link, and the desktop window has no download manager, so
  the click was silently dropped — the exports only ever worked in a browser. Both now
  open a proper save dialog. (Copy coords was unaffected and always worked.)

### Added

- **Editing points on a line or polygon.** Each row in the point table has a ✕ to delete
  that point, or Alt-click its handle on the plan.
- **Add points** picks drawing back up from the last point of an existing line — same
  snapping, rubber band and running total as when you first drew it. **Add at start**
  extends the other end. Enter or right-click finishes, Backspace removes the last
  point, Esc cancels. The line keeps its name, colour and place in the object list.
- **Extra lengths on a line** — vertical runs up or down from the ceiling, risers,
  service loops: anything real that an overhead plan can't show. Each has a label and a
  length, and can be pinned to a point number so it reads on the plan. They count toward
  the total, which now breaks out as *on plan / extra / total run*, and they carry
  through the object list, CSV, Copy coords and plan re-scaling.
- **Save vs Save as…** — Save now writes straight back to the file the project came
  from, with no dialog (`Ctrl+S`). Save as… picks a new location (`Ctrl+Shift+S`). The
  current file name shows in the top bar next to the unsaved-changes dot.
- **Unsaved-changes warning on close.** Closing the window with unsaved work now asks:
  Save and close / Close without saving / Cancel.
- **Version readout** under the Guide button, so it's obvious when a copy is out of date.

### Notes

- Projects have always embedded the plan image inside the `.planmapper` file — they're
  self-contained and don't depend on the original PDF/JPG staying put.

## Earlier

For v0.3.0 and before, see the [commit history](https://github.com/niconathanson/planmapper/commits/master).
