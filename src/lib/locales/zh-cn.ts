export function formatFolderCount(count: number): string {
  return `${count} 个文件夹`;
}

export function formatTrackCount(count: number): string {
  return `${count} 首歌曲`;
}

export function formatAlbumCount(count: number): string {
  return `${count} 张专辑`;
}

export function formatArtistCount(count: number): string {
  return `${count} 位艺术家`;
}

export function formatPlaylistCount(count: number): string {
  return `${count} 个播放列表`;
}

export const commonCopy = {
  brandName: 'My Music',
  variousArtists: '群星',
  unknownArtist: '未知艺术家',
  unknownAlbum: '未知专辑',
  unknownRelease: '未知作品',
  unknownYear: '未知年份',
  single: '单曲',
  recently: '最近',
  noDescriptionYet: '暂无说明',
  comingSoon: '暂未开放',
  systemDefault: '系统默认',
  defaultDevice: '默认设备',
  outputDevice: '输出设备',
  addFolderFailed: '添加文件夹失败。',
  removeFolderFailed: '移除文件夹失败。',
  rescanFailed: '重新扫描失败。',
  fullScanFailed: '完整扫描失败。',
  cancelScanFailed: '取消扫描失败。',
  switchOutputDeviceFailed: '切换输出设备失败。',
  unknownVersion: '未知',
  desktopBuild: '桌面版',
  createdAt: (label: string) => `创建于 ${label}`,
  updatedAt: (label: string) => `更新于 ${label}`,
  addedAt: (label: string) => `添加于 ${label}`,
  releasedAt: (label: string) => `发行于 ${label}`,
};

export const shellCopy = {
  brandSubtitle: '',
  topbarSubtitle: '',
  searchPlaceholder: '搜索歌曲、专辑、艺术家...',
  clearSearch: '清除搜索',
  openMaintenanceDetails: '查看扫描详情',
  maintenanceRunning: '扫描中',
  maintenanceStopping: '正在取消',
  maintenanceReviewInSettings: '查看详情',
  maintenanceRestartFromSettings: '可重新扫描',
  maintenanceQueuedFollowUp: (count: number) => `还有 ${count} 项更新`,
  sections: {
    main: '主要',
    library: '音乐库',
    playlists: '播放列表',
  },
  nav: {
    home: '首页',
    library: '音乐库',
    settings: '设置',
    songs: '歌曲',
    albums: '专辑',
    artists: '艺术家',
  },
  emptyPlaylists: '还没有播放列表',
};

export const homeCopy = {
  title: '首页',
  subtitle: '你的音乐概览',
  totalListeningTime: '总时长',
  songs: '歌曲',
  albums: '专辑',
  artists: '艺术家',
  playlists: '播放列表',
  averageLength: (minutes: number) => `平均时长 ${minutes} 分钟`,
  diverseCollection: '按艺术家整理',
  customMixes: '我的歌单',
  libraryEyebrow: '音乐库',
  recentTracksTitle: '最近添加',
  noRecentTracksTitle: '还没有歌曲',
  noRecentTracksBody: '添加歌曲后会显示在这里。',
  browseEyebrow: '浏览',
  topArtistsTitle: '艺术家',
  noArtistStatsTitle: '还没有艺术家',
  noArtistStatsBody: '添加歌曲后会显示在这里。',
  artistSummary: (albumCount: number, trackCount: number) =>
    `${formatAlbumCount(albumCount)} · ${formatTrackCount(trackCount)}`,
};

export const searchCopy = {
  title: '搜索',
  subtitleWithTerm: (term: string) => `“${term}”的搜索结果`,
  subtitleDefault: '搜索歌曲、专辑和艺术家',
  searchingTitle: '正在搜索音乐库',
  searchingBody: '请稍候。',
  noMatchesTitle: '暂无匹配结果',
  noMatchesBody: '暂无结果，试试其他关键词。',
  tracksEyebrow: '歌曲',
  tracksTitle: '歌曲结果',
  noTracks: '未找到歌曲。',
  openTrack: (title: string) => `打开 ${title}`,
  playTrack: (title: string) => `播放 ${title}`,
  albumsEyebrow: '专辑',
  albumsTitle: '专辑结果',
  noAlbums: '未找到专辑。',
  albumSummary: (artist: string, trackCount: number) => `${artist} · ${formatTrackCount(trackCount)}`,
  artistsEyebrow: '艺术家',
  artistsTitle: '艺术家结果',
  noArtists: '未找到艺术家。',
  artistSummary: (albumCount: number, trackCount: number) =>
    `${formatAlbumCount(albumCount)} · ${formatTrackCount(trackCount)}`,
};

