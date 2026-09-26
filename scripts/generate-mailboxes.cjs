const nodemailer = require('nodemailer');

async function testAccounts() {
  console.log('Generating sender Ethereal account...');
  const sender = await nodemailer.createTestAccount();
  console.log('Sender Email:', sender.user);
  console.log('Sender Pass:', sender.pass);
  console.log('Sender SMTP:', sender.smtp.host, sender.smtp.port);
  console.log('Sender IMAP:', sender.imap.host, sender.imap.port);

  console.log('Generating receiver Ethereal account...');
  const receiver = await nodemailer.createTestAccount();
  console.log('Receiver Email:', receiver.user);
  console.log('Receiver Pass:', receiver.pass);
  console.log('Receiver IMAP:', receiver.imap.host, receiver.imap.port);

  return { sender, receiver };
}

testAccounts().catch(console.error);
