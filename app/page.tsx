import { prisma } from "@/lib/db";
import { whatsappSendPolicy } from "@/lib/queue/message-policy";
import Link from "next/link";
import { MessageScrollPane } from "./components/message-scroll-pane";
import { ChatInput } from "./components/chat-input";
import { AutoRefresher } from "./components/auto-refresher";
import { QueuePanel } from "./components/queue-panel";
import { BroadcastButton } from "./components/broadcast-button";
import { ChatAnalysisPanel } from "./components/chat-analysis-panel";
import { ConnectionPill } from "./components/connection-pill";
import { DisconnectWhatsAppButton } from "./components/disconnect-whatsapp-button";
import { LogoutButton } from "./components/logout-button";
import { MessageStatus } from "./components/message-status";
import { WhatsAppConnectScreen } from "./components/whatsapp-connect-screen";
import { requireUser } from "@/lib/auth/session";
import { getWhatsAppConnection } from "@/lib/whatsapp/connection";

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

function inboxHref(params: { conversation?: string; details?: boolean }) {
  const search = new URLSearchParams();
  if (params.conversation) search.set("conversation", params.conversation);
  if (params.details) search.set("details", "1");
  const query = search.toString();
  return query ? `/?${query}` : "/";
}

function hasReadOnlyMetadata(metadata: unknown) {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "readOnly" in metadata &&
    metadata.readOnly === true
  );
}

