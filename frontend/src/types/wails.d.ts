import type {
  AccountStatusDTO,
  ActivitySubscriptionDTO,
  AgeAssuranceStateDTO,
  AppPasswordDTO,
  ChatAvailabilityDTO,
  ChatConvoDTO,
  ChatGroupJoinLinkDTO,
  ChatJoinRequestListDTO,
  ChatMessagesDTO,
  ContentFilterDTO,
  DraftListDTO,
  ExternalEmbedDTO,
  FeedDTO,
  FeedGeneratorDTO,
  FeedGeneratorResponseDTO,
  LabelerDTO,
  ListDTO,
  ListMembershipResponseDTO,
  ListResponseDTO,
  MuteScopeDTO,
  NotificationListDTO,
  NotificationPreferencesDTO,
  PostDTO,
  PostRefDTO,
  PreferencesDTO,
  ProfileDTO,
  ProfileLinkDTO,
  ProfileListDTO,
  RelationshipDTO,
  SavedAccountDTO,
  SavedFeedDTO,
  StarterPackDTO,
  StarterPackMembershipResponseDTO,
  StarterPackResponseDTO,
  TrendListDTO,
  UpdateInfoDTO,
  VideoUploadLimitsDTO,
} from './dto';

export type { ListDTO };

declare global {
  interface Window {
    /** Wails runtime, injected by the Go side. */
    runtime: {
      BrowserOpenURL(url: string): void;
      EventsOn(event: string, callback: (...data: any[]) => void): () => void;
      EventsOff(event: string, ...additional: string[]): void;
      EventsEmit(event: string, ...data: any[]): void;
      Quit(): void;
    };
    go: {
      services: {
        AuthService: {
          Login(identifier: string, password: string, remember: boolean): Promise<void>;
          LoginWithFactor(identifier: string, password: string, authFactorToken: string, remember: boolean): Promise<void>;
          RestoreSession(): Promise<string>;
          Logout(): Promise<void>;
          ListAccounts(): Promise<SavedAccountDTO[]>;
          SwitchAccount(did: string): Promise<string>;
          RemoveAccount(did: string): Promise<void>;
          RequestPasswordReset(email: string): Promise<void>;
          ResetPassword(token: string, newPassword: string): Promise<void>;
          ListAppPasswords(): Promise<AppPasswordDTO[]>;
          CreateAppPassword(name: string, privileged: boolean): Promise<AppPasswordDTO>;
          RevokeAppPassword(name: string): Promise<void>;
          RequestEmailUpdate(): Promise<boolean>;
          UpdateEmail(email: string, token: string): Promise<void>;
          DeactivateAccount(): Promise<void>;
          CheckAccountStatus(): Promise<AccountStatusDTO>;
        };
        FeedService: {
          GetTimeline(cursor: string, limit: number): Promise<FeedDTO>;
          GetAuthorFeed(actor: string, cursor: string, limit: number, filter?: string): Promise<FeedDTO>;
          GetSavedFeeds(): Promise<SavedFeedDTO[]>;
          GetCustomFeed(feedUri: string, cursor: string, limit: number): Promise<FeedDTO>;
          GetPostThread(uri: string, depth: number): Promise<FeedDTO>;
          GetPostThreadV2(uri: string): Promise<FeedDTO>;
          GetPostThreadOtherV2(uri: string): Promise<FeedDTO>;
          GetListFeed(listUri: string, cursor: string, limit: number): Promise<FeedDTO>;
          GetPopularFeedGenerators(cursor: string, query: string): Promise<FeedGeneratorResponseDTO>;
          GetSuggestedFeeds(cursor: string): Promise<FeedGeneratorResponseDTO>;
          GetActorFeeds(actor: string, cursor: string): Promise<FeedGeneratorResponseDTO>;
          GetFeedGenerator(feedUri: string): Promise<FeedGeneratorDTO>;
          LikeFeedGenerator(uri: string, cid: string): Promise<string>;
          UnlikeFeedGenerator(likeUri: string): Promise<void>;
          SendFeedInteraction(feedUri: string, itemUri: string, event: string, feedContext: string): Promise<void>;
          GetRepostedBy(uri: string, cid: string, cursor: string): Promise<ProfileListDTO>;
          GetQuotes(uri: string, cid: string, cursor: string): Promise<FeedDTO>;
          GetLikes(uri: string, cid: string, cursor: string): Promise<ProfileListDTO>;
          GetActorLikes(actor: string, cursor: string, limit: number): Promise<FeedDTO>;
          GetPosts(uris: string[]): Promise<FeedDTO>;
          GetTrends(limit: number): Promise<TrendListDTO>;
          GetBookmarks(cursor: string, limit: number): Promise<FeedDTO>;
        };
        PostBuilderService: {
          CreatePost(text: string, replyUri: string, replyCid: string, rootUri: string, rootCid: string, images: string[], alts: string[], videoPath: string, videoAlt: string, linkUrl: string, language: string, threadgate: string, gifUrl: string, videoWidth: number, videoHeight: number, listUris: string[]): Promise<PostRefDTO>;
          LikePost(uri: string, cid: string): Promise<string>;
          UnlikePost(likeUri: string): Promise<void>;
          Repost(uri: string, cid: string): Promise<string>;
          QuotePost(text: string, quoteUri: string, quoteCid: string, images: string[], alts: string[], videoPath: string, videoAlt: string, language: string, threadgate: string, gifUrl: string, videoWidth: number, videoHeight: number, listUris: string[]): Promise<PostRefDTO>;
          DeletePost(uri: string): Promise<void>;
          DeleteRepost(repostUri: string): Promise<void>;
          HideReply(postUri: string, replyUri: string): Promise<void>;
          UnhideReply(postUri: string, replyUri: string): Promise<void>;
          UpdateThreadgate(postUri: string, ruleSpec: string, listUris: string[]): Promise<void>;
          TogglePostQuotes(postUri: string, disableQuotes: boolean): Promise<void>;
          DetachQuote(quotedPostUri: string, quotingPostUri: string): Promise<void>;
          ReattachQuote(quotedPostUri: string, quotingPostUri: string): Promise<void>;
          ApplyPostExtras(postUri: string, selfLabels: string[], disableQuotes: boolean, captionPath: string, captionLang: string): Promise<void>;
          GetVideoUploadLimits(): Promise<VideoUploadLimitsDTO>;
          GetDrafts(cursor: string): Promise<DraftListDTO>;
          CreateDraft(text: string, langs: string[], selfLabels: string[], threadgateAllow: string[], disableQuotes: boolean): Promise<string>;
          UpdateDraft(id: string, text: string, langs: string[], selfLabels: string[], threadgateAllow: string[], disableQuotes: boolean): Promise<void>;
          DeleteDraft(id: string): Promise<void>;
          FetchLinkCard(url: string): Promise<ExternalEmbedDTO>;
          BookmarkPost(uri: string, cid: string): Promise<string>;
          UnbookmarkPost(bookmarkUri: string, postUri: string): Promise<void>;
        };
        NotificationsService: {
          GetNotifications(cursor: string): Promise<NotificationListDTO>;
          GetNotificationsFiltered(cursor: string, reasons: string[], priority: boolean): Promise<NotificationListDTO>;
          UpdateSeen(seenAt: string): Promise<void>;
          PutActivitySubscription(subject: string, post: boolean, reply: boolean): Promise<ActivitySubscriptionDTO>;
          ListActivitySubscriptions(cursor: string): Promise<ProfileListDTO>;
          GetNotificationPreferences(): Promise<NotificationPreferencesDTO>;
          PutNotificationPreferences(prefs: NotificationPreferencesDTO): Promise<NotificationPreferencesDTO>;
        };
        SocialService: {
          GetProfile(actor: string): Promise<ProfileDTO>;
          GetLabelerServices(dids: string[]): Promise<LabelerDTO[]>;
          GetSubscribedLabelerDIDs(): Promise<string[]>;
          GetSubscribedLabelers(): Promise<LabelerDTO[]>;
          SubscribeLabeler(labelerDid: string): Promise<void>;
          UnsubscribeLabeler(labelerDid: string): Promise<void>;
          Follow(actorDID: string): Promise<void>;
          Unfollow(followURI: string): Promise<void>;
          GetActorLists(actorDID: string, cursor: string): Promise<ListResponseDTO>;
          GetMutedLists(cursor: string): Promise<ListResponseDTO>;
          GetBlockedLists(cursor: string): Promise<ListResponseDTO>;
          GetListsWithMembership(actor: string, cursor: string): Promise<ListMembershipResponseDTO>;
          GetActorStarterPacks(actorDID: string, cursor: string): Promise<StarterPackResponseDTO>;
          GetStarterPacksWithMembership(actor: string, cursor: string): Promise<StarterPackMembershipResponseDTO>;
          SearchStarterPacks(query: string, cursor: string): Promise<StarterPackResponseDTO>;
          GetStarterPack(uri: string): Promise<StarterPackDTO>;
          GetStarterPacks(uris: string[]): Promise<StarterPackResponseDTO>;
          EditStarterPack(uri: string, name: string, description: string, listUri: string, feedUris: string[]): Promise<void>;
          GetRelationships(actor: string, others: string[]): Promise<RelationshipDTO[]>;
          SetActorStatus(status: string, externalUri: string, externalTitle: string, externalDesc: string, durationMinutes: number): Promise<void>;
          ClearActorStatus(): Promise<void>;
          GetFollowers(actor: string, cursor: string): Promise<ProfileListDTO>;
          GetFollows(actor: string, cursor: string): Promise<ProfileListDTO>;
          GetPreferences(): Promise<PreferencesDTO>;
          UpdateMutedWords(words: string[]): Promise<void>;
          AddMutedWordAdvanced(word: string, targets: string[], actorTarget: string, expiresAt: string): Promise<void>;
          UpdateAdultContentEnabled(enabled: boolean): Promise<void>;
          UpdateContentFilters(filters: ContentFilterDTO[]): Promise<void>;
          UpdateThreadPreferences(sort: string, prioritizeFollowed: boolean): Promise<void>;
          UpdateAllPreferences(threadSort: string, adultContent: boolean, mutedWords: string[], filters: ContentFilterDTO[]): Promise<void>;
          UpdateFeedViewPrefs(hideReplies: boolean, hideReposts: boolean, hideQuotePosts: boolean, hideRepliesByUnfollowed: boolean): Promise<void>;
          HidePostForMe(uri: string): Promise<void>;
          UnhidePostForMe(uri: string): Promise<void>;
          UpdatePostInteractionDefaults(threadgateRules: string[], disableQuotes: boolean): Promise<void>;
          UpdateInterests(tags: string[]): Promise<void>;
          UpdateVerificationPrefs(hideBadges: boolean): Promise<void>;
          UpdateSavedFeeds(pinnedUris: string[], savedUris: string[]): Promise<void>;
          UpdateProfile(displayName: string, description: string): Promise<void>;
          UpdateProfileWithLinks(displayName: string, description: string, pronouns: string, links: ProfileLinkDTO[]): Promise<void>;
          UploadProfileAvatar(imagePath: string): Promise<void>;
          UploadProfileBanner(imagePath: string): Promise<void>;
          CreateList(name: string, purpose: string, description: string): Promise<void>;
          EditList(uri: string, name: string, purpose: string, description: string): Promise<void>;
          DeleteList(uri: string): Promise<void>;
          SubscribeList(listUri: string): Promise<void>;
          UnsubscribeList(listUri: string): Promise<void>;
          MuteList(uri: string): Promise<void>;
          UnmuteList(uri: string): Promise<void>;
          BlockList(uri: string): Promise<void>;
          UnblockList(blockUri: string): Promise<void>;
          CreateStarterPack(name: string, description: string, listUri: string): Promise<void>;
          DeleteStarterPack(uri: string): Promise<void>;
          PinPost(postUri: string, cid: string): Promise<void>;
          UnpinPost(): Promise<void>;
          AddUserToList(listUri: string, subjectDid: string): Promise<string>;
          RemoveUserFromList(itemUri: string): Promise<void>;
          GetListMembers(listUri: string, cursor: string): Promise<ProfileListDTO>;
          FollowAllInList(listUri: string): Promise<number>;
          AddSelfLabel(val: string): Promise<void>;
          RemoveSelfLabel(val: string): Promise<void>;
          GetSelfLabels(): Promise<string[]>;
          GetKnownFollowers(actor: string, cursor: string): Promise<ProfileListDTO>;
          GetSuggestedFollows(): Promise<ProfileListDTO>;
          UpdateHandle(newHandle: string): Promise<void>;
          ExportRepoCAR(): Promise<string>;
          GetAgeAssuranceState(countryCode: string, regionCode: string): Promise<AgeAssuranceStateDTO>;
          BeginAgeAssurance(countryCode: string, regionCode: string, email: string, language: string): Promise<AgeAssuranceStateDTO>;
          StartPhoneVerification(phone: string): Promise<void>;
          VerifyPhone(phone: string, code: string): Promise<string>;
          ImportContacts(token: string, contacts: string[]): Promise<number>;
          GetContactMatches(cursor: string): Promise<ProfileListDTO>;
          RemoveContactData(): Promise<void>;
        };
        ChatService: {
          ListConvos(cursor: string): Promise<ChatConvoDTO[]>;
          GetMessages(convoId: string, cursor: string): Promise<ChatMessagesDTO>;
          SendMessage(convoId: string, text: string): Promise<void>;
          SendMessageWithGif(convoId: string, text: string, gifUrl: string): Promise<void>;
          SendReply(convoId: string, replyToMessageId: string, text: string, gifUrl: string): Promise<void>;
          SendMessageWithEmbed(convoId: string, text: string, embedUri: string, embedCid: string): Promise<void>;
          AddReaction(convoId: string, messageId: string, emoji: string): Promise<void>;
          RemoveReaction(convoId: string, messageId: string, emoji: string): Promise<void>;
          GetConvoForMembers(members: string[]): Promise<ChatConvoDTO>;
          GetConvoAvailability(actorOrDid: string): Promise<ChatAvailabilityDTO>;
          UpdateReadStatus(convoId: string, messageId: string): Promise<void>;
          UpdateAllRead(): Promise<number>;
          DeleteMessage(convoId: string, messageId: string): Promise<void>;
          MuteConvo(convoId: string): Promise<void>;
          UnmuteConvo(convoId: string): Promise<void>;
          LeaveConvo(convoId: string): Promise<void>;
          GetChatDeclaration(): Promise<string>;
          UpdateChatDeclaration(allowIncoming: string): Promise<void>;
          CreateGroup(name: string, memberActors: string[]): Promise<ChatConvoDTO>;
          EditGroup(convoId: string, name: string): Promise<ChatConvoDTO>;
          AddGroupMembers(convoId: string, memberActors: string[]): Promise<ChatConvoDTO>;
          RemoveGroupMembers(convoId: string, memberActors: string[]): Promise<ChatConvoDTO>;
          LockConvo(convoId: string): Promise<ChatConvoDTO>;
          UnlockConvo(convoId: string): Promise<ChatConvoDTO>;
          CreateGroupJoinLink(convoId: string, requireApproval: boolean): Promise<ChatGroupJoinLinkDTO>;
          EnableGroupJoinLink(convoId: string): Promise<ChatGroupJoinLinkDTO>;
          DisableGroupJoinLink(convoId: string): Promise<ChatGroupJoinLinkDTO>;
          ListGroupJoinRequests(convoId: string, cursor: string): Promise<ChatJoinRequestListDTO>;
          ApproveGroupJoinRequest(convoId: string, memberDid: string): Promise<void>;
          RejectGroupJoinRequest(convoId: string, memberDid: string): Promise<void>;
        };
        ModerationService: {
          MuteActor(actor: string): Promise<void>;
          MuteActorScoped(actor: string, onlyReposts: boolean, onlyQuoteposts: boolean): Promise<void>;
          GetMuteScope(actor: string): Promise<MuteScopeDTO>;
          BlockActor(actorDID: string): Promise<void>;
          GetMutes(cursor: string): Promise<ProfileListDTO>;
          GetBlocks(cursor: string): Promise<ProfileListDTO>;
          UnmuteActor(actorDID: string): Promise<void>;
          UnblockActor(actorDID: string): Promise<void>;
          MuteThread(uri: string): Promise<void>;
          UnmuteThread(uri: string): Promise<void>;
          ReportPost(uri: string, cid: string, reasonType: string, reason: string): Promise<void>;
          ReportAccount(did: string, reasonType: string, reason: string): Promise<void>;
          ReportChatMessage(convoId: string, messageId: string, offenderDid: string, reasonType: string, reason: string): Promise<void>;
        };
        SearchService: {
          SearchPosts(filter: PostSearchFilter): Promise<FeedDTO>;
          SearchProfiles(query: string, cursor: string): Promise<ProfileListDTO>;
          SearchProfilesTypeahead(query: string): Promise<ProfileListDTO>;
        };
        UpdaterService: {
          CheckForUpdate(): Promise<UpdateInfoDTO>;
        };
      };
      main: {
        App: any;
      }
    }
  }
}

export {};

/** Mirrors services.PostSearchFilter on the Go side. */
export interface PostSearchFilter {
  Query: string;
  Author: string;
  Lang: string;
  Sort: string;
  Since: string;
  Until: string;
  Domain?: string;
  Mentions?: string;
  Tag?: string[];
  URL?: string;
  Cursor: string;
}

