/**
 * Central loader for every Mongoose model used by the app.
 * Importing this file is what registers all schemas with mongoose.
 */

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const COLLECTIONS = {
  users: 'users',
  sessions: 'sessions',
  countries: 'countries',
  servers: 'servers',
  phoneNumbers: 'phoneNumbers',
  platforms: 'platforms',
  smsMessages: 'smsMessages',
  withdrawalRequests: 'withdrawalRequests',
  apiKeys: 'apiKeys',
  agentApprovals: 'agentApprovals',
  broadcasts: 'broadcasts',
  adminStaff: 'adminStaff',
  costRates: 'costRates',
  appConfig: 'appConfig',
  smsProviders: 'smsProviders',
  userApiKeys: 'userApiKeys',
  supportSessions: 'supportSessions',
  supportMessages: 'supportMessages',
  guruPosts: 'guruPosts',
  guruGroups: 'guruGroups',
  guruGroupMessages: 'guruGroupMessages',
  guruFollows: 'guruFollows',
  guruReports: 'guruReports',
  guruSettings: 'guruSettings',
  guruLikes: 'guruLikes',
  guruViews: 'guruViews',
  guruComments: 'guruComments',
  groupMembers: 'groupMembers',
  groupBans: 'groupBans',
  announcements: 'announcements',
  guests: 'guests',
  adminSessions: 'adminSessions',
  emailVerifyCodes: 'emailVerifyCodes'
};

const baseOpts = { _id: false, strict: false, minimize: false };

const UsersSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    name: String,
    email: { type: String, lowercase: true, trim: true, index: true },
    phone: String,
    telegram: String,
    cryptoAddress: String,
    address: String,
    referralEmail: String,
    agentEmail: { type: String, lowercase: true, trim: true, index: true },
    agentApproved: { type: Boolean, default: false },
    earningsBalance: { type: Number, default: 0 },
    totalOtps: { type: Number, default: 0 },
    failedOtps: { type: Number, default: 0 },
    successfulOtps: { type: Number, default: 0 },
    scamsDetected: { type: Number, default: 0 },
    scamStrikeCount: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false, index: true },
    bannedAt: Date,
    banReason: String,
    isAdmin: { type: Boolean, default: false, index: true },
    isAgent: { type: Boolean, default: false, index: true },
    profileComplete: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    profilePhotoUrl: String,
    identificationNumber: String,
    preferences: Schema.Types.Mixed,
    suspendedUntil: Date,
    lastModerationReason: String,
    lastLoginAt: Date,
    blueVerified: { type: Boolean, default: false },
    membersApprovedAt: Date,
    reportCount: { type: Number, default: 0 },
    createdAt: Date,
    updatedAt: Date,
    passwordHash: String
  },
  baseOpts
);
UsersSchema.index({ updatedAt: -1 });
UsersSchema.index({ emailVerified: 1 });

const SessionsSchema = new Schema(
  {
    _id: { type: String },
    userId: { type: String, index: true },
    token: String,
    expiresAt: Date,
    createdAt: Date
  },
  baseOpts
);
SessionsSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CountriesSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    name: String,
    code: String,
    flag: String,
    iconData: String,
    prefix: String,
    createdAt: Date
  },
  baseOpts
);

const ServersSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    countryId: { type: String, index: true },
    name: String,
    displayName: String,
    numbers: Schema.Types.Mixed,
    createdAt: Date
  },
  baseOpts
);

const PhoneNumbersSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    userId: { type: String, index: true },
    countryId: String,
    serverId: String,
    platformId: String,
    platformName: String,
    phoneNumber: { type: String, index: true },
    phoneDigits: { type: String, index: true },
    status: { type: String, index: true },
    numberExpiresAt: Date,
    expiresAt: Date,
    smsMessage: String,
    otp: String,
    otpCode: String,
    otpReceived: { type: Boolean, default: false },
    lastOtpReceivedAt: Date,
    lastPollAt: Date,
    provider: String,
    country: String,
    countryCode: String,
    createdAt: { type: Date, index: true },
    updatedAt: Date,
    serverName: String,
    reward: Number,
    multipleOtps: Schema.Types.Mixed,
    source: String
  },
  baseOpts
);
PhoneNumbersSchema.index({ status: 1, createdAt: -1 });
PhoneNumbersSchema.index({ createdAt: -1 });

const PlatformsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    countryId: { type: String, index: true },
    name: String,
    icon: String,
    createdAt: Date
  },
  baseOpts
);

const SmsMessagesSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    numberId: { type: String, index: true },
    userId: { type: String, index: true },
    phoneNumber: String,
    platform: String,
    platformId: String,
    text: String,
    content: String,
    otp: String,
    otpCode: String,
    from: String,
    receivedAt: Date,
    createdAt: { type: Date, index: true },
    countryId: String,
    provider: String
  },
  baseOpts
);
SmsMessagesSchema.index({ numberId: 1, receivedAt: -1 });

const WithdrawalRequestsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    userId: { type: String, index: true },
    email: String,
    amount: Number,
    currency: String,
    walletAddress: String,
    method: String,
    status: { type: String, index: true },
    note: String,
    createdAt: { type: Date, index: true },
    updatedAt: Date
  },
  baseOpts
);

const ApiKeysSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    label: String,
    apiKey: { type: String, index: true },
    userId: String,
    permissions: Schema.Types.Mixed,
    active: { type: Boolean, default: true },
    createdAt: Date,
    lastUsedAt: Date
  },
  baseOpts
);

const AgentApprovalsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    userId: { type: String, index: true },
    email: String,
    name: String,
    agentEmail: { type: String, index: true },
    status: { type: String, default: 'pending', index: true },
    createdAt: { type: Date, default: Date.now },
    approvedAt: Date
  },
  baseOpts
);

const BroadcastsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    title: String,
    message: String,
    audience: String,
    createdBy: String,
    createdAt: { type: Date, default: Date.now },
    status: { type: String, default: 'sent' }
  },
  baseOpts
);

const AdminStaffSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    username: { type: String, unique: true, index: true },
    passwordHash: String,
    role: { type: String, default: 'staff' },
    displayName: String,
    permissions: Schema.Types.Mixed,
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastLoginAt: Date
  },
  baseOpts
);

const CostRatesSchema = new Schema(
  {
    _id: { type: String },
    countryId: String,
    serverId: String,
    userReward: Number,
    agentReward: Number,
    cost: Number,
    currency: String,
    updatedAt: { type: Date, default: Date.now }
  },
  baseOpts
);
CostRatesSchema.index({ countryId: 1, serverId: 1 }, { unique: true });

const AppConfigSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    type: String,
    smtpConfig: Schema.Types.Mixed,
    mongoConfig: Schema.Types.Mixed,
    updatedAt: { type: Date, default: Date.now }
  },
  baseOpts
);

const SmsProvidersSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    serviceName: String,
    baseUrl: String,
    apiKey: String,
    providerType: String,
    additionalUrls: Schema.Types.Mixed,
    countryId: String,
    serverId: String,
    apiCountryCode: String,
    cliRange: String,
    enabled: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date
  },
  baseOpts
);

const UserApiKeysSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    userId: { type: String, index: true },
    label: String,
    apiKey: { type: String, index: true },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: Date
  },
  baseOpts
);

const SupportSessionsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    visitorName: String,
    visitorEmail: String,
    visitorUid: { type: String, index: true },
    status: { type: String, default: 'open', index: true },
    assignedTo: { type: String, index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
    unreadAdmin: { type: Number, default: 0 },
    unreadVisitor: { type: Number, default: 0 },
    lastMessage: String
  },
  baseOpts
);

const SupportMessagesSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    sessionId: { type: String, index: true },
    from: String,
    text: String,
    imageUrl: String,
    createdAt: { type: Date, default: Date.now }
  },
  baseOpts
);

const GuruPostsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    userId: { type: String, index: true },
    userName: String,
    userEmail: String,
    profilePhotoUrl: String,
    isAdmin: { type: Boolean, default: false },
    isAgent: { type: Boolean, default: false },
    blueVerified: { type: Boolean, default: false },
    text: String,
    imageUrl: String,
    videoUrl: String,
    link: String,
    isPromoted: { type: Boolean, default: false },
    isAdminPinned: { type: Boolean, default: false },
    reportCount: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
    deleted: { type: Boolean, default: false },
    deletedAt: Date
  },
  baseOpts
);
GuruPostsSchema.index({ deleted: 1, createdAt: -1 });

const GuruGroupsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    name: { type: String, index: true },
    description: String,
    memberCount: { type: Number, default: 0 },
    icon: String,
    isPrivate: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    createdBy: String
  },
  baseOpts
);

const GuruGroupMessagesSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    groupId: { type: String, index: true },
    userId: { type: String, index: true },
    userName: String,
    text: String,
    imageUrl: String,
    createdAt: { type: Date, default: Date.now }
  },
  baseOpts
);

const GuruFollowsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    followerId: { type: String, index: true },
    followingId: { type: String, index: true },
    createdAt: { type: Date, default: Date.now }
  },
  baseOpts
);
GuruFollowsSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

const GuruReportsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    type: String,
    postId: { type: String, index: true },
    userId: { type: String, index: true },
    reporterId: { type: String, index: true },
    reason: String,
    at: { type: Date, default: Date.now }
  },
  baseOpts
);

const GuruSettingsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    aiEnabled: Boolean,
    aiApiKey: String,
    aiApiUrl: String,
    aiModel: String,
    pinnedPostId: String,
    allowGuestLogin: Boolean,
    ads: Schema.Types.Mixed,
    config: Schema.Types.Mixed,
    updatedAt: { type: Date, default: Date.now }
  },
  baseOpts
);

const GuruLikesSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    postId: { type: String, index: true },
    userId: { type: String, index: true },
    createdAt: { type: Date, default: Date.now }
  },
  baseOpts
);
GuruLikesSchema.index({ postId: 1, userId: 1 }, { unique: true });

const GuruViewsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    postId: { type: String, index: true },
    userId: { type: String, index: true },
    viewedAt: { type: Date, default: Date.now }
  },
  baseOpts
);
GuruViewsSchema.index({ postId: 1, userId: 1 }, { unique: true });

const GuruCommentsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    postId: { type: String, index: true },
    userId: { type: String, index: true },
    userName: String,
    text: String,
    createdAt: { type: Date, default: Date.now }
  },
  baseOpts
);

const GroupMembersSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    groupId: { type: String, index: true },
    userId: { type: String, index: true },
    role: { type: String, default: 'member' },
    joinedAt: { type: Date, default: Date.now }
  },
  baseOpts
);
GroupMembersSchema.index({ groupId: 1, userId: 1 }, { unique: true });

const GroupBansSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    groupId: { type: String, index: true },
    userId: { type: String, index: true },
    bannedAt: { type: Date, default: Date.now },
    reason: String
  },
  baseOpts
);
GroupBansSchema.index({ groupId: 1, userId: 1 }, { unique: true });

const AnnouncementsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    title: String,
    message: String,
    createdBy: String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date,
    active: { type: Boolean, default: true }
  },
  baseOpts
);

const GuestsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    uid: { type: String, index: true },
    name: String,
    email: String,
    ip: String,
    createdAt: { type: Date, default: Date.now, expires: 86400 },
    lastSeenAt: Date
  },
  baseOpts
);

const AdminSessionsSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    token: { type: String, index: true },
    username: String,
    role: String,
    permissions: Schema.Types.Mixed,
    meta: Schema.Types.Mixed,
    expiresAt: Date,
    createdAt: { type: Date, default: Date.now }
  },
  baseOpts
);
AdminSessionsSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// OTP codes for email verification — auto-expire after 10 minutes
const EmailVerifyCodesSchema = new Schema(
  {
    _id: { type: String },
    id: String,
    email: { type: String, lowercase: true, trim: true },
    code: { type: String },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
  },
  baseOpts
);
EmailVerifyCodesSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
EmailVerifyCodesSchema.index({ email: 1 });

