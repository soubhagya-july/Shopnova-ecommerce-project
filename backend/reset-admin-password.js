import { MongoClient } from 'mongodb';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const scrypt = promisify(scryptCallback);

class ResetError extends Error {}

async function promptHiddenPassword() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new ResetError('Run this command in an interactive PowerShell terminal.');
  }

  stdout.write('New password (12–128 characters; input hidden): ');
  stdin.setEncoding('utf8');
  stdin.setRawMode(true);
  stdin.resume();

  try {
    return await new Promise((resolve, reject) => {
      let password = '';
      const cleanup = () => stdin.removeListener('data', onData);
      const finish = (callback, value) => {
        cleanup();
        callback(value);
      };
      const onData = chunk => {
        for (const character of chunk) {
          if (character === '\u0003') {
            finish(reject, new ResetError('Password reset cancelled.'));
            return;
          }
          if (character === '\r' || character === '\n') {
            stdout.write('\n');
            finish(resolve, password);
            return;
          }
          if (character === '\u007f' || character === '\b') {
            password = password.slice(0, -1);
            continue;
          }
          if (character >= ' ') password += character;
        }
      };
      stdin.on('data', onData);
    });
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
  }
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new ResetError('MONGODB_URI is not set. Set it in PowerShell, then run this command again.');
  }

  const prompt = createInterface({ input: stdin, output: stdout });
  let email;
  try {
    email = (await prompt.question('Admin email: ')).trim().toLowerCase();
  } finally {
    prompt.close();
  }

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ResetError('Enter a valid admin email address.');
  }

  const password = await promptHiddenPassword();
  if (password.length < 12 || password.length > 128) {
    throw new ResetError('Password must be between 12 and 128 characters.');
  }

  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    const database = client.db(process.env.MONGODB_DB || 'shopnova');
    const user = await database.collection('users').findOne({ email }, { projection: { _id: 1 } });
    if (!user) throw new ResetError('No account found for that email.');

    await database.collection('users').updateOne(
      { _id: user._id },
      { $set: { passwordHash: hash.toString('hex'), passwordSalt: salt.toString('hex') } }
    );
    await database.collection('sessions').deleteMany({ userId: user._id });
    stdout.write('Password updated. Existing sessions were signed out.\n');
  } finally {
    await client.close();
  }
}

main().catch(error => {
  if (error instanceof ResetError) {
    console.error(error.message);
  } else {
    console.error('Password reset failed. Check the MongoDB connection and try again.');
  }
  process.exitCode = 1;
});
