/**
 * Realistic delivery-status notifications as IMAP sync sees them:
 * `headers` is the fetched header subset, `body` is BODY[TEXT] (raw MIME body).
 * Addresses and hosts are fictitious.
 */

export const gmailHardBounce = {
  fromEmail: "mailer-daemon@googlemail.com",
  subject: "Delivery Status Notification (Failure)",
  headers:
    'Content-Type: multipart/report; boundary="000000000000abc123"; report-type=delivery-status\r\n' +
    "X-Failed-Recipients: nobody@acme-example.com\r\n" +
    "Auto-Submitted: auto-replied\r\n\r\n",
  body: `--000000000000abc123
Content-Type: text/plain; charset="UTF-8"

** Address not found **

Your message wasn't delivered to nobody@acme-example.com because the address couldn't be found, or is unable to receive mail.

Learn more here: https://support.google.com/mail/?p=NoSuchUser

The response was:

The email account that you tried to reach does not exist. Please try double-checking the recipient's email address for typos or unnecessary spaces.

--000000000000abc123
Content-Type: message/delivery-status

Reporting-MTA: dns; googlemail.com
Received-From-MTA: dns; alex@pool-one.example
Arrival-Date: Thu, 05 Nov 2026 14:02:11 -0800 (PST)
X-Original-Message-ID: <a1b2c3@pool-one.example>

Final-Recipient: rfc822; nobody@acme-example.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does
 not exist. Please try double-checking the recipient's email address for typos
 or unnecessary spaces. https://support.google.com/mail/?p=NoSuchUser
 d75a77b69052e-4b0c1d2e3f4si12345678qtb.123 - gsmtp
Last-Attempt-Date: Thu, 05 Nov 2026 14:02:12 -0800 (PST)

--000000000000abc123
Content-Type: message/rfc822

Return-Path: <alex@pool-one.example>
From: Alex <alex@pool-one.example>
To: nobody@acme-example.com
Subject: Quick idea for Acme
Message-ID: <a1b2c3@pool-one.example>
Date: Thu, 05 Nov 2026 22:02:10 +0000
Content-Type: text/plain; charset=utf-8

Hi there, quick idea for Acme.
--000000000000abc123--
`,
};

export const gmailDelayed = {
  fromEmail: "mailer-daemon@googlemail.com",
  subject: "Delivery Status Notification (Delay)",
  headers: 'Content-Type: multipart/report; boundary="zzz111"; report-type=delivery-status\r\n\r\n',
  body: `--zzz111
Content-Type: text/plain; charset="UTF-8"

** Message not delivered yet **

Gmail will keep trying to deliver your message to slow@busy-example.net for the next 46 hours.

--zzz111
Content-Type: message/delivery-status

Reporting-MTA: dns; googlemail.com

Final-Recipient: rfc822; slow@busy-example.net
Action: delayed
Status: 4.4.7
Diagnostic-Code: smtp; 421 4.4.7 Try again later
Will-Retry-Until: Sat, 07 Nov 2026 12:00:00 -0800 (PST)

--zzz111--
`,
};

export const outlookHardBounce = {
  fromEmail: "postmaster@outlook.com",
  subject: "Undeliverable: Quick idea for Contoso",
  headers:
    'Content-Type: multipart/report; report-type=delivery-status;\r\n\tboundary="_000_BN8PR12MB_"\r\n' +
    "X-MS-Exchange-Message-Is-Ndr: \r\n\r\n",
  body: `--_000_BN8PR12MB_
Content-Type: multipart/alternative; differences=Content-Type;
\tboundary="_002_BN8PR12MB_"

--_002_BN8PR12MB_
Content-Type: text/plain; charset="us-ascii"
Content-Transfer-Encoding: quoted-printable

Your message to jane.doe@contoso-example.com couldn't be delivered.
jane.doe wasn't found at contoso-example.com.

Sam                Office 365                jane.doe
Action Required                                      Recipient

Unknown To address

--_002_BN8PR12MB_
Content-Type: text/html; charset="us-ascii"
Content-Transfer-Encoding: quoted-printable

<html><body><p>Your message to jane.doe@contoso-example.com couldn't be delivered.</p></body></html>

--_002_BN8PR12MB_--

--_000_BN8PR12MB_
Content-Type: message/delivery-status

Reporting-MTA: dns;BN8PR12MB1234.namprd12.prod.outlook.com
Received-From-MTA: dns;pool-two.example
Arrival-Date: Thu, 5 Nov 2026 22:10:01 +0000

Original-Recipient: rfc822;jane.doe@contoso-example.com
Final-Recipient: rfc822;jane.doe@contoso-example.com
Action: failed
Status: 5.1.10
Diagnostic-Code: smtp;550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient jane.doe@contoso-example.com not found by SMTP address lookup

--_000_BN8PR12MB_
Content-Type: text/rfc822-headers

Return-Path: sam@pool-two.example
From: Sam <sam@pool-two.example>
To: <jane.doe@contoso-example.com>
Subject: Quick idea for Contoso
Message-ID: <x9y8z7@pool-two.example>

--_000_BN8PR12MB_--
`,
};

export const eximHardBounce = {
  fromEmail: "Mailer-Daemon@server123.web-hosting.com",
  subject: "Mail delivery failed: returning message to sender",
  headers:
    "X-Failed-Recipients: bob@gone-example.org\r\n" +
    "Auto-Submitted: auto-replied\r\n" +
    "Content-Type: text/plain; charset=us-ascii\r\n\r\n",
  body: `This message was created automatically by mail delivery software.

A message that you sent could not be delivered to one or more of its
recipients. This is a permanent error. The following address(es) failed:

  bob@gone-example.org
    host mx.gone-example.org [203.0.113.7]
    SMTP error from remote mail server after RCPT TO:<bob@gone-example.org>:
    550 5.1.1 <bob@gone-example.org>: Recipient address rejected: User unknown in virtual mailbox table

------ This is a copy of the message, including all the headers. ------

Return-path: <jo@pool-three.example>
Received: from [10.0.0.1] (port=51234 helo=pool-three.example)
\tby server123.web-hosting.com with esmtpsa
Message-ID: <exim-orig-1@pool-three.example>
From: Jo <jo@pool-three.example>
To: bob@gone-example.org
Subject: Hello Bob

Hi Bob, quick idea.
`,
};

/** Exim without X-Failed-Recipients (some cPanel configs strip it). */
export const eximPlainNoHeader = {
  fromEmail: "mailer-daemon@mail.example-host.net",
  subject: "Mail delivery failed: returning message to sender",
  headers: "Content-Type: text/plain; charset=us-ascii\r\n\r\n",
  body: `This message was created automatically by mail delivery software.

A message that you sent could not be delivered to one or more of its
recipients. This is a permanent error. The following address(es) failed:

  carol@closed-example.com
    Mailbox is disabled (account has been disabled)

------ This is a copy of the message, including all the headers. ------

Message-ID: <exim-orig-2@pool-three.example>
`,
};
