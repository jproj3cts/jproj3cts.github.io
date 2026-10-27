/* The tasters (io/tasters.js; jek-api src/tasters.js keeps the count): the JEKrayPro work a free account may try a
   few times a month, by the name its gate gives it (ui/pro.js designPro, ui/scripts.js), and what each is called. */
export const TASTER_NAMES = { optimise: 'optimiser runs', tolerance: 'tolerance runs', script: 'script runs', report: 'design reports', drawing: 'drawing saves',
  design: 'design exports', data: 'Excel, NumPy or MATLAB exports' };
// the work, as the gates name it, to its taster
export function tasterOf(what) {
  const w = String(what || '');
  return /optimise a design|search for designs|substitute glasses/.test(w) ? 'optimise' : /tolerance a design/.test(w) ? 'tolerance' : /run scripts/.test(w) ? 'script'
    : /design report/.test(w) ? 'report' : /drawings/.test(w) ? 'drawing' : /export a design/.test(w) ? 'design' : /export (data as|several kinds|everything)/.test(w) ? 'data' : '';
}
