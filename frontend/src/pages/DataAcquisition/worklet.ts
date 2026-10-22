/**
 * Where the recorder's AudioWorklet is loaded from. Raise the version whenever public/recorder-processor.js
 * changes how it talks to the page: a browser that kept an older copy would otherwise run it against the new page.
 */
export const RECORDER_WORKLET_URL = '/recorder-processor.js?v=2'
