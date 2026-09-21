'use strict';
// Sets a new admin code and signs everybody out.
//   npm run set-code                 -> generates a random code and prints it
//   npm run set-code -- MyNewCode123 -> uses the code you give
require('../lib/env');
const auth = require('../lib/auth');

(async () => {
  const arg = process.argv[2];
  const code = arg || auth.generateCode();
  const problem = auth.validateNewCode(code);
  if (problem) {
    console.error('Xato: ' + problem);
    process.exit(1);
  }
  await auth.setAdminCode(code);
  console.log('\n  Yangi admin kodi:  ' + code + '\n');
})().catch((e) => { console.error(e); process.exit(1); });
