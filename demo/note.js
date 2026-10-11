let openNote = () => {};

export function bindDemoNote(fn) {
  openNote = fn;
}

/** Opens the demo note, then fails the request the UI already knows how to show. */
export function rejectDemo() {
  openNote();
  const err = new Error('demo');
  err.status = 403;
  err.code = 'demo_readonly';
  err.data = {};
  throw err;
}