const models = {
  [COLLECTIONS.users]:            mongoose.models[COLLECTIONS.users]            || model(COLLECTIONS.users,            UsersSchema),
  [COLLECTIONS.sessions]:         mongoose.models[COLLECTIONS.sessions]         || model(COLLECTIONS.sessions,         SessionsSchema),
  [COLLECTIONS.countries]:        mongoose.models[COLLECTIONS.countries]        || model(COLLECTIONS.countries,        CountriesSchema),
  [COLLECTIONS.servers]:          mongoose.models[COLLECTIONS.servers]          || model(COLLECTIONS.servers,          ServersSchema),
  [COLLECTIONS.phoneNumbers]:     mongoose.models[COLLECTIONS.phoneNumbers]     || model(COLLECTIONS.phoneNumbers,     PhoneNumbersSchema),
  [COLLECTIONS.platforms]:        mongoose.models[COLLECTIONS.platforms]        || model(COLLECTIONS.platforms,        PlatformsSchema),
  [COLLECTIONS.smsMessages]:      mongoose.models[COLLECTIONS.smsMessages]      || model(COLLECTIONS.smsMessages,      SmsMessagesSchema),
  [COLLECTIONS.withdrawalRequests]:mongoose.models[COLLECTIONS.withdrawalRequests]|| model(COLLECTIONS.withdrawalRequests,WithdrawalRequestsSchema),
  [COLLECTIONS.apiKeys]:          mongoose.models[COLLECTIONS.apiKeys]          || model(COLLECTIONS.apiKeys,          ApiKeysSchema),
  [COLLECTIONS.agentApprovals]:   mongoose.models[COLLECTIONS.agentApprovals]   || model(COLLECTIONS.agentApprovals,   AgentApprovalsSchema),
  [COLLECTIONS.broadcasts]:       mongoose.models[COLLECTIONS.broadcasts]       || model(COLLECTIONS.broadcasts,       BroadcastsSchema),
  [COLLECTIONS.adminStaff]:       mongoose.models[COLLECTIONS.adminStaff]       || model(COLLECTIONS.adminStaff,       AdminStaffSchema),
  [COLLECTIONS.costRates]:        mongoose.models[COLLECTIONS.costRates]        || model(COLLECTIONS.costRates,        CostRatesSchema),
  [COLLECTIONS.appConfig]:        mongoose.models[COLLECTIONS.appConfig]        || model(COLLECTIONS.appConfig,        AppConfigSchema),
  [COLLECTIONS.smsProviders]:     mongoose.models[COLLECTIONS.smsProviders]     || model(COLLECTIONS.smsProviders,     SmsProvidersSchema),
  [COLLECTIONS.userApiKeys]:      mongoose.models[COLLECTIONS.userApiKeys]      || model(COLLECTIONS.userApiKeys,      UserApiKeysSchema),
  [COLLECTIONS.supportSessions]:  mongoose.models[COLLECTIONS.supportSessions]  || model(COLLECTIONS.supportSessions,  SupportSessionsSchema),
  [COLLECTIONS.supportMessages]:  mongoose.models[COLLECTIONS.supportMessages]  || model(COLLECTIONS.supportMessages,  SupportMessagesSchema),
  [COLLECTIONS.guruPosts]:        mongoose.models[COLLECTIONS.guruPosts]        || model(COLLECTIONS.guruPosts,        GuruPostsSchema),
  [COLLECTIONS.guruGroups]:       mongoose.models[COLLECTIONS.guruGroups]       || model(COLLECTIONS.guruGroups,       GuruGroupsSchema),
  [COLLECTIONS.guruGroupMessages]:mongoose.models[COLLECTIONS.guruGroupMessages]|| model(COLLECTIONS.guruGroupMessages,GuruGroupMessagesSchema),
  [COLLECTIONS.guruFollows]:      mongoose.models[COLLECTIONS.guruFollows]      || model(COLLECTIONS.guruFollows,      GuruFollowsSchema),
  [COLLECTIONS.guruReports]:      mongoose.models[COLLECTIONS.guruReports]      || model(COLLECTIONS.guruReports,      GuruReportsSchema),
  [COLLECTIONS.guruSettings]:     mongoose.models[COLLECTIONS.guruSettings]     || model(COLLECTIONS.guruSettings,     GuruSettingsSchema),
  [COLLECTIONS.guruLikes]:        mongoose.models[COLLECTIONS.guruLikes]        || model(COLLECTIONS.guruLikes,        GuruLikesSchema),
  [COLLECTIONS.guruViews]:        mongoose.models[COLLECTIONS.guruViews]        || model(COLLECTIONS.guruViews,        GuruViewsSchema),
  [COLLECTIONS.guruComments]:     mongoose.models[COLLECTIONS.guruComments]     || model(COLLECTIONS.guruComments,     GuruCommentsSchema),
  [COLLECTIONS.groupMembers]:     mongoose.models[COLLECTIONS.groupMembers]     || model(COLLECTIONS.groupMembers,     GroupMembersSchema),
  [COLLECTIONS.groupBans]:        mongoose.models[COLLECTIONS.groupBans]        || model(COLLECTIONS.groupBans,        GroupBansSchema),
  [COLLECTIONS.announcements]:    mongoose.models[COLLECTIONS.announcements]    || model(COLLECTIONS.announcements,    AnnouncementsSchema),
  [COLLECTIONS.guests]:           mongoose.models[COLLECTIONS.guests]           || model(COLLECTIONS.guests,           GuestsSchema),
  [COLLECTIONS.adminSessions]:    mongoose.models[COLLECTIONS.adminSessions]    || model(COLLECTIONS.adminSessions,    AdminSessionsSchema),
  [COLLECTIONS.emailVerifyCodes]: mongoose.models[COLLECTIONS.emailVerifyCodes] || model(COLLECTIONS.emailVerifyCodes, EmailVerifyCodesSchema)
};

