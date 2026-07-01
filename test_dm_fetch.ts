import { prisma } from './lib/db';
import { getConversations } from './lib/instagram/api';

async function main() {
  const account = await prisma.channelAccount.findFirst({
    where: { provider: 'INSTAGRAM_GRAPH_API', status: 'CONNECTED' },
    orderBy: { updatedAt: 'desc' }
  });
  if (!account || !account.igAccessToken) return;

  console.log('Fetching convos...');
  try {
    const convos = await getConversations(account.igAccessToken, account.igUserId);
    console.log('Success! Convos:', JSON.stringify(convos, null, 2));
  } catch (e: any) {
    console.error('Convo fetch error:', e.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
