/**
 * Every word on the landing page lives here, so copy can change without
 * touching layout. Every claim must match what the product does today
 * (sources: autopilot-policy.ts, gtm-launch.ts, reply-agent.ts, rotation.ts,
 * suppression.ts). Business decisions are marked OWNER.
 */

/** OWNER: figure for the contact database (being expanded before launch). */
export const DATABASE_SIZE = "100M+";

export const LANDING = {
  meta: {
    title: "AutoGTM: You do nothing. Calls land on your calendar.",
    description: `AutoGTM's agent finds buyers in ${DATABASE_SIZE} B2B contacts, emails them, answers replies and sends interested leads your booking link. You take the calls.`,
  },

  hero: {
    eyebrow: `Outbound agent · ${DATABASE_SIZE} B2B contacts`,
    title: "You do nothing.",
    titleAccent: "Calls land on your calendar.",
    lead: `The agent finds your buyers in ${DATABASE_SIZE} B2B contacts, writes and sends every email, and answers the replies. Interested leads get your booking link and pick a time. You show up.`,
    cta: "Get started",
    hint: "Free to start. No card. We'll pick up your site the moment you're in.",
  },

  /** Schedulers the reply agent recognises (lib/booking-links.ts). */
  schedulers: {
    caption: "Leads book through the scheduler you already use",
    names: [
      "Calendly",
      "Cal.com",
      "HubSpot Meetings",
      "Google Calendar",
      "SavvyCal",
      "Chili Piper",
      "Microsoft Bookings",
      "TidyCal",
      "Acuity",
      "Reclaim",
      "Zoho Bookings",
      "YouCanBook.me",
    ],
  },

  specs: {
    caption: "How one campaign works",
    items: [
      { value: DATABASE_SIZE, label: "B2B contacts to pick from" },
      { value: "3 tiers", label: "best-fit buyers are emailed first" },
      { value: "3 emails", label: "per lead, over 5 days" },
      { value: "5¢", label: "per email sent" },
    ],
  },

  split: {
    eyebrow: "Who does what",
    title: "The agent's list is long. Yours isn't.",
    lead: "We review every new account before it sends. After that, this is the whole split.",
    you: [
      { title: "Add your website", text: "One URL. Add a note on who you sell to if you like." },
      {
        title: "Confirm the basics, once",
        text: "Company name and postal address for the email footer, and a booking link if your site doesn't have one.",
      },
      { title: "Answer what it can't", text: "When a lead asks something the agent has no answer for, you get an email." },
      { title: "Take the calls", text: "That's the job." },
    ],
    agent: [
      "Reads your website",
      "Writes your buyer profile and offers",
      "Ranks every matching buyer",
      "Writes every email for one person",
      "Sends on a safe schedule",
      "Follows up twice",
      "Reads every reply",
      "Answers what it can back up",
      "Sends your booking link",
    ],
  },

  how: {
    eyebrow: "How it works",
    title: "From URL to booked call.",
    lead: "You add the site and confirm the basics. The agent runs the rest and asks you when it's stuck.",
    steps: [
      { title: "Add your site", text: "Create an account and paste your URL. That's the setup." },
      {
        title: "It researches",
        text: "It reads your homepage and subpages, then writes your overview, three buyer personas, target industries and titles, and three offers. Usually under a minute.",
      },
      {
        title: "You confirm the basics",
        text: "Booking link (it checks your site first), company name and postal address. It never launches on a guess, and nothing sends until your account is approved.",
      },
      {
        title: "It ranks your buyers",
        text: "Every matching contact, in three priorities: your target job titles first, then other decision-makers, then everyone else in your industries. US work emails only.",
      },
      {
        title: "It writes and sends",
        text: "Three emails per lead: the first, a follow-up two days later and a last one two days after that. Weekdays, 9 to 5 Eastern, at the daily volume you set.",
      },
      {
        title: "It answers, they book",
        text: "A reply stops that lead's sequence. Interested leads get your booking link and pick a time. The meeting lands on your calendar.",
      },
    ],
  },

  agent: {
    eyebrow: "The agent",
    title: "Does the work. Knows its limits.",
    lead: "Every reply is sorted into one of 11 types. The model drafts a response, and fixed rules decide whether it sends.",
    tiles: [
      {
        title: "It only says what it can back up",
        text: "Interested leads get your booking link. Questions are answered from your knowledge base. It's told never to invent facts, numbers or customers.",
      },
      {
        title: "When it doesn't know, it asks",
        text: "You get an email: “Your agent needs you.” Answer once, tick save, and next time it answers that question itself.",
      },
      {
        title: `${DATABASE_SIZE} contacts, ranked for you`,
        text: "Your website becomes a buyer profile. Every match is queued, best fit first. You never build, buy or upload a list.",
      },
      { title: "Written at send time", text: "Short emails, each written for the person reading it. Follow-ups stay in the same thread." },
      {
        title: "Calls on your calendar",
        text: "Leads book through your own Calendly, Cal.com, HubSpot or Google booking link.",
      },
    ],
  },

  control: {
    eyebrow: "Control",
    title: "Hands off. Never locked out.",
    lead: "You set one number: emails per day. Follow-ups count toward it, and they always go out before new outreach so every lead gets all three emails on time. Pause any time, and pick how replies are handled.",
    modes: [
      { title: "Autopilot", text: "The agent replies on its own and asks you only when it's stuck." },
      { title: "Approve", text: "The agent drafts every reply and holds it until you say yes." },
      { title: "Off", text: "The agent sorts the replies. You write the answers from your inbox." },
    ],
  },

  safety: {
    eyebrow: "Safety",
    title: "Our mailboxes. Not your domain.",
    lead: "Your name goes out with every email, so we treat it that way. Autopilot sends from mailboxes AutoGTM runs. No domains to buy, no DNS to touch.",
    items: [
      {
        title: "Volume ramp, not warm-up",
        text: "A new mailbox starts at 10 a day, adds 5 a day and stops at a hard cap of 30.",
      },
      {
        title: "Paced like a person",
        text: "Weekdays, 9 to 5 Eastern, 45 to 120 seconds between sends, rotated across mailboxes.",
      },
      {
        title: "One-click unsubscribe",
        text: "In every email, with the headers inbox providers ask for. If the link can't work, the email doesn't go.",
      },
      {
        title: "Shared do-not-contact list",
        text: "Unsubscribes, hard bounces and complaints are blocked for every AutoGTM customer.",
      },
      {
        title: "CAN-SPAM footer",
        text: "Your company name and postal address on every email. Remove the address and sending stops.",
      },
      {
        title: "Reviewed accounts",
        text: "A person approves every account before it can send. You can research and draft while you wait.",
      },
    ],
  },

  /** OWNER: price per email sent (follow-ups included). Mirrors lib/usage.ts. */
  pricing: {
    eyebrow: "Pricing",
    title: "5¢ per email sent.",
    lead: "No seats, no contract, no monthly fee. You choose how many emails go out each day.",
    planName: "Pay as you go",
    price: "5¢",
    priceUnit: "per email sent",
    priceNote: "Every lead gets three emails, so each lead contacted costs 15¢. Follow-ups count as emails.",
    /** Drives the cost estimator; null hides it. */
    centsPerEmail: 5 as number | null,
    cta: "Get started",
    included: [
      "Research and targeting from your website",
      `Every matching contact in ${DATABASE_SIZE}, ranked by priority`,
      "Three emails per lead, each written for that person",
      "Sending from mailboxes we run",
      "The reply agent and Needs you",
      "One inbox for every reply",
    ],
    footnote: "6,000 emails a month reaches about 2,000 leads.",
  },

  faq: {
    eyebrow: "FAQ",
    title: "Fair questions.",
    lead: "",
    items: [
      {
        q: "Does the agent book the meeting itself?",
        a: "Through your scheduler, yes. It emails interested leads your Calendly, Cal.com, HubSpot Meetings or Google Calendar booking link. They pick a time and it lands on your calendar. AutoGTM never touches your calendar directly.",
      },
      {
        q: "Do I really do nothing?",
        a: "Almost. Add your site, confirm your company name and address, add a booking link if your site lacks one, and wait for approval. After that, answer the occasional question the agent can't, and take the calls.",
      },
      {
        q: "Will it say something wrong about my company?",
        a: "It's told never to invent facts, numbers, customers or links. It answers only from your site and the answers you save. Anything else comes to you. Want to see every reply first? Switch to Approve.",
      },
      {
        q: "Can I see the emails before they send?",
        a: "In Autopilot each email is written at send time, so there's no preview step. Use guided mode to approve sample emails first.",
      },
      {
        q: "Will this hurt my domain?",
        a: "Autopilot doesn't send from your domain. It uses mailboxes we run, capped at 30 sends per mailbox per day.",
      },
      {
        q: "Who will it email?",
        a: "Every US contact with a work email in your industries, ranked: your target job titles first, then other decision-makers, then everyone else. Anyone an AutoGTM customer emailed in the last 90 days is skipped.",
      },
      {
        q: "How much will I spend?",
        a: "You set emails per day, and each email costs 5¢, follow-ups included. Every lead gets three emails, so 100 emails a day on weekdays is about 2,200 emails a month: $110, reaching about 730 leads.",
      },
      {
        q: "How soon does it start?",
        a: "Research takes about a minute. Sending starts once your details are in and your account is approved, on weekdays, 9 to 5 Eastern.",
      },
      {
        q: "How do people opt out?",
        a: "One click, in every email. Anyone who opts out, bounces or complains is never emailed again by any AutoGTM customer.",
      },
    ],
  },

  cta: {
    title: "Add your site.",
    titleAccent: "Take the calls.",
    lead: "The agent does everything in between, and asks you when it's stuck.",
  },

  footer: {
    tagline: "Outbound that ends on your calendar.",
  },
} as const;
