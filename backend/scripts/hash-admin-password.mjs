import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2] || '';
if (password.length < 10) {
  console.error('Password admin minimal 10 karakter.');
  process.exit(1);
}
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');
console.log(`scrypt$${salt}$${hash}`);
