// The durable ship is the rollback boundary for a failed or abandoned sortie.
export const shipFields=['resources','hull','maxHull','tiles','facilities','nextId','kills','earned','shots','fleet'];
export function captureShip(g){return Object.fromEntries(shipFields.map(k=>[k,structuredClone(g[k])]));}