type PageProps = {
  searchParams: Promise<{
    conversation?: string;
    details?: string;
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
  const user = await requireUser();
  const { conversation, details } = await searchParams;
  const [
    {
      account,
      contacts,
      conversations,
      messages,
      queueJobs,
      selectedConversation,
    },
    connection,
  ] = await Promise.all([getDashboardData(conversation), getWhatsAppConnection()]);
  const selectedParticipant = selectedConversation?.participants[0]?.contact;
  const selectedTitle =
    selectedConversation?.title ?? selectedParticipant?.displayName ?? "No chat selected";
  const selectedSubtitle = selectedParticipant
    ? normalizePhone(selectedParticipant.phoneNumber)
    : selectedConversation?.externalId ?? "Connect WhatsApp to load chats";

  const isReadOnly = selectedConversation
    ? hasReadOnlyMetadata(selectedConversation.metadata)
    : false;

  // Until a number has been linked there is nothing to show but the QR code.
  const showConnectScreen =
    connection.state === "needs_qr" || (!account && connection.state !== "connected");
  // On phones the list and the open chat are separate screens.
  const isChatOpenOnMobile = Boolean(conversation && selectedConversation);
  const isDetailsOpen = details === "1";
  const showStatusBanner =
    !showConnectScreen &&
    (connection.state === "worker_offline" || connection.state === "connecting");

  return (
    <main className="h-dvh overflow-hidden bg-slate-50 text-slate-900 font-sans">
      <div className="flex h-full min-h-0">
        <aside className="hidden w-20 shrink-0 flex-col items-center justify-between bg-slate-900 py-6 shadow-2xl lg:flex relative z-10 border-r border-slate-800">
          <div className="flex flex-col items-center gap-5">
            <div className="grid size-11 place-items-center rounded-lg bg-[#24d366] text-base font-bold text-[#10241d]">
              SM
            </div>
            <nav className="flex flex-col gap-4 mt-8" aria-label="Main">
              <span
                className="grid size-12 place-items-center rounded-xl text-sm font-bold transition bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                aria-current="page"
                title="WhatsApp"
              >
                WA
              </span>
              <Link
                href="/instagram"
                className="grid size-12 place-items-center rounded-xl text-sm font-semibold transition bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                aria-label="Instagram"
                title="Instagram"
              >
                IG
              </Link>
            </nav>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div
              className="grid size-10 place-items-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-sm font-bold text-white shadow-lg"
              title={`${user.name} (${user.email})`}
            >
              {getInitials(user.name)}
            </div>
            <LogoutButton
              label="⎋"
              className="grid size-10 place-items-center rounded-xl text-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
            />
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex min-h-[64px] items-center justify-between gap-3 border-b border-slate-200 bg-white/80 backdrop-blur-xl px-4 md:min-h-[72px] md:px-6 z-10 sticky top-0">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-0.5">
                WhatsApp
              </p>
              <h1 className="truncate text-lg font-bold text-slate-800 tracking-tight md:text-xl">
                Inbox
              </h1>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <ConnectionPill state={connection.state} label={connection.label} />
              {!showConnectScreen ? <BroadcastButton contacts={contacts} /> : null}
              <nav className="flex items-center gap-1 lg:hidden" aria-label="Main">
                <Link
                  href="/instagram"
                  className="grid size-10 place-items-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600 hover:bg-slate-200"
                  aria-label="Instagram"
                >
                  IG
                </Link>
                <LogoutButton
                  label="⎋"
                  className="grid size-10 place-items-center rounded-xl bg-slate-100 text-lg text-slate-600 hover:bg-slate-200"
                />
              </nav>
            </div>
          </header>

          {showStatusBanner ? (
            <div
              role="status"
              className={`border-b px-4 py-2.5 text-sm md:px-6 ${
                connection.state === "worker_offline"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <span className="font-bold">{connection.label}:</span> {connection.description}
            </div>
          ) : null}

          {showConnectScreen ? (
            <WhatsAppConnectScreen connection={connection} />
          ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_360px]">
            <section
              className={`min-h-0 flex-col border-r border-slate-200 bg-white shadow-sm z-0 ${
                isChatOpenOnMobile ? "hidden md:flex" : "flex"
              }`}
              aria-label="Chats"
            >

              <div className="min-h-0 flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-slate-500">
                    <p className="font-semibold text-slate-700">No chats yet</p>
                    <p className="mt-1">
                      Chats appear here as messages arrive on your linked WhatsApp number.
                    </p>
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
                      href={inboxHref({ conversation: chat.id })}
                      aria-current={isActive ? "true" : undefined}
                    >
                      <div className={`grid size-12 place-items-center rounded-full text-sm font-bold shadow-sm ${isActive ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                        {getInitials(title)}
                      </div>
                      <div className="min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-2">
                          <p className={`truncate text-sm font-bold ${isActive ? "text-emerald-900" : "text-slate-800"}`}>
                            {title}
                          </p>
                          {chat.type === "GROUP" ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Group
                            </span>
                          ) : null}
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

            <section
              className={`min-h-0 min-w-0 flex-col bg-slate-50 relative ${
                isChatOpenOnMobile ? "flex" : "hidden md:flex"
              }`}
              aria-label="Conversation"
            >
              <div className="flex min-h-[64px] items-center justify-between gap-2 border-b border-slate-200 bg-white/90 backdrop-blur-md px-3 md:min-h-[72px] md:px-6 z-10 shadow-sm">
                <div className="flex min-w-0 items-center gap-3 md:gap-4">
                  <Link
                    href="/"
                    className="grid size-10 shrink-0 place-items-center rounded-full text-xl text-slate-600 hover:bg-slate-100 md:hidden"
                    aria-label="Back to chats"
                  >
                    ←
                  </Link>
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-sm font-bold text-white shadow-md md:size-12">
                    {getInitials(selectedTitle)}
                  </div>
                  <div className="min-w-0 flex flex-col justify-center">
                    <p className="truncate text-base font-bold text-slate-800">
                      {selectedTitle}
                    </p>
                    <p className="truncate text-xs font-medium text-slate-500">
                      {selectedSubtitle}
                    </p>
                  </div>
                </div>
                <Link
                  href={inboxHref({ conversation: selectedConversation?.id, details: true })}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 xl:hidden"
                  aria-label="Show chat details"
                  title="Chat details, mood analysis and send queue"
                >
                  ⋯
                </Link>
              </div>

              <MessageScrollPane
                scrollKey={`${selectedConversation?.id ?? "empty"}:${messages.length}`}
              >
                {messages.length === 0 ? (
                  <div className="mx-auto mt-10 w-fit rounded-2xl bg-white px-6 py-4 text-sm font-medium text-slate-500 shadow-sm border border-slate-100">
                    No messages in this chat yet.
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
                        ? `bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-br-sm ${message.status === "FAILED" ? "ring-2 ring-rose-400" : ""} ${message.status === "PENDING" ? "opacity-80" : ""}`
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
                          <a href={message.mediaUrl} download className="grid size-8 place-items-center rounded-full hover:bg-black/10 transition" aria-label="Download attachment">
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
                        className={`mt-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide ${message.direction === "OUTBOUND"
                          ? "justify-end text-emerald-100"
                          : "justify-start text-slate-400"
                          }`}
                      >
                        {formatMessageTime(message.sentAt ?? message.createdAt)}
                        {message.direction === "OUTBOUND" ? (
                          <MessageStatus
                            messageId={message.id}
                            status={message.status}
                            failureReason={message.failureReason}
                          />
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
                  disabledReason="You can't send messages to this chat"
                />
              ) : (
                <div className="border-t border-black/10 bg-[#f7faf8] p-3 md:p-4">
                  <div className="min-h-11 flex-1 rounded-lg border border-black/10 bg-white px-4 py-3 text-sm text-[#65766f] flex items-center">
                    Select a conversation to start messaging
                  </div>
                </div>
              )}
            </section>

            {isDetailsOpen ? (
              <Link
                href={inboxHref({ conversation: selectedConversation?.id })}
                className="fixed inset-0 z-30 bg-slate-900/40 xl:hidden"
                aria-label="Close details"
              />
            ) : null}
            <aside
              className={`min-h-0 overflow-y-auto border-l border-black/10 bg-[#fbfcfc] xl:static xl:block xl:w-auto xl:shadow-none ${
                isDetailsOpen
                  ? "fixed inset-y-0 right-0 z-40 block w-full max-w-sm shadow-2xl"
                  : "hidden"
              }`}
              aria-label="Details"
            >
              {isDetailsOpen ? (
                <div className="flex items-center justify-between border-b border-black/10 p-4 xl:hidden">
                  <p className="text-sm font-bold text-slate-800">Details</p>
                  <Link
                    href={inboxHref({ conversation: selectedConversation?.id })}
                    className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                    aria-label="Close details"
                  >
                    ✕
                  </Link>
                </div>
              ) : null}
              <section className="border-b border-black/10 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#10241d]">
                      WhatsApp connection
                    </p>
                    <p className="mt-1 truncate text-sm text-[#667871]">
                      {account?.displayName ?? "No WhatsApp account"}
                      {account?.phoneNumber ? ` · ${normalizePhone(account.phoneNumber)}` : ""}
                    </p>
                  </div>
                  <ConnectionPill state={connection.state} label={connection.label} />
                </div>
                <p className="mt-2 text-xs text-[#667871]">{connection.description}</p>
                {connection.state === "connected" || connection.logoutPending ? (
                  <div className="mt-3">
                    <DisconnectWhatsAppButton pending={connection.logoutPending} />
                  </div>
                ) : null}
              </section>

              <ChatAnalysisPanel conversationId={selectedConversation?.id} />

              <section className="border-b border-black/10 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#10241d]">Send Queue</p>
                  <span className="text-xs font-medium text-[#667871]">{whatsappSendPolicy.defaultDelaySeconds}s between messages</span>
                </div>
                <div className="mt-4">
                  <QueuePanel jobs={queueJobs} />
                </div>
              </section>
            </aside>
          </div>
          )}
        </section>
      </div>
      <AutoRefresher intervalMs={3000} />
    </main>
  );
}
