import { stripQuotedReply } from "../src/util.js";
const real = `Hi Erin,

Is it possible to change the time to 3:00- 4:30 pm?

Please let me know.

Thanks!

Maribeth

Maribeth Grandpre
VP , Global Accounts
CSN Connects

From: Painting and Vino <support@paintingandvino.com>
Sent: Wednesday, September 23, 2026 6:10 PM
To: Maribeth Grandpre <maribeth@csnconnects.com>
Subject: Your tickets from Painting and Vino

Private painting event with Erin
CSN Private Paint event activity`;
console.log("--- stripped ---");
console.log(JSON.stringify(stripQuotedReply(real)));
console.log("still contains 'painting event'? ", stripQuotedReply(real).toLowerCase().includes("painting event"));

const bottomPost = `From: Painting and Vino <support@paintingandvino.com>
Sent: Wed
To: me

old stuff about a painting event

Yes please book it for 20 guests, it's a corporate team building day.`;
console.log("\n--- bottom-poster keeps everything? ---");
console.log("length kept:", stripQuotedReply(bottomPost).length, "of", bottomPost.length);

const plain = "Hi, I'd like to book a private event for 15 people in San Diego on Nov 3rd.";
console.log("\n--- plain message untouched? ---", stripQuotedReply(plain) === plain);
