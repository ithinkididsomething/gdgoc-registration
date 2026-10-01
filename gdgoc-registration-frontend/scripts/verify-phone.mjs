/**
 * Proves the phone-field fix. Simulates a user typing 9876543210 one keypress
 * at a time, replaying each keystroke through the OLD and NEW implementations
 * of the display/submit round trip.
 *
 * Run: node scripts/verify-phone.mjs
 */

const digitsOnly = (v) => v.replace(/\D/g, '');

// Before: strips a leading "91" only once the number is long enough to be
// unambiguous, so short in-progress values keep the prefix.
const OLD = (v) => {
  const d = digitsOnly(v);
  return d.startsWith('91') && d.length > 10 ? d.slice(2) : d;
};
// After: always takes the last 10 digits, which is stable at every length.
const NEW = (v) => digitsOnly(v).slice(-10);

function type(display, store, keystrokes) {
  let state = '';
  const trace = [];
  for (const key of keystrokes) {
    const shown = display(state); // what the DOM actually shows
    const digits = digitsOnly(shown + key).slice(0, 10);
    state = store(digits); // onChange -> set()
    trace.push(`${shown}|${key}`);
  }
  return { final: display(state), trace };
}

const keys = '9876543210'.split('');

const oldRun = type(OLD, (d) => `+91 ${d}`, keys);
const newRun = type(NEW, (d) => d, keys);

console.log('Typing 9876543210, one keypress at a time\n');
console.log('OLD  (prefix stored, length-guarded strip)');
console.log('     ' + oldRun.trace.join(' -> '));
console.log('     final: ' + JSON.stringify(oldRun.final) + `  (${oldRun.final.length} chars)`);
console.log('     correct? ' + (oldRun.final === '9876543210' ? 'YES' : 'NO  <-- field unusable'));
console.log('');
console.log('NEW  (digits stored, last-10 slice)');
console.log('     ' + newRun.trace.join(' -> '));
console.log('     final: ' + JSON.stringify(newRun.final) + `  (${newRun.final.length} chars)`);
console.log('     correct? ' + (newRun.final === '9876543210' ? 'YES' : 'NO'));
console.log('');
console.log('Value submitted with the fix: "+91 ' + newRun.final + '"');

// Idempotence: display() must be a fixed point, or the value drifts on re-render.
let stable = true;
for (let n = 0; n <= 10; n += 1) {
  const once = NEW(String(n).padStart(n, '9'));
  if (NEW(once) !== once) stable = false;
}
console.log('NEW idempotent for every partial length: ' + (stable ? 'YES' : 'NO'));

// Autofill path: the server may hand back a prefixed number.
console.log(
  'NEW handles server value "+91 9876543210": ' +
    JSON.stringify(NEW('+91 9876543210')) +
    (NEW('+91 9876543210') === '9876543210' ? '  correct' : '  WRONG'),
);
