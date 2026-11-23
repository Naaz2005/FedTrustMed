// simpleAudit.cjs - Final audit for M32 without git dependencies
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd) {
  try {
    const out = execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
    console.log(`--- ${cmd} ---`);
    console.log(out.trim());
  } catch (e) {
    console.error(`--- ${cmd} FAILED ---`);
    console.error(e.stdout?.toString() || e.message);
  }
}

function searchInDirs(dirs, patternStr, label) {
  console.log(`\n${label}`);
  const regex = new RegExp(patternStr, 'i');
  dirs.forEach(dir => {
    walk(dir);
  });
  function walk(p) {
    if (!fs.existsSync(p)) return;
    const entries = fs.readdirSync(p, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && full.endsWith('.ts')) {
        const content = fs.readFileSync(full, 'utf-8');
        const lines = content.split(/\r?\n/);
        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            console.log(`${full}:${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

function listRoutes() {
  console.log('\n3. Route auth verification');
  const serverDir = path.join(__dirname, '..', 'server');
  function walk(p) {
    if (!fs.existsSync(p)) return;
    const entries = fs.readdirSync(p, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && full.endsWith('.ts')) {
        const content = fs.readFileSync(full, 'utf-8');
        const lines = content.split(/\r?\n/);
        lines.forEach(line => {
          const m = line.match(/router\.(get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]/i);
          if (m) {
            const method = m[1].toUpperCase();
            const route = m[2];
            const auth = /requireRole|authenticate|authMiddleware/.test(content) && /router\.(get|post|put|delete)\s*\([^,]+,\s*[^,]*requireRole/.test(line);
            console.log(`${method} ${route} -> ${auth ? 'Auth' : 'No Auth'}`);
          }
        });
      }
    }
  }
  walk(serverDir);
}

console.log('=== Final Audit Started ===');
// 1. Hard‑coded demo IDs
searchInDirs(['src', 'server'], 'demoUser|demoPatient|demoDoctor|demoAdmin', '1. Hard‑coded demo IDs');
// 2. Math.random usage
searchInDirs(['src', 'server'], 'Math\\.random', '2. Math.random usage');
// 3. Routes auth
listRoutes();
// 4. Plaintext password handling
searchInDirs(['src', 'server'], 'password', '4. Plaintext password handling');
// 5. TODO / placeholder
searchInDirs(['src', 'server'], 'TODO|placeholder', '5. TODO / placeholder');
process.chdir(__dirname + "\\..\");
console.log('\n6. npm test');
run('npm test --silent');
console.log('\n6b. npm run test:restart');
run('npm run test:restart --silent');
console.log('\n6c. tsc --noEmit');
run('npx tsc --noEmit');
console.log('\n6d. vite build');
run('npx vite build');
console.log('\n=== Final Audit Completed ===');
