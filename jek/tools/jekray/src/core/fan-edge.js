/* A ray fan's field is a uniform top-hat of its width; its edge rises over a distance (10% to 90%). Automatically just
   enough for the field grid to hold it without ringing: 8% of the width on 256 points, less on a finer grid. Or as set,
   0 for a hard edge (which rings on the grid, about 1% across the middle). */
export const fanEdgeAuto = (width, popN = 256) => +(0.08 * width * 256 / (popN || 256)).toPrecision(3);
// a sweep of the edge sets it, whether or not it was automatic
export const fanEdge = src => src.softAuto !== false && !(src.sweeps && src.sweeps.soft) ? fanEdgeAuto(src.width || 0, src.popN) : Math.max(0, src.soft || 0);
