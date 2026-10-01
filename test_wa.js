import { initWhatsApp, sendWhatsAppMessage, closeWhatsApp } from "./whatsapp.js";

async function runTest() {
    console.log("Starting WhatsApp test...");
    await initWhatsApp();

    const testPhone = "94764320410";
    const testMessage = "Hello! This is a test message from the Outreach Bot.";

    console.log(`Sending test message to ${testPhone}...`);
    const success = await sendWhatsAppMessage(testPhone, testMessage);

    if (success) {
        console.log("✅ Test message sent successfully!");
    } else {
        console.log("❌ Failed to send test message.");
    }

    await closeWhatsApp();
    process.exit(0);
}

runTest();
