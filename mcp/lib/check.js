const Q = 1e6; // quantize vertex coords to merge near-duplicate edge endpoints
const vkey = (v) => `${Math.round(v[0] * Q)},${Math.round(v[1] * Q)},${Math.round(v[2] * Q)}`;

export const checkGeom = (geom, geomType, bed) => {
  const dimensions = geom.measureDimensions();
  const bbox = geom.measureBoundingBox();
  const base = { bbox, dimensions, notes: [] };
  const fitsBed = bed ? dimensions.every((d, i) => d <= bed[i]) : true;

  if (geomType !== "geom3") {
    return {
      ...base,
      empty: true,
      manifold: false,
      watertight: false,
      openEdges: 0,
      fitsBed,
      notes: ["check only supports geom3"],
    };
  }

  const polys = geom.toPolygons();
  if (polys.length === 0) {
    return { ...base, empty: true, manifold: false, watertight: false, openEdges: 0, fitsBed };
  }

  const edges = new Map();
  for (const poly of polys) {
    const vs = poly.vertices;
    for (let i = 0; i < vs.length; i++) {
      const a = vkey(vs[i]);
      const b = vkey(vs[(i + 1) % vs.length]);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  let openEdges = 0;
  for (const count of edges.values()) if (count !== 2) openEdges++;
  const watertight = openEdges === 0;

  base.notes.push("wall-thickness analysis not implemented (deferred)");
  return { ...base, empty: false, manifold: watertight, watertight, openEdges, fitsBed };
};
