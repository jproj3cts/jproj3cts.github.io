/* ==========================================================================
   Wavelength → display colour
   ========================================================================== */

export function wavelengthColour(nm) {
  if (nm < 380) return '#9d6bff';
  if (nm > 780) return '#ff5c8a';
  let r = 0, g = 0, b = 0;
  if (nm < 440)      { r = -(nm-440)/60; b = 1; }
  else if (nm < 490) { g = (nm-440)/50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm-510)/20; }
  else if (nm < 580) { r = (nm-510)/70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm-645)/65; }
  else               { r = 1; }
  let f = 1;
  if (nm < 420) f = 0.35 + 0.65*(nm-380)/40;
  else if (nm > 700) f = 0.35 + 0.65*(780-nm)/80;
  const h = v => Math.round(255 * Math.pow(Math.max(0, v*f), 0.8)).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

