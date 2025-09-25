require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "4917680066401@c.us";
const TARGET_GROUP = process.env.TARGET_GROUP || "Test";
const GRACE_SECONDS = parseInt(process.env.GRACE_SECONDS || "30", 10);

// 100 unangemessene Wörter
const BAD_WORDS = [
  "arsch","scheiße","idiot","dumme","hure","bitch","affengeil","verdammt",
  "fotze","wichser","penner","hurensohn","drecksau","scheißkerl","arschloch",
  "bastard","spasti","schlampe","kacke","miststück","idiotin","schwachkopf",
  "fuck","shit","bastard","douche","asshole","dumbass","slut","fucker",
  "cunt","bitchy","piss","motherfucker","whore","nigger","fag","retard","twat",
  "bastard","slutface","dickhead","cock","prick","shithead","wanker","bollocks",
  "git","bugger","tosser","twit","douchebag","asswipe","moron","crap","jerk",
  "shitbag","schwein","vieh","dämling","blödmann","trottel","idiotisch","scheißhaus",
  "kackbratze","arschgesicht","scheißkopf","dreckkopf","penner","versager","hurenkind",
  "blödmann","arschgeige","saukerl","kretin","schwachmat","bastardkind","fuckface",
  "pussy","wankerface","clown","fool","loser","nutcase","doucheface","twatwaffle",
  "slimeball","shitface","dumbfuck","n00b","scumbag","weirdo","freak","asshat",
  "assclown","idiotenkopf","arschlochgesicht","kacknase","blödschädel"
];

// Hilfsfunktion: prüft, ob Text ein Bad Word enthält
function containsBadWord(text){
  if(!text) return false;
  const lower = text.toLowerCase();
  return BAD_WORDS.some(w => lower.includes(w));
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox','--disable-setuid-sandbox'] }
});

// QR-Code Ausgabe
client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log("QR-Code generiert. Bitte scanne mit WhatsApp Web.");
});

client.on('ready', () => console.log("✅ Bot ist online!"));

client.on('message', async msg => {
  try {
    if (!msg.from.includes('@g.us') || msg.fromMe) return;

    const chat = await msg.getChat();
    if (!chat.isGroup || chat.name !== TARGET_GROUP) return;

    const authorId = msg.author || msg.from;
    const contact = await client.getContactById(authorId);
    const text = (msg.body || "").toLowerCase();

    if (containsBadWord(text)) {
      // Warnung in Gruppe
      await chat.sendMessage(
        `⚠️ Diese Nachricht wurde als *unangemessen* markiert. Bitte lösche sie sofort.\nDer Admin überprüft den Vorfall.`,
        { mentions: [contact] }
      );

      // Admin-Benachrichtigung
      await client.sendMessage(
        ADMIN_NUMBER,
        `🚨 Unangemessene Nachricht erkannt in Gruppe *${chat.name}* von ${contact.pushname || contact.number}:\n"${msg.body}"`
      );

      // Nachricht nach GRACE_SECONDS prüfen
      const msgId = msg.id._serialized;
      setTimeout(async () => {
        const chatCheck = await client.getChatById(chat.id._serialized);
        const messages = await chatCheck.fetchMessages({ limit: 50 });
        const stillExists = messages.some(m => m.id._serialized === msgId);

        if (stillExists) {
          try {
            await chatCheck.removeParticipants([authorId]);
            await client.sendMessage(chat.id._serialized, `⛔ ${contact.pushname || contact.number} wurde entfernt, weil die Nachricht nicht gelöscht wurde.`);
            await client.sendMessage(ADMIN_NUMBER, `User ${contact.pushname || contact.number} wurde entfernt.`);
          } catch (err) {
            await client.sendMessage(ADMIN_NUMBER, `⚠️ Konnte ${contact.pushname || contact.number} nicht entfernen: ${err.message}`);
          }
        } else {
          await client.sendMessage(ADMIN_NUMBER, `✅ Nachricht von ${contact.pushname || contact.number} wurde gelöscht.`);
        }
      }, GRACE_SECONDS * 1000);
    }
  } catch(err) {
    console.error("Fehler:", err);
  }
});

client.initialize();
