import { prisma } from '../src/lib/prisma';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askForEmail(): Promise<string> {
  return new Promise((resolve) => {
    rl.question('Enter email address to add to AdminWhitelist: ', (email) => {
      resolve(email.trim());
    });
  });
}

async function main() {
  try {
    const email = await askForEmail();
    
    if (!email) {
      console.error('Email address is required');
      process.exit(1);
    }

    console.log(`Attempting to add ${email} to the AdminWhitelist...`);

    const result = await prisma.adminWhitelist.upsert({
      where: { email },
      update: {},
      create: { email },
    });

    console.log(`Successfully added ${email} to the AdminWhitelist.`);
    console.log(result);
  } catch (error) {
    console.error('Error adding admin to whitelist:', error);
    process.exit(1);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main();
