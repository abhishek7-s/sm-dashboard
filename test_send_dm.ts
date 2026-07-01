import { prisma } from './lib/db';
import { getConversations } from './lib/instagram/api';

async function main() {
  const account = await prisma.channelAccount.findFirst({
    where: { provider: 'INSTAGRAM_GRAPH_API', status: 'CONNECTED' },
    orderBy: { updatedAt: 'desc' }
  });
  if (!account || !account.igAccessToken) return;

  const pagesRes = await fetch(`https://graph.facebook.com/v22.0/me/accounts?access_token=${account.igAccessToken}&fields=id,access_token,instagram_business_account`);
  const pagesJson = await pagesRes.json();
  let pageToken = null;
  for (const p of pagesJson.data || []) {
    if (p.instagram_business_account?.id === account.igUserId) {
      pageToken = p.access_token;
      break;
    }
  }

  if (!pageToken) {
    console.log("No page token");
    return;
  }

  const convos = await getConversations(account.igAccessToken, account.igUserId);
  const convo = convos.data[0];
  if (!convo) {
    console.log("No convos to reply to");
    return;
  }

  // Find the other participant's ID
  const otherParticipant = convo.participants.data.find((p: any) => p.id !== account.igUserId);
  if (!otherParticipant) {
    console.log("No other participant found");
    return;
  }

  const recipientId = otherParticipant.id;
  console.log(`Trying to reply to ${otherParticipant.username} (ID: ${recipientId})...`);

  console.log('\\n2. POST /{page-id}/messages');
  let pageId = null;
  for (const p of pagesJson.data || []) {
    if (p.instagram_business_account?.id === account.igUserId) {
      pageId = p.id;
      break;
    }
  }

  const res2 = await fetch(`https://graph.facebook.com/v22.0/${pageId}/messages?access_token=${pageToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      recipient: { id: recipientId }, 
      message: { text: "Testing from backend API 2" },
      messaging_type: "RESPONSE"
    })
  });
  const json2 = await res2.json();
  console.log(JSON.stringify(json2, null, 2));

}
main().catch(console.error).finally(() => prisma.$disconnect());
