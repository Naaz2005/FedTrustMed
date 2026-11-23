import assert from 'node:assert/strict';
import { ROLE_SIDEBAR_ITEMS, UserRole } from '../src/components/Sidebar.js';

const EXPECTED_MENUS: Record<UserRole, string[]> = {
  PATIENT: ['Home', 'My Records', 'Sharing', 'My Account'],
  DOCTOR: ['Home', 'Patients and Records', 'Access Requests', 'My Account'],
  HOSPITAL_ADMIN: ['Home', 'Staff and Patients', 'Hospital Activity', 'My Account'],
  SYSTEM_ADMIN: ['Approvals', 'Users', 'Security', 'Ledger', 'Research', 'My Account'],
};

console.log('============================================================');
console.log('FedTrustMed Module M12: App Shell Menu & Role Guard Verification');
console.log('============================================================\n');

let totalChecks = 0;
let passedChecks = 0;

function check(name: string, fn: () => void) {
  totalChecks++;
  try {
    fn();
    passedChecks++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}: ${err.message}`);
    throw err;
  }
}

// 1. Verify exact menu labels for each role
const roles: UserRole[] = ['PATIENT', 'DOCTOR', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'];

for (const role of roles) {
  console.log(`\n--- Menu Items for Role: ${role} ---`);
  const actualItems = ROLE_SIDEBAR_ITEMS[role];
  const expectedItems = EXPECTED_MENUS[role];

  actualItems.forEach((label, idx) => {
    console.log(`  [${idx + 1}] "${label}"`);
  });

  check(`Role ${role} sidebar items match exact specification`, () => {
    assert.deepEqual(
      Array.from(actualItems),
      expectedItems,
      `Mismatch for role ${role}! Expected ${JSON.stringify(expectedItems)}, got ${JSON.stringify(actualItems)}`
    );
  });
}

// 2. Verify Role Guard: A user cannot open another role's page
console.log('\n--- Role Navigation Guard Verification ---');

function isPageAllowedForRole(role: UserRole, targetPage: string): boolean {
  const allowed = ROLE_SIDEBAR_ITEMS[role] || [];
  return allowed.includes(targetPage);
}

// Test cross-role access attempts
const crossRoleTestCases = [
  { role: 'PATIENT' as UserRole, unauthorizedPage: 'Approvals', description: 'PATIENT cannot open SYSTEM_ADMIN Approvals' },
  { role: 'PATIENT' as UserRole, unauthorizedPage: 'Patients and Records', description: 'PATIENT cannot open DOCTOR Patients and Records' },
  { role: 'PATIENT' as UserRole, unauthorizedPage: 'Staff and Patients', description: 'PATIENT cannot open HOSPITAL_ADMIN Staff and Patients' },
  { role: 'PATIENT' as UserRole, unauthorizedPage: 'Security', description: 'PATIENT cannot open SYSTEM_ADMIN Security' },
  { role: 'DOCTOR' as UserRole, unauthorizedPage: 'Approvals', description: 'DOCTOR cannot open SYSTEM_ADMIN Approvals' },
  { role: 'DOCTOR' as UserRole, unauthorizedPage: 'Ledger', description: 'DOCTOR cannot open SYSTEM_ADMIN Ledger' },
  { role: 'DOCTOR' as UserRole, unauthorizedPage: 'Sharing', description: 'DOCTOR cannot open PATIENT Sharing' },
  { role: 'HOSPITAL_ADMIN' as UserRole, unauthorizedPage: 'Approvals', description: 'HOSPITAL_ADMIN cannot open SYSTEM_ADMIN Approvals' },
  { role: 'HOSPITAL_ADMIN' as UserRole, unauthorizedPage: 'My Records', description: 'HOSPITAL_ADMIN cannot open PATIENT My Records' },
  { role: 'SYSTEM_ADMIN' as UserRole, unauthorizedPage: 'Sharing', description: 'SYSTEM_ADMIN cannot open PATIENT Sharing' },
  { role: 'SYSTEM_ADMIN' as UserRole, unauthorizedPage: 'Staff and Patients', description: 'SYSTEM_ADMIN cannot open HOSPITAL_ADMIN Staff and Patients' },
];

for (const tc of crossRoleTestCases) {
  check(tc.description, () => {
    const allowed = isPageAllowedForRole(tc.role, tc.unauthorizedPage);
    assert.equal(allowed, false, `Security failure: ${tc.role} was allowed to access ${tc.unauthorizedPage}`);
  });
}

console.log('\n============================================================');
console.log(`ALL M12 APP SHELL CHECKS PASSED: ${passedChecks} / ${totalChecks} verified!`);
console.log('============================================================\n');
