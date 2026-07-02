import { prisma } from "@/lib/db";
import { whatsappSendPolicy } from "@/lib/queue/message-policy";
import Link from "next/link";
import { MessageScrollPane } from "./components/message-scroll-pane";
import { ChatInput } from "./components/chat-input";
import { AutoRefresher } from "./components/auto-refresher";
import { BroadcastModal } from "./components/broadcast-modal";
import { QueuePanel } from "./components/queue-panel";
import { BroadcastButton } from "./components/broadcast-button";

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
      contacts: [],
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
    contacts,
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
      where: { channelAccountId: account.id },
    }),
    prisma.contact.findMany({
      where: {
        channelAccountId: account.id,
        isGroup: false,
        NOT: [
          { displayName: { endsWith: "@lid" } },
          { displayName: { endsWith: "@s.whatsapp.net" } },
          { displayName: { endsWith: "@g.us" } },
        ],
      },
      orderBy: { displayName: "asc" },
      take: 300,
      select: { id: true, displayName: true, phoneNumber: true, externalId: true },
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
      where: { channelAccountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        recipients: {
          include: { contact: { select: { displayName: true } } },
          orderBy: { position: "asc" },
        },
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
    contacts,
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
    contacts,
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
    <main className="h-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      <div className="flex h-full min-h-0">
        <aside className="hidden w-20 shrink-0 flex-col items-center justify-between bg-slate-900 py-6 shadow-2xl lg:flex relative z-10 border-r border-slate-800">
          <div className="flex flex-col items-center gap-5">
            <div className="grid size-11 place-items-center rounded-lg bg-[#24d366] text-base font-bold text-[#10241d]">
              SM
            </div>
            <nav className="flex flex-col gap-4 mt-8" aria-label="Main">
              <button
                className="grid size-12 place-items-center rounded-xl text-sm font-bold transition bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                type="button"
                aria-current="page"
              >
                WA
              </button>
              <Link
                href="/instagram"
                className="grid size-12 place-items-center rounded-xl text-sm font-semibold transition bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                aria-label="Instagram"
              >
                IG
              </Link>
            </nav>
          </div>
          <div className="grid size-10 place-items-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-sm font-bold text-white shadow-lg">
            {getInitials(account?.displayName ?? "AS")}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex min-h-[72px] items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-xl px-6 z-10 sticky top-0">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-0.5">
                WhatsApp
              </p>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                Inbox and Queue
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <BroadcastButton contacts={contacts} />
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
            <section className="flex min-h-0 flex-col border-r border-slate-200 bg-white shadow-sm z-0">

              <div className="min-h-0 flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-slate-400 text-center">
                    No WhatsApp conversations stored yet.
                  </div>
                ) : null}
                {conversations.map((chat) => {
                  const participant = chat.participants[0]?.contact;
                  const lastMessage = chat.messages[0];
                  const title = chat.title || participant?.displayName || chat.externalId;
                  const preview = lastMessage?.kind === "IMAGE" ? "📷 Image" : lastMessage?.kind === "DOCUMENT" ? "📄 Document" : lastMessage?.body || "No message body";
                  const isActive = chat.id === selectedConversation?.id;

                  return (
                    <Link
                      key={chat.id}
                      className={`grid w-full grid-cols-[48px_minmax(0,1fr)_auto] gap-4 px-5 py-4 text-left transition duration-200 border-b border-slate-50 ${isActive ? "bg-emerald-50/80" : "bg-white hover:bg-slate-50"
                        }`}
                      href={`/?conversation=${encodeURIComponent(chat.id)}`}
                    >
                      <div className={`grid size-12 place-items-center rounded-full text-sm font-bold shadow-sm ${isActive ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                        {getInitials(title)}
                      </div>
                      <div className="min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-2">
                          <p className={`truncate text-sm font-bold ${isActive ? "text-emerald-900" : "text-slate-800"}`}>
                            {title}
                          </p>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
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

            <section className="flex min-h-0 min-w-0 flex-col bg-slate-50 relative">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none"></div>

              <div className="flex min-h-[72px] items-center justify-between border-b border-slate-200 bg-white/90 backdrop-blur-md px-6 z-10 shadow-sm">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="grid size-12 place-items-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-sm font-bold text-white shadow-md">
                    {getInitials(selectedTitle)}
                  </div>
                  <div className="min-w-0 flex flex-col justify-center">
                    <p className="truncate text-base font-bold text-slate-800">
                      {selectedTitle}
                    </p>
                    <p className="truncate text-xs font-medium text-slate-500">
                      {selectedSubtitle}
                      {account?.lastSyncAt
                        ? ` · synced ${formatChatTime(account.lastSyncAt)}`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
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
                <div className="mx-auto w-fit rounded-full bg-emerald-100/50 border border-emerald-200/50 px-4 py-1.5 text-[11px] font-bold text-emerald-700 uppercase tracking-wider shadow-sm mb-6">
                  Messages mirrored from Baileys session
                </div>
                {messages.length === 0 ? (
                  <div className="mx-auto mt-10 w-fit rounded-2xl bg-white px-6 py-4 text-sm font-medium text-slate-500 shadow-sm border border-slate-100">
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
                      className={`max-w-[85%] md:max-w-[65%] rounded-2xl px-4 py-3 shadow-sm relative group ${message.direction === "OUTBOUND"
                        ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-br-sm"
                        : "bg-white border border-slate-100 text-slate-800 rounded-bl-sm"
                        }`}
                    >
                      {message.mediaUrl && message.kind === "IMAGE" && (
                        <div className="mb-2 -mx-2 -mt-1 overflow-hidden rounded-xl">
                          <img src={message.mediaUrl} alt="Attachment" className="max-w-full h-auto object-cover max-h-64 rounded-xl border border-black/10" />
                        </div>
                      )}
                      {message.mediaUrl && (message.kind === "DOCUMENT" || message.kind === "VIDEO" || message.kind === "AUDIO") && (
                        <div className={`mb-2 flex items-center gap-3 p-3 rounded-xl border ${message.direction === "OUTBOUND" ? "bg-white/10 border-white/20" : "bg-slate-50 border-slate-200"}`}>
                          <div className={`grid size-10 place-items-center rounded-lg ${message.direction === "OUTBOUND" ? "bg-white/20" : "bg-white shadow-sm"}`}>
                            {message.kind === "VIDEO" ? "🎥" : message.kind === "AUDIO" ? "🎵" : "📄"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold truncate">Attachment</p>
                            <p className="text-xs opacity-80 truncate">{message.mediaMimeType}</p>
                          </div>
                          <a href={message.mediaUrl} download className="grid size-8 place-items-center rounded-full hover:bg-black/10 transition">
                            ⬇️
                          </a>
                        </div>
                      )}

                      {message.body ? (
                        <p className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words ${message.direction === "OUTBOUND" ? "text-emerald-50" : "text-slate-700"}`}>
                          {message.body}
                        </p>
                      ) : null}

                      <div
                        className={`mt-1.5 flex items-center gap-1.5 text-[10px] font-medium tracking-wide ${message.direction === "OUTBOUND"
                          ? "justify-end text-emerald-100"
                          : "justify-start text-slate-400"
                          }`}
                      >
                        {formatMessageTime(message.sentAt)}
                        {message.direction === "OUTBOUND" ? (
                          <span className="opacity-90">
                            {message.status === "READ"
                              ? "✓✓"
                              : message.status === "DELIVERED"
                                ? "✓✓"
                                : message.status === "SENT"
                                  ? "✓"
                                  : "○"}
                          </span>
                        ) : null}
                      </div>
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
                {/* <div className="mt-4 grid grid-cols-3 gap-2">
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
                </div> */}
                {/* <p className="mt-3 text-xs text-[#667871]">
                  {messagesCount.toLocaleString()} messages stored
                </p> */}
              </section>

              <section className="border-b border-black/10 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#10241d]">Send Queue</p>
                  <span className="text-xs font-medium text-[#667871]">{whatsappSendPolicy.defaultDelaySeconds}s delay</span>
                </div>
                <div className="mt-4">
                  <QueuePanel jobs={queueJobs} />
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
