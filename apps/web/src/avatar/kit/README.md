LEVEX avatar kit v1 (vector). Pipeline: GenerateImage (edit of bald master, same pose) -> ECC registration -> palette labelling (canonical flat colours, edge-propagation, label smoothing) -> layer extraction by label/region masks -> per-colour binary vtracer trace (spline) -> svgo.
Stack (z asc): hair_back 10, body 20, head 30, face 40, hair_front 50, accessory 60. viewBox 0 0 864 1152 for all layers.
Recolor by exact fill replacement: see manifest.json -> recolor.
work/run_all.sh rebuilds svg/ from raw/ (needs work/lab etc: run work scripts in order).
