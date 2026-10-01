import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
  webVersionCache: {
    type: "remote",
    remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
  },
});

console.log("⏳ Initializing WhatsApp client for test...");

client.on("ready", async () => {
  console.log("✅ Client is ready!");
  
  // Get our own number
  const myNumberId = client.info.wid._serialized;
  console.log(`📱 My WhatsApp ID is: ${myNumberId}`);
  
  try {
    console.log("📤 Sending a test message to YOURSELF...");
    await client.sendMessage(myNumberId, "Hello! This is a test message from the Lead Finder bot to prove that sending works.");
    console.log("✅ Message sent successfully! Check your phone.");
  } catch (err) {
    console.error("✖ Failed to send message:", err);
  }
  
  setTimeout(() => {
    console.log("Closing test...");
    process.exit(0);
  }, 5000);
});

client.on("auth_failure", (msg) => {
  console.error("✖ Auth failed:", msg);
});

client.initialize();
