// One hashing worker of the elaborator worker's pool: BLAKE3 label (prism-code's BLAKE3) of the bytes it is given, which it
// hands back with the label, so checking 375 MB of library runs on every core instead of one.
import { kappa } from "./blake3.mjs";
self.onmessage = ({ data: { id, bytes } }) => self.postMessage({ id, kappa: kappa(bytes), bytes }, [bytes.buffer]);
