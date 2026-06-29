import { prisma } from "@/lib/db";
import { whatsappSendPolicy } from "@/lib/queue/message-policy";
import Link from "next/link";
import { MessageScrollPane } from "./components/message-scroll-pane";
import { ChatInput } from "./components/chat-input";
import { AutoRefresher } from "./components/auto-refresher";

export const dynamic = "force-dynamic";

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
});

const dayFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

function getInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "WA";
  }

  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() || "")
    .join("");
}

function formatChatTime(date: Date | null) {
  if (!date) {
    return "";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays === 0) {
    return dateTimeFormatter.format(date);
  }

  if (diffDays < 7) {
    return relativeTimeFormatter.format(-diffDays, "day");
  }

  return dayFormatter.format(date);
}

function formatMessageTime(date: Date | null) {
  return date ? dateTimeFormatter.format(date) : "";
}

function normalizePhone(value?: string | null) {
  if (!value) {
    return "No phone saved";
  }

  return value.startsWith("+") ? value : `+${value}`;
}

type PageProps = {
  searchParams: Promise<{
    conversation?: string;
  }>;
};

async function getDashboardData(selectedConversationId?: string) {
  const account = await prisma.channelAccount.findFirst({
    where: {
      type: "WHATSAPP",
      provider: "BAILEYS",
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (!account) {
    return {
      account: null,
      contactsCount: 0,
      conversationsCount: 0,
      conversations: [],
      messages: [],
      unreadCount: 0,
      messagesCount: 0,
      queueJobs: [],
      selectedConversation: null,
    };
  }

  const [
    contactsCount,
    conversationsCount,
    unreadAggregate,
    messagesCount,
    conversations,
    queueJobs,
  ] = await Promise.all([
    prisma.contact.count({
      where: {
        channelAccountId: account.id,
      },
    }),
    prisma.conversation.count({
      where: {
        channelAccountId: account.id,
      },
    }),
    prisma.conversation.aggregate({
      where: {
        channelAccountId: account.id,
      },
      _sum: {
        unreadCount: true,
      },
    }),
    prisma.message.count({
      where: {
        channelAccountId: account.id,
      },
    }),
    prisma.conversation.findMany({
      where: {
        channelAccountId: account.id,
        NOT: {
          title: {
            endsWith: "@lid",
          },
        },
      },
      orderBy: [
        {
          lastMessageAt: "desc",
        },
        {
          updatedAt: "desc",
        },
      ],
      take: 30,
      include: {
        participants: {
          take: 3,
          include: {
            contact: true,
          },
        },
        messages: {
          orderBy: {
            sentAt: "desc",
          },
          take: 1,
        },
      },
    }),
    prisma.messageQueueJob.findMany({
      where: {
        channelAccountId: account.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 6,
      include: {
        recipients: true,
      },
    }),
  ]);

  const selectedConversation =
    conversations.find((item) => item.id === selectedConversationId) ??
    (selectedConversationId
      ? await prisma.conversation.findFirst({
        where: {
          id: selectedConversationId,
          channelAccountId: account.id,
          NOT: {
            title: {
              endsWith: "@lid",
            },
          },
        },
        include: {
          participants: {
            take: 3,
            include: {
              contact: true,
            },
          },
          messages: {
            orderBy: {
              sentAt: "desc",
            },
            take: 1,
          },
        },
      })
      : null) ??
    conversations[0];
  const messages = selectedConversation
    ? await prisma.message.findMany({
      where: {
        conversationId: selectedConversation.id,
      },
      orderBy: {
        sentAt: "asc",
      },
      take: 80,
    })
    : [];

  return {
    account,
    contactsCount,
    conversationsCount,
    conversations,
    messages,
    messagesCount,
    queueJobs,
    selectedConversation,
    unreadCount: unreadAggregate._sum.unreadCount ?? 0,
  };
}

export default async function Home({ searchParams }: PageProps) {
  const { conversation } = await searchParams;
  const {
    account,
    contactsCount,
    conversations,
    conversationsCount,
    messages,
    messagesCount,
    queueJobs,
    selectedConversation,
    unreadCount,
  } = await getDashboardData(conversation);
  const selectedParticipant = selectedConversation?.participants[0]?.contact;
  const selectedTitle =
    selectedConversation?.title ?? selectedParticipant?.displayName ?? "No chat selected";
  const selectedSubtitle = selectedParticipant
    ? normalizePhone(selectedParticipant.phoneNumber)
    : selectedConversation?.externalId ?? "Connect WhatsApp to load chats";

  const isReadOnly = selectedConversation
    ? (selectedConversation.metadata as any)?.readOnly === true
    : false;

  return (
    <main className="h-screen overflow-hidden bg-[#eef1f0] text-[#15201c]">
      <div className="flex h-full min-h-0">
        <aside className="hidden w-20 shrink-0 flex-col items-center justify-between bg-[#183229] py-5 text-white lg:flex">
          <div className="flex flex-col items-center gap-5">
            <div className="grid size-11 place-items-center rounded-lg bg-[#24d366] text-base font-bold text-[#10241d]">
              SM
            </div>
            <nav className="flex flex-col gap-3" aria-label="Main">
              {["WA", "IG"].map((item, index) => (
                <button
                  key={item}
                  className={`grid size-11 place-items-center rounded-lg text-sm font-semibold transition ${index === 0
                    ? "bg-white text-[#183229]"
                    : "bg-white/10 text-white/75 hover:bg-white/15"
                    }`}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </nav>
          </div>
          <div className="grid size-10 place-items-center rounded-lg bg-white/10 text-sm font-semibold">
            {getInitials(account?.displayName ?? "AS")}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex min-h-16 items-center justify-between border-b border-black/10 bg-white px-4 md:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#58706a]">
                WhatsApp
              </p>
              <h1 className="text-xl font-semibold text-[#10241d]">
                Inbox and Queue
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-lg border border-[#cfe7dc] bg-[#eefbf5] px-3 py-2 text-sm font-medium text-[#146b45] sm:flex">
                <span className="size-2 rounded-full bg-[#1fb56d]" />
                {account?.status === "CONNECTED"
                  ? "Baileys connected"
                  : "Baileys offline"}
              </div>
              <button
                className="rounded-lg bg-[#183229] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#244a3d]"
                type="button"
              >
                New queue
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
            <section className="flex min-h-0 flex-col border-r border-black/10 bg-white">
              <div className="border-b border-black/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 flex-1 items-center rounded-lg bg-[#f2f5f4] px-3 text-sm text-[#63756f]">
                    Search contacts or chats
                  </div>
                  <button
                    className="grid size-11 place-items-center rounded-lg border border-black/10 text-lg text-[#183229]"
                    type="button"
                    aria-label="Sync WhatsApp"
                  >
                    ↻
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 divide-y divide-black/5 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-[#687a74]">
                    No WhatsApp conversations stored yet.
                  </div>
                ) : null}
                {conversations.map((chat) => {
                  const participant = chat.participants[0]?.contact;
                  const lastMessage = chat.messages[0];
                  const title = chat.title || participant?.displayName || chat.externalId;
                  const preview = lastMessage?.body || "No message body";
                  const isActive = chat.id === selectedConversation?.id;

                  return (
                    <Link
                      key={chat.id}
                      className={`grid w-full grid-cols-[48px_minmax(0,1fr)_auto] gap-3 px-4 py-4 text-left transition hover:bg-[#f4f7f6] ${isActive ? "bg-[#eef7f3]" : "bg-white"
                        }`}
                      href={`/?conversation=${encodeURIComponent(chat.id)}`}
                    >
                      <div className="grid size-12 place-items-center rounded-lg bg-[#d9eee5] text-sm font-bold text-[#183229]">
                        {getInitials(title)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-[#15201c]">
                            {title}
                          </p>
                          <span className="rounded-md bg-[#edf2f0] px-2 py-0.5 text-[11px] font-medium text-[#58706a]">
                            {chat.type === "GROUP" ? "Group" : "Direct"}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm text-[#687a74]">
                          {preview}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-xs text-[#70817b]">
                          {formatChatTime(chat.lastMessageAt)}
                        </span>
                        {chat.unreadCount > 0 ? (
                          <span className="grid size-5 place-items-center rounded-full bg-[#24d366] text-xs font-bold text-[#10241d]">
                            {chat.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="flex min-h-0 min-w-0 flex-col bg-[#e7ebe8]">
              <div className="flex min-h-16 items-center justify-between border-b border-black/10 bg-[#f7faf8] px-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-lg bg-[#d9eee5] text-sm font-bold text-[#183229]">
                    {getInitials(selectedTitle)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {selectedTitle}
                    </p>
                    <p className="truncate text-xs text-[#667871]">
                      {selectedSubtitle}
                      {account?.lastSyncAt
                        ? ` · synced ${formatChatTime(account.lastSyncAt)}`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="grid size-10 place-items-center rounded-lg border border-black/10 bg-white text-lg"
                    type="button"
                    aria-label="Open contact details"
                  >
                    ⋯
                  </button>
                </div>
              </div>

              <MessageScrollPane
                scrollKey={`${selectedConversation?.id ?? "empty"}:${messages.length}`}
              >
                <div className="mx-auto w-fit rounded-lg bg-[#fff8d7] px-3 py-2 text-xs font-medium text-[#675b28]">
                  Messages are mirrored from the connected Baileys session.
                </div>
                {messages.length === 0 ? (
                  <div className="mx-auto mt-10 w-fit rounded-lg bg-white px-4 py-3 text-sm text-[#667871] shadow-sm">
                    No stored messages for this conversation yet.
                  </div>
                ) : null}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.direction === "OUTBOUND"
                      ? "justify-end"
                      : "justify-start"
                      }`}
                  >
                    <div
                      className={`max-w-[78%] rounded-lg px-3 py-2 shadow-sm md:max-w-[58%] ${message.direction === "OUTBOUND"
                        ? "bg-[#d9fdd3]"
                        : "bg-white"
                        }`}
                    >
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {message.body || `[${message.kind.toLowerCase()}]`}
                      </p>
                      <p className="mt-1 text-right text-[11px] text-[#667871]">
                        {formatMessageTime(message.sentAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </MessageScrollPane>

              {selectedConversation ? (
                <ChatInput
                  conversationId={selectedConversation.id}
                  disabled={isReadOnly}
                />
              ) : (
                <div className="border-t border-black/10 bg-[#f7faf8] p-3 md:p-4">
                  <div className="min-h-11 flex-1 rounded-lg border border-black/10 bg-white px-4 py-3 text-sm text-[#65766f] flex items-center">
                    Select a conversation to start messaging
                  </div>
                </div>
              )}
            </section>

            <aside className="min-h-0 overflow-y-auto border-l border-black/10 bg-[#fbfcfc]">
              <section className="border-b border-black/10 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[#10241d]">
                      Connection
                    </p>
                    <p className="mt-1 text-sm text-[#667871]">
                      {account?.displayName ?? "No WhatsApp account"}
                    </p>
                  </div>
                  <span className="rounded-lg bg-[#eefbf5] px-3 py-1 text-xs font-bold text-[#146b45]">
                    {account?.status ?? "NEW"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ["Contacts", contactsCount.toLocaleString()],
                    ["Chats", conversationsCount.toLocaleString()],
                    ["Unread", unreadCount.toLocaleString()],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-black/10 bg-white p-3"
                    >
                      <p className="text-lg font-semibold">{value}</p>
                      <p className="mt-1 text-xs text-[#667871]">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-[#667871]">
                  {messagesCount.toLocaleString()} messages stored
                </p>
              </section>

              <section className="border-b border-black/10 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#10241d]">
                    Send Queue
                  </p>
                  <span className="text-xs font-medium text-[#667871]">
                    {whatsappSendPolicy.defaultDelaySeconds}s delay
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {queueJobs.length === 0 ? (
                    <div className="rounded-lg border border-black/10 bg-white p-3 text-sm text-[#667871]">
                      No queue jobs yet.
                    </div>
                  ) : null}
                  {queueJobs.map((job) => (
                    <div
                      key={job.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-black/10 bg-white p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {job.title}
                        </p>
                        <p className="mt-1 text-xs text-[#667871]">
                          {job.status} · {job.recipients.length} recipients
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-[#183229]">
                        {job.delaySeconds}s
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="p-4">
                <p className="text-sm font-semibold text-[#10241d]">
                  Guardrails
                </p>
                <div className="mt-4 space-y-3 text-sm text-[#52665f]">
                  <div className="flex justify-between gap-4">
                    <span>Recipients per selection</span>
                    <strong className="text-[#10241d]">
                      {whatsappSendPolicy.maxRecipientsPerSelection}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Retry attempts</span>
                    <strong className="text-[#10241d]">
                      {whatsappSendPolicy.maxAttemptsPerRecipient}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Quiet hours</span>
                    <strong className="text-[#10241d]">
                      {whatsappSendPolicy.quietHours.startHour}:00-
                      {whatsappSendPolicy.quietHours.endHour}:00
                    </strong>
                  </div>
                </div>
              </section>
              <AutoRefresher intervalMs={3000} />
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
