import {spawnSync} from 'node:child_process';
// Explicit isolated project. Never inherit a production Firebase target.
const files=['auth-session-mobile','production-audit-emulator','preparation-emulator','preparation-mobile','preparation-save-mobile','catalog-display-name-mobile','global-catalog-emulator','access-mobile','stock-conference-emulator','stock-conference-mobile','adversarial-emulator','v31-emulator','v4-emulator','catalog-56-emulator','release-roles-emulator','unit-management-emulator','checklists-emulator','checklists-mobile','checklists-fullstack-emulator','v4-mobile','architecture-emulator'];
const command=process.execPath+' --test --test-concurrency=1 '+files.map(f=>'tests/'+f+'.test.mjs').join(' ');
const result=spawnSync(process.execPath,['node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-triamicci-v31','--only','auth,firestore,storage',command],{stdio:'inherit',env:{...process.env,GCLOUD_PROJECT:'demo-triamicci-v31',GOOGLE_CLOUD_PROJECT:'demo-triamicci-v31'}});
if(result.error)throw result.error;process.exit(result.status??1);
