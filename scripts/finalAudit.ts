// finalAudit.ts - Performs final audit for M32
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function run(cmd: string) {
  try {
    const out = execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
    console.log(`--- ${cmd} ---`);
    console.log(out.trim());
  } catch (e: any) {
    console.error(`--- ${cmd} FAILED ---`);
    console.error(e.stdout?.toString() || e.message);
  }
}

function grep(pattern: string, dirs: string[]) {
  // Recursively search .ts files in given directories for the pattern
  const regex = new RegExp(pattern, 'i');
  for (const dir of dirs) {
    const walk = (p: string) => {
      const entries = fs.readdirSync(p, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(p, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && fullPath.endsWith('.ts')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split(/\r?\n/);
          lines.forEach((line, idx) => {
            if (regex.test(line)) {
              console.log(`${fullPath}:${idx + 1}: ${line.trim()}`);
            }
          });
        }
      }
    };
    walk(dir);
  }
}
  const files = dirs.map(d => `"${d}"`).join(' ');
  run(`git grep -nEi "${pattern}" ${files}`);
}

console.log('=== Final Audit Started ===');

// 1. Hard‑coded demo IDs
console.log('\n1. Hard‑coded demo IDs');
grep('demoUser|demoPatient|demoDoctor|demoAdmin', ['src', 'server']);

// 2. Math.random usage on displayed metrics
console.log('\n2. Math.random usage');
grep('Math\\.random', ['src', 'server']);

// 3. List routes and auth requirement
console.log('\n3. Route auth verification');
try {
  const routeFiles = execSync('git ls-files "server/**/*.ts"', { encoding: 'utf-8' })
    .trim()
    .split(/\r?\n/);
  for (const file of routeFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const routeMatch = line.match(/router\.(get|post|put|delete)\s*\(\s*['"]([^'\"]+)['"]/i);
      if (routeMatch) {
        const method = routeMatch[1].toUpperCase();
        const path = routeMatch[2];
        const auth = /requireRole|authenticate|authMiddleware/.test(content) && /router\.(get|post|put|delete)\s*\([^,]+,\s*[^,]*requireRole/.test(line);
        console.log(`${method} ${path} -> ${auth ? 'Auth' : 'No Auth'}`);
      }
    }
  }
} catch (e) {
  console.error('Error scanning routes', e);
}

// 4. Plaintext password handling
console.log('\n4. Plaintext password handling');
grep('password', ['src', 'server']);

// 5. TODO or placeholder
console.log('\n5. TODO / placeholder');
grep('TODO|placeholder', ['src', 'server']);

// 6. Run test and build commands
console.log('\n6. npm test');
run('npm test --silent');
console.log('\n6b. npm run test:restart');
run('npm run test:restart --silent');
console.log('\n6c. tsc --noEmit');
run('npx tsc --noEmit');
console.log('\n6d. vite build');
run('npx vite build');

console.log('\n=== Final Audit Completed ===');
