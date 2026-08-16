import type {
  FeedDTO,
  MuteScopeDTO,
  NotificationListDTO,
  PostDTO,
  ProfileDTO,
  ProfileListDTO,
  SavedFeedDTO,
  TrendListDTO,
  UpdateInfoDTO,
} from './dto';

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
          RestoreSession(): Promise<string>;
          Logout(): Promise<void>;
        };
        FeedService: {
          GetTimeline(cursor: string, limit: number): Promise<FeedDTO>;
          GetAuthorFeed(actor: string, cursor: string, limit: number, filter?: string): Promise<FeedDTO>;
          GetSavedFeeds(): Promise<SavedFeedDTO[]>;
          GetCustomFeed(feedUri: string, cursor: string, limit: number): Promise<FeedDTO>;
          GetPostThread(uri: string, depth: number): Promise<FeedDTO>;
          GetListFeed(listUri: string, cursor: string, limit: number): Promise<FeedDTO>;
          GetPopularFeedGenerators(cursor: string, query: string): Promise<any>;
          GetRepostedBy(uri: string, cid: string, cursor: string): Promise<ProfileListDTO>;
          GetQuotes(uri: string, cid: string, cursor: string): Promise<FeedDTO>;
          GetLikes(uri: string, cid: string, cursor: string): Promise<ProfileListDTO>;
          GetActorLikes(actor: string, cursor: string, limit: number): Promise<FeedDTO>;
          GetPosts(uris: string[]): Promise<FeedDTO>;
          GetTrends(limit: number): Promise<TrendListDTO>;
        };
        PostBuilderService: {
          CreatePost(text: string, replyUri: string, replyCid: string, images: string[], alts: string[], videoPath: string, videoAlt: string, linkUrl: string, language: string, threadgate: string): Promise<any>;
          LikePost(uri: string, cid: string): Promise<string>;
          UnlikePost(likeUri: string): Promise<void>;
          Repost(uri: string, cid: string): Promise<string>;
          QuotePost(text: string, quoteUri: string, quoteCid: string, images: string[], alts: string[], videoPath: string, videoAlt: string, language: string, threadgate: string): Promise<any>;
          DeletePost(uri: string): Promise<void>;
          DeleteRepost(repostUri: string): Promise<void>;
          HideReply(postUri: string, replyUri: string): Promise<void>;
          FetchLinkCard(url: string): Promise<any>;
        };
        NotificationsService: {
          GetNotifications(cursor: string): Promise<NotificationListDTO>;
          UpdateSeen(seenAt: string): Promise<void>;
        };
        SocialService: {
          GetProfile(actor: string): Promise<ProfileDTO>;
          GetLabelerServices(dids: string[]): Promise<any>;
          GetSubscribedLabelerDIDs(): Promise<string[]>;
          GetSubscribedLabelers(): Promise<any>;
          SubscribeLabeler(labelerDid: string): Promise<void>;
          UnsubscribeLabeler(labelerDid: string): Promise<void>;
          Follow(actorDID: string): Promise<void>;
          Unfollow(followURI: string): Promise<void>;
          GetActorLists(actorDID: string, cursor: string): Promise<any>;
          GetActorStarterPacks(actorDID: string, cursor: string): Promise<any>;
          GetFollowers(actor: string, cursor: string): Promise<ProfileListDTO>;
          GetFollows(actor: string, cursor: string): Promise<ProfileListDTO>;
          GetPreferences(): Promise<any>;
          UpdateMutedWords(words: string[]): Promise<void>;
          UpdateAdultContentEnabled(enabled: boolean): Promise<void>;
          UpdateContentFilters(filters: any[]): Promise<void>;
          UpdateThreadPreferences(sort: string, prioritizeFollowed: boolean): Promise<void>;
          UpdateAllPreferences(threadSort: string, adultContent: boolean, mutedWords: string[], filters: any[]): Promise<void>;
          UpdateSavedFeeds(pinnedUris: string[], savedUris: string[]): Promise<void>;
          UpdateProfile(displayName: string, description: string): Promise<void>;
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
        };
        ChatService: {
          ListConvos(cursor: string): Promise<any[]>;
          GetMessages(convoId: string, cursor: string): Promise<any>;
          SendMessage(convoId: string, text: string): Promise<void>;
          SendMessageWithGif(convoId: string, text: string, gifUrl: string): Promise<void>;
          SendReply(convoId: string, replyToMessageId: string, text: string, gifUrl: string): Promise<void>;
          AddReaction(convoId: string, messageId: string, emoji: string): Promise<void>;
          RemoveReaction(convoId: string, messageId: string, emoji: string): Promise<void>;
          GetConvoForMembers(members: string[]): Promise<any>;
          UpdateReadStatus(convoId: string, messageId: string): Promise<void>;
          DeleteMessage(convoId: string, messageId: string): Promise<void>;
          MuteConvo(convoId: string): Promise<void>;
          UnmuteConvo(convoId: string): Promise<void>;
          LeaveConvo(convoId: string): Promise<void>;
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
        };
        SearchService: {
          SearchPosts(filter: PostSearchFilter): Promise<FeedDTO>;
          SearchProfiles(query: string, cursor: string): Promise<ProfileListDTO>;
          SearchProfilesTypeahead(query: string): Promise<ProfileListDTO>;
        };
      };
      main: {
        App: any;
      }
    }
  }
}
export interface ListDTO {
  uri: string;
  cid: string;
  name: string;
  purpose: string;
  description: string;
  creator: string;
  creatorDid?: string;
  creatorHandle?: string;
  avatar?: string;
  listItemCount?: number;
  viewerMuted?: boolean;
  viewerBlock?: string;
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
  Cursor: string;
}
