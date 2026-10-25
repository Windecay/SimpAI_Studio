# Native MOSS Spectrum

Vendored from `n0va39/ComfyUI-Spectrum-KSampler`, commit
`58848d47a5b51ddcfdc72db9f4d82c7ac6cf04d5`, PR 11 against
`sorryhyun/ComfyUI-Spectrum-KSampler` (MIT, see LICENSE).
Integrated on 2026-10-26 after the 2026-10-25 native MOSS benchmark.

This contains the native MODEL adapter, shared forecast implementation and
its import dependencies. Only `SimpAIMossSpectrum` exposes it as a Studio node.
The upstream plugin initializer, node catalogue, sampler registration and
custom-loader MOSS adapter are not installed. No calibration downloads,
compilation or additional guidance are activated by this node.

Local changes: the package initializer is inert; imports of `library` and
`networks` are package-relative under `_vendor` so other plugins cannot supply
different numerics. No forecast math, model adapters or sampling scopes changed.
The optional DCW calibrator is absent in upstream's bundled subset and remains
unavailable. Unused upstream SPD/node entry points are not exposed here.

The SHA256 inventory in `source_manifest.json` records original source bytes
and normalized UTF-8/LF content hashes for cross-platform checkouts. Tests
validate the local inventory and unchanged native adapter/forecast content.
Keep this file and LICENSE with distribution.