export const settingsCopy = {
  title: '设置',
  subtitle: '管理音乐库、外观和播放',
  versionChip: (version: string) => `版本 ${version || commonCopy.unknownVersion}`,
  maintenanceEyebrow: '维护',
  libraryTitle: '音乐库',
  libraryDescription: '管理扫描和文件夹',
  noFoldersTitle: '还没有文件夹',
  noFoldersBody: '添加文件夹后即可开始扫描。',
  addFolder: '添加文件夹',
  removeFolder: '移除',
  removeFolderAria: (path: string) => `移除文件夹 ${path}`,
  autoSync: '自动同步',
  watchedFolders: '监听中的文件夹',
  scanSummary: '扫描情况',
  whatHappensNext: '接下来',
  rescanNow: '立即重扫',
  fullScan: '完整扫描',
  cancelScan: '取消扫描',
  appearanceEyebrow: '外观',
  themeTitle: '主题',
  themeDescription: '选择显示主题',
  themeOptionsLabel: '主题选项',
  themeOptions: {
    light: {
      label: '浅色',
      description: '浅色界面',
    },
    dark: {
      label: '深色',
      description: '深色界面',
    },
    system: {
      label: '跟随系统',
      description: '跟随系统设置',
    },
  },
  scanOnStartupTitle: '启动时扫描音乐库',
  scanOnStartupDescription: '启动时自动扫描音乐库',
  defaultVolumeTitle: '默认音量',
  defaultVolumeDescription: '开始播放时使用这个音量',
  playbackEyebrow: '播放',
  audioTitle: '音频',
  audioDescription: '选择播放设备',
  outputDeviceTitle: '输出设备',
  currentOutput: (label: string) => `当前输出：${label}`,
  advancedAudioSettings: '更多音频设置',
  aboutTitle: '关于',
  aboutDescription: '查看版本信息',
  versionLabel: '版本',
  authorLabel: '作者',
  authorValue: 'myMusicPlayer-rs 团队',
  licenseLabel: '许可证',
  reloadPlaylists: '刷新歌单',
};

export const maintenanceCopy = {
  scanLabels: {
    incremental: '增量同步',
    full: '完整扫描',
    generic: '音乐库扫描',
  },
  autoSyncReady: '自动扫描已开启',
  autoSyncNeedsAttention: '自动扫描异常',
  autoSyncNotWatching: '还没有文件夹',
  autoSyncFollowUpQueued: '稍后继续扫描',
  noScanRunning: '未开始扫描',
  currentPath: '当前文件',
  autoSyncSummary: (count: number) => `已监听 ${formatFolderCount(count)}`,
  autoSyncDisabled: '还没有添加文件夹。',
  queuedFollowUpTitle: '待处理更新',
  queuedFollowUpChanged: (count: number) =>
    `检测到 ${count} 个文件夹有变化，稍后会继续扫描。`,
  queuedFollowUpReady: '当前扫描结束后会继续处理。',
  maintenanceControlTitle: '扫描控制',
  maintenanceControlDescription: '如需停止当前扫描，可点击“取消扫描”。',
  recommendedNextStep: '建议操作',
  rescanDescriptionForWatcher:
    '修复文件夹访问问题后，再点“立即重扫”。',
  rescanDescriptionForFailure:
    '处理出错文件后，再点“立即重扫”。',
  rescanDescriptionForCancelled: '需要时可重新开始扫描。',
  rescanDescriptionDefault: '如需更新音乐库，可再次扫描。',
  fullScanDescription: '如需重新检查全部文件，请使用“完整扫描”。',
  reviewFoldersDescription: '请先添加文件夹，再开始扫描。',
  waitDescription: '请等待当前操作结束。',
  latestWatcherError: '监听错误',
  latestScanError: '扫描错误',
  latestScanErrorCount: (count: number) => `上一次运行记录了 ${count} 个扫描错误。`,
  filesChecked: '已检查文件',
  added: '新增',
  changed: '变更',
  unchanged: '未变更',
  restored: '已恢复',
  missing: '缺失',
  errors: '错误',
  nextStepLabels: {
    wait: '等待取消完成',
    cancelScan: '取消扫描',
    rescan: '立即重扫',
    fullScan: '完整扫描',
    reviewFolders: '检查文件夹',
  },
};

