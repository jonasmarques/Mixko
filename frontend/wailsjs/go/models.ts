export namespace services {
	
	export class AccountStatusDTO {
	    activated: boolean;
	    validDid: boolean;
	    repoCommit: string;
	    repoRev: string;
	    repoBlocks: number;
	    indexedRecords: number;
	    privateStateValues: number;
	    expectedBlobs: number;
	    importedBlobs: number;
	
	    static createFrom(source: any = {}) {
	        return new AccountStatusDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.activated = source["activated"];
	        this.validDid = source["validDid"];
	        this.repoCommit = source["repoCommit"];
	        this.repoRev = source["repoRev"];
	        this.repoBlocks = source["repoBlocks"];
	        this.indexedRecords = source["indexedRecords"];
	        this.privateStateValues = source["privateStateValues"];
	        this.expectedBlobs = source["expectedBlobs"];
	        this.importedBlobs = source["importedBlobs"];
	    }
	}
	export class ActivitySubscriptionDTO {
	    post: boolean;
	    reply: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ActivitySubscriptionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.post = source["post"];
	        this.reply = source["reply"];
	    }
	}
	export class ActorStatusDTO {
	    status: string;
	    uri?: string;
	    title?: string;
	    description?: string;
	    expiresAt?: string;
	    isActive: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ActorStatusDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.uri = source["uri"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.expiresAt = source["expiresAt"];
	        this.isActive = source["isActive"];
	    }
	}
	export class AgeAssuranceStateDTO {
	    status: string;
	    access: string;
	    lastInitiatedAt?: string;
	
	    static createFrom(source: any = {}) {
	        return new AgeAssuranceStateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.access = source["access"];
	        this.lastInitiatedAt = source["lastInitiatedAt"];
	    }
	}
	export class AppPasswordDTO {
	    name: string;
	    password?: string;
	    createdAt: string;
	    privileged: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AppPasswordDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.password = source["password"];
	        this.createdAt = source["createdAt"];
	        this.privileged = source["privileged"];
	    }
	}
	export class ChatMemberDTO {
	    did: string;
	    handle: string;
	    displayName: string;
	    avatar?: string;
	
	    static createFrom(source: any = {}) {
	        return new ChatMemberDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.did = source["did"];
	        this.handle = source["handle"];
	        this.displayName = source["displayName"];
	        this.avatar = source["avatar"];
	    }
	}
	export class ChatConvoDTO {
	    id: string;
	    rev: string;
	    members: ChatMemberDTO[];
	    lastMessage: string;
	    unreadCount: number;
	    muted: boolean;
	    cursor?: string;
	    isGroup?: boolean;
	    groupName?: string;
	    lockStatus?: string;
	    joinLinkCode?: string;
	    joinLinkEnabled?: boolean;
	    joinLinkRequireApproval?: boolean;
	    joinRequestCount?: number;
	    unreadJoinRequestCount?: number;
	    memberCount?: number;
	    memberLimit?: number;
	
	    static createFrom(source: any = {}) {
	        return new ChatConvoDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.rev = source["rev"];
	        this.members = this.convertValues(source["members"], ChatMemberDTO);
	        this.lastMessage = source["lastMessage"];
	        this.unreadCount = source["unreadCount"];
	        this.muted = source["muted"];
	        this.cursor = source["cursor"];
	        this.isGroup = source["isGroup"];
	        this.groupName = source["groupName"];
	        this.lockStatus = source["lockStatus"];
	        this.joinLinkCode = source["joinLinkCode"];
	        this.joinLinkEnabled = source["joinLinkEnabled"];
	        this.joinLinkRequireApproval = source["joinLinkRequireApproval"];
	        this.joinRequestCount = source["joinRequestCount"];
	        this.unreadJoinRequestCount = source["unreadJoinRequestCount"];
	        this.memberCount = source["memberCount"];
	        this.memberLimit = source["memberLimit"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ChatAvailabilityDTO {
	    canChat: boolean;
	    convoId?: string;
	    convo?: ChatConvoDTO;
	
	    static createFrom(source: any = {}) {
	        return new ChatAvailabilityDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.canChat = source["canChat"];
	        this.convoId = source["convoId"];
	        this.convo = this.convertValues(source["convo"], ChatConvoDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ChatDeclarationDTO {
	    allowIncoming: string;
	    allowGroupInvites: string;
	
	    static createFrom(source: any = {}) {
	        return new ChatDeclarationDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.allowIncoming = source["allowIncoming"];
	        this.allowGroupInvites = source["allowGroupInvites"];
	    }
	}
	export class ChatGroupJoinLinkDTO {
	    code: string;
	    createdAt: string;
	    enabledStatus: string;
	    joinRule: string;
	    requireApproval: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ChatGroupJoinLinkDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.createdAt = source["createdAt"];
	        this.enabledStatus = source["enabledStatus"];
	        this.joinRule = source["joinRule"];
	        this.requireApproval = source["requireApproval"];
	    }
	}
	export class ChatGroupPreviewDTO {
	    code: string;
	    convoId: string;
	    name: string;
	    memberCount: number;
	    memberLimit: number;
	    ownerHandle: string;
	    ownerDisplayName: string;
	    requireApproval: boolean;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new ChatGroupPreviewDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.convoId = source["convoId"];
	        this.name = source["name"];
	        this.memberCount = source["memberCount"];
	        this.memberLimit = source["memberLimit"];
	        this.ownerHandle = source["ownerHandle"];
	        this.ownerDisplayName = source["ownerDisplayName"];
	        this.requireApproval = source["requireApproval"];
	        this.status = source["status"];
	    }
	}
	export class ChatJoinRequestDTO {
	    convoId: string;
	    requestedAt: string;
	    requestedBy: ChatMemberDTO;
	
	    static createFrom(source: any = {}) {
	        return new ChatJoinRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.convoId = source["convoId"];
	        this.requestedAt = source["requestedAt"];
	        this.requestedBy = this.convertValues(source["requestedBy"], ChatMemberDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ChatJoinRequestListDTO {
	    cursor: string;
	    requests: ChatJoinRequestDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ChatJoinRequestListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.requests = this.convertValues(source["requests"], ChatJoinRequestDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ChatReactionDTO {
	    value: string;
	    senderDid: string;
	    isMine: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ChatReactionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.value = source["value"];
	        this.senderDid = source["senderDid"];
	        this.isMine = source["isMine"];
	    }
	}
	export class ChatMessageDTO {
	    id: string;
	    rev: string;
	    sender: string;
	    senderDid: string;
	    senderHandle?: string;
	    senderDisplayName?: string;
	    text: string;
	    sentAt: string;
	    embedUri?: string;
	    replyToMessageId?: string;
	    replyToMessageText?: string;
	    replyToSender?: string;
	    replyToSenderDid?: string;
	    replyToSenderHandle?: string;
	    replyToSenderDisplayName?: string;
	    reactions?: ChatReactionDTO[];
	    joinLinkCode?: string;
	    joinLinkGroupName?: string;
	
	    static createFrom(source: any = {}) {
	        return new ChatMessageDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.rev = source["rev"];
	        this.sender = source["sender"];
	        this.senderDid = source["senderDid"];
	        this.senderHandle = source["senderHandle"];
	        this.senderDisplayName = source["senderDisplayName"];
	        this.text = source["text"];
	        this.sentAt = source["sentAt"];
	        this.embedUri = source["embedUri"];
	        this.replyToMessageId = source["replyToMessageId"];
	        this.replyToMessageText = source["replyToMessageText"];
	        this.replyToSender = source["replyToSender"];
	        this.replyToSenderDid = source["replyToSenderDid"];
	        this.replyToSenderHandle = source["replyToSenderHandle"];
	        this.replyToSenderDisplayName = source["replyToSenderDisplayName"];
	        this.reactions = this.convertValues(source["reactions"], ChatReactionDTO);
	        this.joinLinkCode = source["joinLinkCode"];
	        this.joinLinkGroupName = source["joinLinkGroupName"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ChatMessagesDTO {
	    cursor: string;
	    messages: ChatMessageDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ChatMessagesDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.messages = this.convertValues(source["messages"], ChatMessageDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ChatNotificationPrefsDTO {
	    chatInclude: string;
	    chatPush: boolean;
	    chatRequestInclude: string;
	    chatRequestPush: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ChatNotificationPrefsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.chatInclude = source["chatInclude"];
	        this.chatPush = source["chatPush"];
	        this.chatRequestInclude = source["chatRequestInclude"];
	        this.chatRequestPush = source["chatRequestPush"];
	    }
	}
	
	export class ChatStatusDTO {
	    canCreateGroups: boolean;
	    chatDisabled: boolean;
	    groupMemberLimit: number;
	
	    static createFrom(source: any = {}) {
	        return new ChatStatusDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.canCreateGroups = source["canCreateGroups"];
	        this.chatDisabled = source["chatDisabled"];
	        this.groupMemberLimit = source["groupMemberLimit"];
	    }
	}
	export class ContentFilterDTO {
	    labelerDid: string;
	    label: string;
	    visibility: string;
	
	    static createFrom(source: any = {}) {
	        return new ContentFilterDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.labelerDid = source["labelerDid"];
	        this.label = source["label"];
	        this.visibility = source["visibility"];
	    }
	}
	export class DraftDTO {
	    id: string;
	    text: string;
	    posts?: string[];
	    langs?: string[];
	    selfLabels?: string[];
	    threadgateAllow?: string[];
	    disableQuotes?: boolean;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new DraftDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.text = source["text"];
	        this.posts = source["posts"];
	        this.langs = source["langs"];
	        this.selfLabels = source["selfLabels"];
	        this.threadgateAllow = source["threadgateAllow"];
	        this.disableQuotes = source["disableQuotes"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class DraftListDTO {
	    cursor: string;
	    drafts: DraftDTO[];
	
	    static createFrom(source: any = {}) {
	        return new DraftListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.drafts = this.convertValues(source["drafts"], DraftDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ExternalEmbedDTO {
	    uri: string;
	    title: string;
	    description: string;
	    thumb: string;
	    sourceTitle: string;
	    sourceUri: string;
	
	    static createFrom(source: any = {}) {
	        return new ExternalEmbedDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.thumb = source["thumb"];
	        this.sourceTitle = source["sourceTitle"];
	        this.sourceUri = source["sourceUri"];
	    }
	}
	export class VideoCaptionDTO {
	    lang: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new VideoCaptionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lang = source["lang"];
	        this.url = source["url"];
	    }
	}
	export class VideoEmbedDTO {
	    playlist: string;
	    thumbnail: string;
	    alt: string;
	    presentation: string;
	    captions?: VideoCaptionDTO[];
	
	    static createFrom(source: any = {}) {
	        return new VideoEmbedDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.playlist = source["playlist"];
	        this.thumbnail = source["thumbnail"];
	        this.alt = source["alt"];
	        this.presentation = source["presentation"];
	        this.captions = this.convertValues(source["captions"], VideoCaptionDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ImageDTO {
	    thumb: string;
	    fullsize: string;
	    alt: string;
	    width?: number;
	    height?: number;
	
	    static createFrom(source: any = {}) {
	        return new ImageDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.thumb = source["thumb"];
	        this.fullsize = source["fullsize"];
	        this.alt = source["alt"];
	        this.width = source["width"];
	        this.height = source["height"];
	    }
	}
	export class PostDTO {
	    uri: string;
	    cid: string;
	    authorName: string;
	    authorHandle: string;
	    authorDid: string;
	    authorPronouns?: string;
	    authorVerified?: boolean;
	    authorIsBot?: boolean;
	    text: string;
	    createdAt: string;
	    replyCount: number;
	    repostCount: number;
	    likeCount: number;
	    quoteCount?: number;
	    bookmarkCount?: number;
	    knownLikers?: string[];
	    opThreadPostCount?: number;
	    opThreadPostIndex?: number;
	    isReply: boolean;
	    replyToAuthor: string;
	    replyToAuthorName?: string;
	    replyToUri: string;
	    rootAuthor: string;
	    rootAuthorName?: string;
	    rootUri: string;
	    parentPost?: PostDTO;
	    rootPost?: PostDTO;
	    repostedBy: string;
	    repostedByHandle: string;
	    quotePost?: PostDTO;
	    quoteDetached?: boolean;
	    quoteDetachedUri?: string;
	    imageAlts: string[];
	    images: ImageDTO[];
	    external?: ExternalEmbedDTO;
	    video?: VideoEmbedDTO;
	    hasMedia: boolean;
	    labels?: string[];
	    viewerLike: string;
	    viewerRepost: string;
	    viewerBookmark: string;
	    viewerThreadMuted: boolean;
	    embeddingDisabled?: boolean;
	    replyDisabled?: boolean;
	    feedContext?: string;
	
	    static createFrom(source: any = {}) {
	        return new PostDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.authorName = source["authorName"];
	        this.authorHandle = source["authorHandle"];
	        this.authorDid = source["authorDid"];
	        this.authorPronouns = source["authorPronouns"];
	        this.authorVerified = source["authorVerified"];
	        this.authorIsBot = source["authorIsBot"];
	        this.text = source["text"];
	        this.createdAt = source["createdAt"];
	        this.replyCount = source["replyCount"];
	        this.repostCount = source["repostCount"];
	        this.likeCount = source["likeCount"];
	        this.quoteCount = source["quoteCount"];
	        this.bookmarkCount = source["bookmarkCount"];
	        this.knownLikers = source["knownLikers"];
	        this.opThreadPostCount = source["opThreadPostCount"];
	        this.opThreadPostIndex = source["opThreadPostIndex"];
	        this.isReply = source["isReply"];
	        this.replyToAuthor = source["replyToAuthor"];
	        this.replyToAuthorName = source["replyToAuthorName"];
	        this.replyToUri = source["replyToUri"];
	        this.rootAuthor = source["rootAuthor"];
	        this.rootAuthorName = source["rootAuthorName"];
	        this.rootUri = source["rootUri"];
	        this.parentPost = this.convertValues(source["parentPost"], PostDTO);
	        this.rootPost = this.convertValues(source["rootPost"], PostDTO);
	        this.repostedBy = source["repostedBy"];
	        this.repostedByHandle = source["repostedByHandle"];
	        this.quotePost = this.convertValues(source["quotePost"], PostDTO);
	        this.quoteDetached = source["quoteDetached"];
	        this.quoteDetachedUri = source["quoteDetachedUri"];
	        this.imageAlts = source["imageAlts"];
	        this.images = this.convertValues(source["images"], ImageDTO);
	        this.external = this.convertValues(source["external"], ExternalEmbedDTO);
	        this.video = this.convertValues(source["video"], VideoEmbedDTO);
	        this.hasMedia = source["hasMedia"];
	        this.labels = source["labels"];
	        this.viewerLike = source["viewerLike"];
	        this.viewerRepost = source["viewerRepost"];
	        this.viewerBookmark = source["viewerBookmark"];
	        this.viewerThreadMuted = source["viewerThreadMuted"];
	        this.embeddingDisabled = source["embeddingDisabled"];
	        this.replyDisabled = source["replyDisabled"];
	        this.feedContext = source["feedContext"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FeedDTO {
	    cursor: string;
	    posts: PostDTO[];
	    debugMessage?: string;
	    hasOtherReplies?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FeedDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.posts = this.convertValues(source["posts"], PostDTO);
	        this.debugMessage = source["debugMessage"];
	        this.hasOtherReplies = source["hasOtherReplies"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FeedGeneratorDTO {
	    uri: string;
	    cid: string;
	    did: string;
	    creator: string;
	    displayName: string;
	    description: string;
	    likeCount: number;
	    avatar: string;
	    viewerLike?: string;
	    acceptsInteractions?: boolean;
	    isOnline?: boolean;
	    isValid?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FeedGeneratorDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.did = source["did"];
	        this.creator = source["creator"];
	        this.displayName = source["displayName"];
	        this.description = source["description"];
	        this.likeCount = source["likeCount"];
	        this.avatar = source["avatar"];
	        this.viewerLike = source["viewerLike"];
	        this.acceptsInteractions = source["acceptsInteractions"];
	        this.isOnline = source["isOnline"];
	        this.isValid = source["isValid"];
	    }
	}
	export class FeedGeneratorResponseDTO {
	    cursor: string;
	    feeds: FeedGeneratorDTO[];
	
	    static createFrom(source: any = {}) {
	        return new FeedGeneratorResponseDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.feeds = this.convertValues(source["feeds"], FeedGeneratorDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class LabelerPolicyDefinitionDTO {
	    identifier: string;
	    severity: string;
	    blurs: string;
	    defaultSetting: string;
	    adultOnly: boolean;
	    title: string;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new LabelerPolicyDefinitionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.identifier = source["identifier"];
	        this.severity = source["severity"];
	        this.blurs = source["blurs"];
	        this.defaultSetting = source["defaultSetting"];
	        this.adultOnly = source["adultOnly"];
	        this.title = source["title"];
	        this.description = source["description"];
	    }
	}
	export class LabelerDTO {
	    did: string;
	    handle: string;
	    displayName: string;
	    description: string;
	    avatar: string;
	    banner: string;
	    likeCount: number;
	    isSubscribed: boolean;
	    viewerLike: string;
	    indexedAt: string;
	    policies: LabelerPolicyDefinitionDTO[];
	
	    static createFrom(source: any = {}) {
	        return new LabelerDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.did = source["did"];
	        this.handle = source["handle"];
	        this.displayName = source["displayName"];
	        this.description = source["description"];
	        this.avatar = source["avatar"];
	        this.banner = source["banner"];
	        this.likeCount = source["likeCount"];
	        this.isSubscribed = source["isSubscribed"];
	        this.viewerLike = source["viewerLike"];
	        this.indexedAt = source["indexedAt"];
	        this.policies = this.convertValues(source["policies"], LabelerPolicyDefinitionDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ListDTO {
	    uri: string;
	    cid: string;
	    name: string;
	    purpose: string;
	    description: string;
	    creator: string;
	    creatorDid: string;
	    creatorHandle: string;
	    avatar: string;
	    listItemCount: number;
	    viewerMuted: boolean;
	    viewerBlock: string;
	    viewerSubscribed: boolean;
	    referenceListOptOutUri?: string;
	
	    static createFrom(source: any = {}) {
	        return new ListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.name = source["name"];
	        this.purpose = source["purpose"];
	        this.description = source["description"];
	        this.creator = source["creator"];
	        this.creatorDid = source["creatorDid"];
	        this.creatorHandle = source["creatorHandle"];
	        this.avatar = source["avatar"];
	        this.listItemCount = source["listItemCount"];
	        this.viewerMuted = source["viewerMuted"];
	        this.viewerBlock = source["viewerBlock"];
	        this.viewerSubscribed = source["viewerSubscribed"];
	        this.referenceListOptOutUri = source["referenceListOptOutUri"];
	    }
	}
	export class ListWithMembershipDTO {
	    list?: ListDTO;
	    listItemUri?: string;
	    isMember: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ListWithMembershipDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.list = this.convertValues(source["list"], ListDTO);
	        this.listItemUri = source["listItemUri"];
	        this.isMember = source["isMember"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ListMembershipResponseDTO {
	    cursor: string;
	    items: ListWithMembershipDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ListMembershipResponseDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.items = this.convertValues(source["items"], ListWithMembershipDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ListResponseDTO {
	    cursor: string;
	    lists: ListDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ListResponseDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.lists = this.convertValues(source["lists"], ListDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ModerationInboxItemDTO {
	    subjectUri: string;
	    subjectCid: string;
	    subjectDid: string;
	    enforcementState: string;
	    labels: string[];
	    appealState: string;
	    appealNote: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ModerationInboxItemDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.subjectUri = source["subjectUri"];
	        this.subjectCid = source["subjectCid"];
	        this.subjectDid = source["subjectDid"];
	        this.enforcementState = source["enforcementState"];
	        this.labels = source["labels"];
	        this.appealState = source["appealState"];
	        this.appealNote = source["appealNote"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class ModerationInboxListDTO {
	    items: ModerationInboxItemDTO[];
	    cursor: string;
	
	    static createFrom(source: any = {}) {
	        return new ModerationInboxListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], ModerationInboxItemDTO);
	        this.cursor = source["cursor"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MuteScopeDTO {
	    muted: boolean;
	    mutedOnlyReposts: boolean;
	    mutedOnlyQuoteposts: boolean;
	
	    static createFrom(source: any = {}) {
	        return new MuteScopeDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.muted = source["muted"];
	        this.mutedOnlyReposts = source["mutedOnlyReposts"];
	        this.mutedOnlyQuoteposts = source["mutedOnlyQuoteposts"];
	    }
	}
	export class MutedWordDTO {
	    id?: string;
	    value: string;
	    targets: string[];
	    actorTarget?: string;
	    expiresAt?: string;
	
	    static createFrom(source: any = {}) {
	        return new MutedWordDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.value = source["value"];
	        this.targets = source["targets"];
	        this.actorTarget = source["actorTarget"];
	        this.expiresAt = source["expiresAt"];
	    }
	}
	export class NotificationChatPrefDTO {
	    include: string;
	    push: boolean;
	
	    static createFrom(source: any = {}) {
	        return new NotificationChatPrefDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.include = source["include"];
	        this.push = source["push"];
	    }
	}
	export class NotificationDTO {
	    uri: string;
	    cid: string;
	    authorDid: string;
	    authorName: string;
	    authorHandle: string;
	    reason: string;
	    indexedAt: string;
	    text: string;
	    reasonSubject: string;
	    hasMedia: boolean;
	    video?: VideoEmbedDTO;
	    quoteAuthorName?: string;
	    quoteAuthorHandle?: string;
	    quoteText?: string;
	    quoteUri?: string;
	    hydratedPost?: PostDTO;
	    replyParentUri?: string;
	    replyParentAuthorDid?: string;
	    replyParentAuthorHandle?: string;
	    replyParentAuthorName?: string;
	
	    static createFrom(source: any = {}) {
	        return new NotificationDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.authorDid = source["authorDid"];
	        this.authorName = source["authorName"];
	        this.authorHandle = source["authorHandle"];
	        this.reason = source["reason"];
	        this.indexedAt = source["indexedAt"];
	        this.text = source["text"];
	        this.reasonSubject = source["reasonSubject"];
	        this.hasMedia = source["hasMedia"];
	        this.video = this.convertValues(source["video"], VideoEmbedDTO);
	        this.quoteAuthorName = source["quoteAuthorName"];
	        this.quoteAuthorHandle = source["quoteAuthorHandle"];
	        this.quoteText = source["quoteText"];
	        this.quoteUri = source["quoteUri"];
	        this.hydratedPost = this.convertValues(source["hydratedPost"], PostDTO);
	        this.replyParentUri = source["replyParentUri"];
	        this.replyParentAuthorDid = source["replyParentAuthorDid"];
	        this.replyParentAuthorHandle = source["replyParentAuthorHandle"];
	        this.replyParentAuthorName = source["replyParentAuthorName"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NotificationFilterablePrefDTO {
	    include: string;
	    list: boolean;
	    push: boolean;
	
	    static createFrom(source: any = {}) {
	        return new NotificationFilterablePrefDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.include = source["include"];
	        this.list = source["list"];
	        this.push = source["push"];
	    }
	}
	export class NotificationListDTO {
	    cursor: string;
	    notifications: NotificationDTO[];
	
	    static createFrom(source: any = {}) {
	        return new NotificationListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.notifications = this.convertValues(source["notifications"], NotificationDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NotificationSimplePrefDTO {
	    list: boolean;
	    push: boolean;
	
	    static createFrom(source: any = {}) {
	        return new NotificationSimplePrefDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.list = source["list"];
	        this.push = source["push"];
	    }
	}
	export class NotificationPreferencesDTO {
	    priority: boolean;
	    chat?: NotificationChatPrefDTO;
	    follow?: NotificationFilterablePrefDTO;
	    like?: NotificationFilterablePrefDTO;
	    likeViaRepost?: NotificationFilterablePrefDTO;
	    mention?: NotificationFilterablePrefDTO;
	    quote?: NotificationFilterablePrefDTO;
	    reply?: NotificationFilterablePrefDTO;
	    repost?: NotificationFilterablePrefDTO;
	    repostViaRepost?: NotificationFilterablePrefDTO;
	    starterpackJoined?: NotificationSimplePrefDTO;
	    subscribedPost?: NotificationSimplePrefDTO;
	    unverified?: NotificationSimplePrefDTO;
	    verified?: NotificationSimplePrefDTO;
	
	    static createFrom(source: any = {}) {
	        return new NotificationPreferencesDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.priority = source["priority"];
	        this.chat = this.convertValues(source["chat"], NotificationChatPrefDTO);
	        this.follow = this.convertValues(source["follow"], NotificationFilterablePrefDTO);
	        this.like = this.convertValues(source["like"], NotificationFilterablePrefDTO);
	        this.likeViaRepost = this.convertValues(source["likeViaRepost"], NotificationFilterablePrefDTO);
	        this.mention = this.convertValues(source["mention"], NotificationFilterablePrefDTO);
	        this.quote = this.convertValues(source["quote"], NotificationFilterablePrefDTO);
	        this.reply = this.convertValues(source["reply"], NotificationFilterablePrefDTO);
	        this.repost = this.convertValues(source["repost"], NotificationFilterablePrefDTO);
	        this.repostViaRepost = this.convertValues(source["repostViaRepost"], NotificationFilterablePrefDTO);
	        this.starterpackJoined = this.convertValues(source["starterpackJoined"], NotificationSimplePrefDTO);
	        this.subscribedPost = this.convertValues(source["subscribedPost"], NotificationSimplePrefDTO);
	        this.unverified = this.convertValues(source["unverified"], NotificationSimplePrefDTO);
	        this.verified = this.convertValues(source["verified"], NotificationSimplePrefDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class PostRefDTO {
	    uri: string;
	    cid: string;
	    rootUri: string;
	    rootCid: string;
	    warning?: string;
	
	    static createFrom(source: any = {}) {
	        return new PostRefDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.rootUri = source["rootUri"];
	        this.rootCid = source["rootCid"];
	        this.warning = source["warning"];
	    }
	}
	export class PostSearchFilter {
	    Query: string;
	    Author: string;
	    Lang: string;
	    Sort: string;
	    Since: string;
	    Until: string;
	    Domain: string;
	    Mentions: string;
	    Tag: string[];
	    URL: string;
	    Cursor: string;
	    AllTime: boolean;
	    Following: boolean;
	    HasMedia: boolean;
	    HasVideo: boolean;
	    ExcludeReplies: boolean;
	    RepliesOnly: boolean;
	    ExcludeAuthors: string[];
	    ExcludeHashtags: string[];
	    ExcludeDomains: string[];
	    ThreadRootURI: string;
	
	    static createFrom(source: any = {}) {
	        return new PostSearchFilter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Query = source["Query"];
	        this.Author = source["Author"];
	        this.Lang = source["Lang"];
	        this.Sort = source["Sort"];
	        this.Since = source["Since"];
	        this.Until = source["Until"];
	        this.Domain = source["Domain"];
	        this.Mentions = source["Mentions"];
	        this.Tag = source["Tag"];
	        this.URL = source["URL"];
	        this.Cursor = source["Cursor"];
	        this.AllTime = source["AllTime"];
	        this.Following = source["Following"];
	        this.HasMedia = source["HasMedia"];
	        this.HasVideo = source["HasVideo"];
	        this.ExcludeReplies = source["ExcludeReplies"];
	        this.RepliesOnly = source["RepliesOnly"];
	        this.ExcludeAuthors = source["ExcludeAuthors"];
	        this.ExcludeHashtags = source["ExcludeHashtags"];
	        this.ExcludeDomains = source["ExcludeDomains"];
	        this.ThreadRootURI = source["ThreadRootURI"];
	    }
	}
	export class PreferencesDTO {
	    adultContentEnabled: boolean;
	    contentFilters: ContentFilterDTO[];
	    mutedWords: MutedWordDTO[];
	    pinnedFeeds: string[];
	    savedFeeds: string[];
	    threadSort: string;
	    threadPrioritizeFollowed: boolean;
	    hideReplies: boolean;
	    hideReposts: boolean;
	    hideQuotePosts: boolean;
	    hideRepliesByUnfollowed: boolean;
	    hiddenPosts: string[];
	    defaultThreadgateRules: string[];
	    defaultDisableQuotes: boolean;
	    interests: string[];
	    hideVerificationBadges: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PreferencesDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.adultContentEnabled = source["adultContentEnabled"];
	        this.contentFilters = this.convertValues(source["contentFilters"], ContentFilterDTO);
	        this.mutedWords = this.convertValues(source["mutedWords"], MutedWordDTO);
	        this.pinnedFeeds = source["pinnedFeeds"];
	        this.savedFeeds = source["savedFeeds"];
	        this.threadSort = source["threadSort"];
	        this.threadPrioritizeFollowed = source["threadPrioritizeFollowed"];
	        this.hideReplies = source["hideReplies"];
	        this.hideReposts = source["hideReposts"];
	        this.hideQuotePosts = source["hideQuotePosts"];
	        this.hideRepliesByUnfollowed = source["hideRepliesByUnfollowed"];
	        this.hiddenPosts = source["hiddenPosts"];
	        this.defaultThreadgateRules = source["defaultThreadgateRules"];
	        this.defaultDisableQuotes = source["defaultDisableQuotes"];
	        this.interests = source["interests"];
	        this.hideVerificationBadges = source["hideVerificationBadges"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProfileLinkDTO {
	    uri?: string;
	    cid?: string;
	    title: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new ProfileLinkDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.title = source["title"];
	        this.url = source["url"];
	    }
	}
	export class ProfileDTO {
	    did: string;
	    handle: string;
	    displayName: string;
	    description: string;
	    pronouns?: string;
	    avatar: string;
	    website?: string;
	    links?: ProfileLinkDTO[];
	    followersCount: number;
	    followsCount: number;
	    postsCount: number;
	    viewerFollowing: string;
	    viewerFollowedBy: string;
	    viewerMuted: boolean;
	    viewerBlocking: string;
	    viewerBlockedBy: boolean;
	    pinnedPostUri: string;
	    isMe: boolean;
	    isLabeler: boolean;
	    viewerSubscribedLabeler: boolean;
	    viewerActivitySubscription?: ActivitySubscriptionDTO;
	    labelerInfo?: LabelerDTO;
	    listItemUri?: string;
	    verified?: boolean;
	    trustedVerifier?: boolean;
	    isBot?: boolean;
	    hideFromLoggedOut?: boolean;
	    hideFromAlgorithmicRecommendations?: boolean;
	    verifiedBy?: string[];
	    allowActivitySubscriptions?: string;
	    germMessageMeUrl?: string;
	    status?: ActorStatusDTO;
	
	    static createFrom(source: any = {}) {
	        return new ProfileDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.did = source["did"];
	        this.handle = source["handle"];
	        this.displayName = source["displayName"];
	        this.description = source["description"];
	        this.pronouns = source["pronouns"];
	        this.avatar = source["avatar"];
	        this.website = source["website"];
	        this.links = this.convertValues(source["links"], ProfileLinkDTO);
	        this.followersCount = source["followersCount"];
	        this.followsCount = source["followsCount"];
	        this.postsCount = source["postsCount"];
	        this.viewerFollowing = source["viewerFollowing"];
	        this.viewerFollowedBy = source["viewerFollowedBy"];
	        this.viewerMuted = source["viewerMuted"];
	        this.viewerBlocking = source["viewerBlocking"];
	        this.viewerBlockedBy = source["viewerBlockedBy"];
	        this.pinnedPostUri = source["pinnedPostUri"];
	        this.isMe = source["isMe"];
	        this.isLabeler = source["isLabeler"];
	        this.viewerSubscribedLabeler = source["viewerSubscribedLabeler"];
	        this.viewerActivitySubscription = this.convertValues(source["viewerActivitySubscription"], ActivitySubscriptionDTO);
	        this.labelerInfo = this.convertValues(source["labelerInfo"], LabelerDTO);
	        this.listItemUri = source["listItemUri"];
	        this.verified = source["verified"];
	        this.trustedVerifier = source["trustedVerifier"];
	        this.isBot = source["isBot"];
	        this.hideFromLoggedOut = source["hideFromLoggedOut"];
	        this.hideFromAlgorithmicRecommendations = source["hideFromAlgorithmicRecommendations"];
	        this.verifiedBy = source["verifiedBy"];
	        this.allowActivitySubscriptions = source["allowActivitySubscriptions"];
	        this.germMessageMeUrl = source["germMessageMeUrl"];
	        this.status = this.convertValues(source["status"], ActorStatusDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ProfileListDTO {
	    cursor: string;
	    profiles: ProfileDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ProfileListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.profiles = this.convertValues(source["profiles"], ProfileDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RelationshipDTO {
	    did: string;
	    following?: string;
	    followedBy?: string;
	    blocking?: string;
	    blockedBy?: string;
	
	    static createFrom(source: any = {}) {
	        return new RelationshipDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.did = source["did"];
	        this.following = source["following"];
	        this.followedBy = source["followedBy"];
	        this.blocking = source["blocking"];
	        this.blockedBy = source["blockedBy"];
	    }
	}
	export class SavedAccountDTO {
	    did: string;
	    handle: string;
	    isActive: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SavedAccountDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.did = source["did"];
	        this.handle = source["handle"];
	        this.isActive = source["isActive"];
	    }
	}
	export class SavedFeedDTO {
	    uri: string;
	    cid: string;
	    displayName: string;
	    creator: string;
	    pinned: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SavedFeedDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.displayName = source["displayName"];
	        this.creator = source["creator"];
	        this.pinned = source["pinned"];
	    }
	}
	export class SearchDTO {
	    cursor: string;
	    posts: PostDTO[];
	
	    static createFrom(source: any = {}) {
	        return new SearchDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.posts = this.convertValues(source["posts"], PostDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StarterPackDTO {
	    uri: string;
	    cid: string;
	    name: string;
	    description: string;
	    creator: string;
	    creatorDid?: string;
	    listUri: string;
	    joinedWeekCount?: number;
	    joinedAllTimeCount?: number;
	    feeds?: FeedGeneratorDTO[];
	    members?: ProfileDTO[];
	    listItemUri?: string;
	
	    static createFrom(source: any = {}) {
	        return new StarterPackDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.cid = source["cid"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.creator = source["creator"];
	        this.creatorDid = source["creatorDid"];
	        this.listUri = source["listUri"];
	        this.joinedWeekCount = source["joinedWeekCount"];
	        this.joinedAllTimeCount = source["joinedAllTimeCount"];
	        this.feeds = this.convertValues(source["feeds"], FeedGeneratorDTO);
	        this.members = this.convertValues(source["members"], ProfileDTO);
	        this.listItemUri = source["listItemUri"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StarterPackWithMembershipDTO {
	    starterPack?: StarterPackDTO;
	    listItemUri?: string;
	    isMember: boolean;
	
	    static createFrom(source: any = {}) {
	        return new StarterPackWithMembershipDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.starterPack = this.convertValues(source["starterPack"], StarterPackDTO);
	        this.listItemUri = source["listItemUri"];
	        this.isMember = source["isMember"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StarterPackMembershipResponseDTO {
	    cursor: string;
	    items: StarterPackWithMembershipDTO[];
	
	    static createFrom(source: any = {}) {
	        return new StarterPackMembershipResponseDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.items = this.convertValues(source["items"], StarterPackWithMembershipDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StarterPackResponseDTO {
	    cursor: string;
	    starterPacks: StarterPackDTO[];
	
	    static createFrom(source: any = {}) {
	        return new StarterPackResponseDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.starterPacks = this.convertValues(source["starterPacks"], StarterPackDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class TrendDTO {
	    topic: string;
	    displayName: string;
	    description: string;
	    link: string;
	    category: string;
	    status: string;
	    postCount: number;
	    startedAt: string;
	    actors: string[];
	
	    static createFrom(source: any = {}) {
	        return new TrendDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.topic = source["topic"];
	        this.displayName = source["displayName"];
	        this.description = source["description"];
	        this.link = source["link"];
	        this.category = source["category"];
	        this.status = source["status"];
	        this.postCount = source["postCount"];
	        this.startedAt = source["startedAt"];
	        this.actors = source["actors"];
	    }
	}
	export class TrendListDTO {
	    trends: TrendDTO[];
	
	    static createFrom(source: any = {}) {
	        return new TrendListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.trends = this.convertValues(source["trends"], TrendDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateInfoDTO {
	    hasUpdate: boolean;
	    currentVersion: string;
	    latestVersion: string;
	    releaseUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfoDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasUpdate = source["hasUpdate"];
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.releaseUrl = source["releaseUrl"];
	    }
	}
	
	
	export class VideoUploadLimitsDTO {
	    canUpload: boolean;
	    remainingDailyVideos: number;
	    remainingDailyBytes: number;
	    message?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new VideoUploadLimitsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.canUpload = source["canUpload"];
	        this.remainingDailyVideos = source["remainingDailyVideos"];
	        this.remainingDailyBytes = source["remainingDailyBytes"];
	        this.message = source["message"];
	        this.error = source["error"];
	    }
	}

}

