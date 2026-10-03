# Shizuha platform packages

Shared Python and frontend libraries used by the Shizuha platform.
Each directory retains its package metadata and upstream source attribution.
See SOURCE.json for the reviewed source snapshot and export transformations.

JavaScript libraries: run `npm ci` and `npm run build` inside the package, then
`npm pack`. Python libraries: install their package directories with pip.
Release frontend repositories include reviewed, built npm tarballs so deploying
the platform does not require access to a private package registry.

Licensed under MIT; see LICENSE and the per-package metadata.
