import { prisma } from './lib/db';

async function main() {
  const account = await prisma.channelAccount.findFirst({
    where: { provider: 'INSTAGRAM_GRAPH_API', status: 'CONNECTED' },
    orderBy: { updatedAt: 'desc' }
  });
  if (!account || !account.igAccessToken) return;

  const pagesRes = await fetch(`https://graph.facebook.com/v22.0/me/accounts?access_token=${account.igAccessToken}&fields=id,access_token,instagram_business_account`);
  const pagesJson = await pagesRes.json();
  let pageId = null;
  let pageToken = null;
  for (const p of pagesJson.data || []) {
    if (p.instagram_business_account?.id === account.igUserId) {
      pageId = p.id;
      pageToken = p.access_token;
      break;
    }
  }

  if (!pageId || !pageToken) {
    console.log("No page token");
    return;
  }

  console.log(`Subscribing Page ${pageId} to webhooks...`);
  const res = await fetch(`https://graph.facebook.com/v22.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${pageToken}`, {
    method: "POST"
  });
  const json = await res.json();
  console.log('Result:', JSON.stringify(json, null, 2));

}
main().catch(console.error).finally(() => prisma.$disconnect());
