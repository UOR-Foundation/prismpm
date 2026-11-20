// What the edit page is told about a LexLean project: the files a check reads, and the file that is opened.
// The rule is prism-code's own (src/journey/model-files.mjs), the one a built app's page publishes its model by;
// this repository's generators (tools/) are left out as well.
import { modelFiles } from '../../src/journey/model-files.mjs';

/** { files: ['lexlean.toml', 'src/App.lex.tex', ...], entry: 'src/App.lex.tex' } for the project in `dir`. */
export function projectListing(dir) {
  const { files, entry } = modelFiles(dir, { skip: ['tools'] });
  return { files: [...files.keys()], entry };
}
