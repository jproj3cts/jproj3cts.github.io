import { pdfDoc } from '../../../jekray/src/io/pdf.js';
import { designPro } from '../../../jekray/src/ui/pro.js';
import { track } from '../../../jekray/src/io/usage.js';
import { film, filmTolResult, filmYieldResult } from '../ui/designer.js';
import { toast } from '../ui/bar.js';
import { downloadBlob, filmFileName } from './files.js';
import { filmSpecRecs } from './film-pages.js';

/* ==========================================================================
   The coating specification saved from JEKfilm: the pages (io/film-pages.js) with the coating's own tolerance run and
   yield when it has them. JEKrayPro's, as JEKray's design reports are.
   ========================================================================== */
export const filmSpecPdf = (f, o) => {
  o = Object.assign({}, o);
  // the coating here: its tolerance run and yield, if it has one (another coating: only what it is given)
  if (o.tol === undefined && f === film) { o.tol = filmTolResult(); o.yield = filmYieldResult(); }
  return pdfDoc(filmSpecRecs(f, o), f.name + ' coating specification', o);
};
/* Make it › Coating specification (PDF): JEKrayPro's */
export async function saveFilmSpec() {
  if (!designPro('make a coating specification')) return false;
  try {
    const name = filmFileName(film.name + ' coating specification', 'pdf');
    downloadBlob(name, await filmSpecPdf(film));
    toast('Saved ' + name); track('report', 'film-spec');
    return true;
  } catch (err) { toast('Could not write the PDF: ' + err.message, true); return false; }
}