async function syncIndexes() {
  for (const name of Object.keys(models)) {
    try {
      await models[name].syncIndexes();
    } catch (err) {
      console.warn(`Index sync warning for ${name}:`, err.message);
    }
  }
}

module.exports = {
  COLLECTIONS,
  models,
  schemas: {
    users: UsersSchema,
    sessions: SessionsSchema,
    countries: CountriesSchema,
    servers: ServersSchema,
    phoneNumbers: PhoneNumbersSchema,
    platforms: PlatformsSchema,
    smsMessages: SmsMessagesSchema,
    withdrawalRequests: WithdrawalRequestsSchema,
    apiKeys: ApiKeysSchema,
    agentApprovals: AgentApprovalsSchema,
    broadcasts: BroadcastsSchema,
    adminStaff: AdminStaffSchema,
    costRates: CostRatesSchema,
    appConfig: AppConfigSchema,
    smsProviders: SmsProvidersSchema,
    userApiKeys: UserApiKeysSchema,
    supportSessions: SupportSessionsSchema,
    supportMessages: SupportMessagesSchema,
    guruPosts: GuruPostsSchema,
    guruGroups: GuruGroupsSchema,
    guruGroupMessages: GuruGroupMessagesSchema,
    guruFollows: GuruFollowsSchema,
    guruReports: GuruReportsSchema,
    guruSettings: GuruSettingsSchema,
    guruLikes: GuruLikesSchema,
    guruViews: GuruViewsSchema,
    guruComments: GuruCommentsSchema,
    groupMembers: GroupMembersSchema,
    groupBans: GroupBansSchema,
    announcements: AnnouncementsSchema,
    guests: GuestsSchema,
    adminSessions: AdminSessionsSchema,
    emailVerifyCodes: EmailVerifyCodesSchema
  },
  syncIndexes,
  model: (name) => models[name]
};
