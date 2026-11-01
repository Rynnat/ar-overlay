# AR Overlay

A phone-browser AR experiment: a cube hidden inside a box is drawn over the camera view.

**Question:** when the object inside moves, how wrong does tracking from the outside get?

**Experiment:**
1. With the cube centered in the box, the overlay lines up.
2. Shake the box and the overlay drifts.
3. The error is compared against a precomputed envelope.

**Live demo:** https://rynnat.github.io/ar-overlay/app/

## Contents

- `app/`: web app (OpenCV.js 4.9.0)
- `asama0/v2/`: CadQuery model (`kutu.py`), STLs and `geometri.json`

## Status

v0, markerless: the top face of a dark box on white paper is detected and its pose is estimated with solvePnP (IPPE_SQUARE). No camera calibration yet; the field of view is set by hand. Results: pending.