export const songsCopy = {
  title: '歌曲',
  subtitle: (count: number) => formatTrackCount(count),
  scanningTitle: '正在扫描音乐库',
  scanningBody: '正在整理你的音乐，请稍候。',
  emptySearchTitle: '没有匹配当前搜索的歌曲',
  emptySearchBody: '换个关键词试试。',
  addToPlaylistHint: '请先创建歌单',
};

export const songsTableCopy = {
  tableAriaLabel: '歌曲列表',
  columns: {
    index: '#',
    title: '标题',
    artist: '艺术家',
    album: '专辑',
    duration: '时长',
    added: '添加时间',
  },
  sortByTitle: '按标题排序',
  sortByArtist: '按艺术家排序',
  sortByAlbum: '按专辑排序',
  sortByDuration: '按时长排序',
  sortByAdded: '按添加时间排序',
};

export const playlistPickerCopy = {
  addToPlaylist: '加入歌单',
  choosePlaylist: '选择歌单',
  close: '关闭歌单选择器',
  empty: '暂无可用歌单',
};

export const albumsCopy = {
  title: '专辑',
  subtitle: (count: number) => `已收录 ${formatAlbumCount(count)}`,
  loadingTitle: '正在加载专辑',
  loadingBody: '音乐库准备好后会显示在这里。',
  emptyTitle: '暂无专辑',
  emptyBody: '添加歌曲后会显示在这里。',
};

export const artistsCopy = {
  title: '艺术家',
  subtitle: (count: number) => `已发现 ${formatArtistCount(count)}`,
  loadingTitle: '正在加载艺术家',
  loadingBody: '音乐库准备好后会显示在这里。',
  emptyTitle: '暂无艺术家',
  emptyBody: '添加歌曲后会显示在这里。',
  joinedAt: (label: string) => `收录于 ${label}`,
};

export const albumDetailCopy = {
  selectTitle: '选择一张专辑',
  selectBody: '从左侧选择专辑后即可查看曲目。',
  loadingTitle: '正在加载专辑',
  loadingBody: '请稍候。',
  unavailableTitle: '专辑不可用',
  notFoundTitle: '未找到专辑',
  notFoundBody: '这张专辑已不可用。',
  eyebrow: '专辑',
  play: '播放',
  favorite: '收藏',
  tableAriaLabel: '专辑曲目',
  columns: {
    title: '标题',
    duration: '时长',
  },
};

export const artistDetailCopy = {
  selectTitle: '选择一位艺术家',
  selectBody: '从左侧选择艺术家后即可查看歌曲和专辑。',
  loadingTitle: '正在加载艺术家',
  loadingBody: '请稍候。',
  unavailableTitle: '艺术家不可用',
  notFoundTitle: '未找到艺术家',
  notFoundBody: '这位艺术家已不可用。',
  eyebrow: '艺术家',
  playTopTrack: '播放热门歌曲',
  follow: '关注',
  since: (label: string) => `收录于 ${label}`,
  topTracks: '热门歌曲',
  noTracksTitle: '暂无可播放的歌曲',
  noTracksBody: '当前音乐库快照中，这位艺术家还没有可播放的歌曲。',
  discography: '作品目录',
  releases: (count: number) => `${count} 张发行作品`,
  noAlbumsTitle: '暂无专辑信息',
  noAlbumsBody: '有专辑信息后会显示在这里。',
};

export const playlistDetailCopy = {
  renamePrompt: '重命名播放列表',
  selectTitle: '选择一个播放列表',
  selectBody: '从左侧选择播放列表后即可查看歌曲。',
  loadingTitle: '正在加载播放列表',
  loadingBody: '请稍候。',
  unavailableTitle: '播放列表不可用',
  notFoundTitle: '未找到播放列表',
  notFoundBody: '这个播放列表已不可用。',
  eyebrow: '播放列表',
  play: '播放',
  rename: '重命名',
  addTracks: '添加歌曲',
  removeTrackFailed: '从播放列表移除歌曲失败。',
  renameFailed: '重命名播放列表失败。',
  tableAriaLabel: '播放列表曲目',
  columns: {
    title: '标题',
    album: '专辑',
    duration: '时长',
  },
};
