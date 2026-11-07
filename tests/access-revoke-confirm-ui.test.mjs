import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/TeamManagement.jsx',import.meta.url),'utf8');

test('access: revocation is confirmed with the intended invite identity',()=>{
 assert.doesNotMatch(src,/window\.confirm\(/);
 assert.match(src,/\[pendingRevoke, setPendingRevoke\] = useState\(null\)/);
 assert.match(src,/setPendingRevoke\(\{id:item\.id,email:item\.email/);
 assert.match(src,/<ConfirmSheet open=\{!!pendingRevoke\}/);
 assert.match(src,/title="Revogar convite\?"/);
 assert.match(src,/tone="danger"/);
});
test('access: server controls revocation, fail-safe on errors and no optimistic removal',()=>{
 assert.match(src,/if \(!pendingRevoke \|\| revokingId\) return/);
 assert.match(src,/const invitationId=pendingRevoke\.id/);
 assert.match(src,/apiFetch\('\/api\/invitations\/revoke'/);
 assert.match(src,/unitId:membership\.unitId,invitationId/);
 assert.match(src,/if \(!response\.ok\) throw new Error/);
 assert.match(src,/await refreshInvitations\(\);\s*setPendingRevoke\(null\)/);
});
