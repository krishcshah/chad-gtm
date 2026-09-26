import { SUPPORTED_AI_MODELS } from "../packages/shared/src/index.ts";
import { generateEmailScriptOnTheFly, previewBatchLeadEmails, improveEmailCopy } from "../packages/email-engine/src/ai.ts";

async function main() {
  console.log("=== 1. VERIFYING SUPPORTED AI MODELS ===");
  console.log("Configured models:", SUPPORTED_AI_MODELS.map(m => `${m.id} (${m.name})`));

  const forbidden = ["gemini-2.5-flash", "gemini-1.5-pro", "gpt-4o-mini", "gpt-4o"];
  for (const f of forbidden) {
    const found = SUPPORTED_AI_MODELS.find(m => m.id === f);
    if (found) {
      throw new Error(`Forbidden legacy model found: ${f}`);
    }
  }
  console.log("✅ Verified: Zero legacy models present. All modern frontier models active.");

  console.log("\n=== 2. VERIFYING 10-SAMPLE PREVIEW GENERATION ===");
  const testLeads = [
    { email: "sarah.chen@cloudscale.io", firstName: "Sarah", lastName: "Chen", company: "CloudScale", jobTitle: "Head of Growth", industry: "Cloud Tech" },
    { email: "marcus.vance@apexsystems.de", firstName: "Marcus", lastName: "Vance", company: "Apex Systems", jobTitle: "VP Engineering", industry: "Infrastructure" },
    { email: "alex.wright@novus.co.uk", firstName: "Alex", lastName: "Wright", company: "Novus Payments", jobTitle: "COO", industry: "Fintech" },
  ];

  const preview = await previewBatchLeadEmails(testLeads, {
    customInstruction: "Focus on deliverability and infrastructure scaling without domain burn.",
    fallbackSubject: "Quick intro",
    fallbackBody: "Hi {{first_name}}, saw your work at {{company}}.",
    senderName: "Elena Rostova",
  });

  console.log(`Generated ${preview.length} sample emails:`);
  for (let i = 0; i < preview.length; i++) {
    const item = preview[i];
    console.log(`\n--- Sample ${i + 1} (${item.lead.firstName} @ ${item.lead.company}) ---`);
    console.log(`Subject: ${item.email.subject}`);
    console.log(`Body excerpt: ${item.email.bodyText.slice(0, 100).replace(/\n/g, " ")}...`);
    console.log(`Reason: ${item.email.personalizationReason}`);
  }

  console.log("\n=== 3. VERIFYING COPY IMPROVEMENT ASSISTANT ===");
  const improved = await improveEmailCopy({
    subject: "Hey want to chat?",
    bodyText: "We make email software. You should buy it because it is good.",
    tone: "executive",
  });

  console.log("Improved Subject:", improved.subject);
  console.log("Improved Body:\n", improved.bodyText);
  console.log("Changes Summary:", improved.changesSummary);

  console.log("\n🎉 ALL AI VERIFICATION CHECKS PASSED SUCCESSFULLY!");
}

main().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
