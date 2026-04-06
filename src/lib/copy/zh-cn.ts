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
  unknownYear: '未知年份',
  recently: '最近',
  noDescriptionYet: '暂无简介。',
  comingSoon: '敬请期待',
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
  brandSubtitle: '音乐库、队列与播放控制',
  topbarSubtitle: '搜索、浏览并保持播放继续',
  searchPlaceholder: '搜索歌曲、专辑、艺术家...',
  clearSearch: '清除搜索',
  openMaintenanceDetails: '在设置中查看维护详情',
  maintenanceRunning: '后台处理中',
  maintenanceStopping: '正在停止当前扫描',
  maintenanceReviewInSettings: '请在设置中查看',
  maintenanceRestartFromSettings: '请在设置中重新启动',
  maintenanceQueuedFollowUp: (count: number) => `已排队 ${count} 个后续任务`,
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
  emptyPlaylists: '还没有播放列表，创建一个开始整理音乐。',
};

export const homeCopy = {
  title: '首页',
  subtitle: '欢迎回来，这里是你的音乐概览。',
  totalListeningTime: '累计收听时长',
  songs: '歌曲',
  albums: '专辑',
  artists: '艺术家',
  playlists: '播放列表',
  averageLength: (minutes: number) => `平均时长 ${minutes} 分钟`,
  diverseCollection: '收藏类型丰富',
  customMixes: '自建歌单',
  libraryEyebrow: '音乐库',
  recentTracksTitle: '最近添加的歌曲',
  noRecentTracksTitle: '暂无最近添加',
  noRecentTracksBody: '添加歌曲后会显示在这里。',
  browseEyebrow: '浏览',
  topArtistsTitle: '热门艺术家',
  noArtistStatsTitle: '暂无艺术家统计',
  noArtistStatsBody: '扫描音乐库后即可生成艺术家信息。',
  artistSummary: (albumCount: number, trackCount: number) =>
    `${formatAlbumCount(albumCount)} · ${formatTrackCount(trackCount)}`,
};

export const searchCopy = {
  title: '搜索',
  subtitleWithTerm: (term: string) => `“${term}”的搜索结果`,
  subtitleDefault: '搜索音乐库中的歌曲、专辑和艺术家。',
  searchingTitle: '正在搜索音乐库',
  searchingBody: '正在根据你的关键词检查歌曲、专辑和艺术家。',
  noMatchesTitle: '暂无匹配结果',
  noMatchesBody: '暂无结果，试试其他关键词。',
  tracksEyebrow: '歌曲',
  tracksTitle: '快速播放结果',
  noTracks: '未找到歌曲。',
  openTrack: (title: string) => `打开 ${title}`,
  playTrack: (title: string) => `播放 ${title}`,
  albumsEyebrow: '专辑',
  albumsTitle: '打开专辑详情',
  noAlbums: '未找到专辑。',
  albumSummary: (artist: string, trackCount: number) => `${artist} · ${formatTrackCount(trackCount)}`,
  artistsEyebrow: '艺术家',
  artistsTitle: '跳转到艺术家',
  noArtists: '未找到艺术家。',
  artistSummary: (albumCount: number, trackCount: number) =>
    `${formatAlbumCount(albumCount)} · ${formatTrackCount(trackCount)}`,
};

export const settingsCopy = {
  title: '设置',
  subtitle: '管理音乐库维护、外观、播放输出与应用信息。',
  versionChip: (version: string) => `版本 ${version || commonCopy.unknownVersion}`,
  maintenanceEyebrow: '维护',
  libraryTitle: '音乐库',
  libraryDescription:
    '离开“设置”后，壳层只显示简洁的维护提示；详细的监听状态和恢复建议统一保留在这里。',
  noFoldersTitle: '还没有选择文件夹',
  noFoldersBody: '添加一个或多个文件夹后，即可开始扫描并保持音乐库同步。',
  addFolder: '添加文件夹',
  removeFolder: '移除',
  removeFolderAria: (path: string) => `移除文件夹 ${path}`,
  autoSync: '自动同步',
  watchedFolders: '监听中的文件夹',
  scanSummary: '扫描摘要',
  whatHappensNext: '接下来会发生什么',
  rescanNow: '立即重扫',
  fullScan: '完整扫描',
  cancelScan: '取消扫描',
  appearanceEyebrow: '外观',
  themeTitle: '主题',
  themeDescription: '让浅色和深色模式保持同一套壳层与播放层级。',
  themeOptionsLabel: '主题选项',
  themeOptions: {
    light: {
      label: '浅色',
      description: '为整个应用壳层使用柔和、中性的浅色主题。',
    },
    dark: {
      label: '深色',
      description: '使用深色主题，同时保持相同的播放与音乐库层级。',
    },
    system: {
      label: '跟随系统',
      description: '自动匹配当前操作系统主题。',
    },
  },
  scanOnStartupTitle: '启动时扫描音乐库',
  scanOnStartupDescription: '应用启动时自动运行默认同步流程。',
  defaultVolumeTitle: '默认音量',
  defaultVolumeDescription: '在开始播放前，将播放器设置为这个音量。',
  playbackEyebrow: '播放',
  audioTitle: '音频',
  audioDescription: '把播放路由到正确的设备，并清楚显示当前输出。',
  outputDeviceTitle: '输出设备',
  currentOutput: (label: string) => `当前输出：${label}`,
  advancedAudioSettings: '高级音频设置',
  aboutTitle: '关于',
  aboutDescription: '应用基础信息与轻量级歌单刷新操作。',
  versionLabel: '版本',
  authorLabel: '作者',
  authorValue: 'myMusicPlayer-rs 团队',
  licenseLabel: '许可证',
  reloadPlaylists: '重新加载歌单',
};

export const maintenanceCopy = {
  scanLabels: {
    incremental: '增量同步',
    full: '完整扫描',
    generic: '音乐库扫描',
  },
  autoSyncReady: '自动同步已就绪',
  autoSyncNeedsAttention: '自动同步需要处理',
  autoSyncNotWatching: '自动同步未监听任何文件夹',
  autoSyncFollowUpQueued: '自动同步已排队后续任务',
  noScanRunning: '当前没有扫描任务',
  currentPath: '当前路径',
  autoSyncSummary: (count: number) => `正在监听 ${formatFolderCount(count)}，自动同步已开启。`,
  autoSyncDisabled: '当前没有正在监听的文件夹，自动同步已停止。',
  queuedFollowUpTitle: '已排队的后续任务',
  queuedFollowUpChanged: (count: number) =>
    `本次扫描期间有 ${count} 个监听文件夹发生变化，后续扫描会自动开始。`,
  queuedFollowUpReady: '后续扫描已排队，会在当前维护状态结束后自动开始。',
  maintenanceControlTitle: '维护控制',
  maintenanceControlDescription: '只有在确实需要停止当前维护流程时才使用“取消扫描”。',
  recommendedNextStep: '建议的下一步',
  rescanDescriptionForWatcher:
    '修复监听器问题或文件夹访问后，使用“立即重扫”确认音乐库状态。',
  rescanDescriptionForFailure:
    '修复出错路径或元数据问题后，使用“立即重扫”重试统一维护流程。',
  rescanDescriptionForCancelled: '准备好后，使用“立即重扫”重新启动统一维护流程。',
  rescanDescriptionDefault: '使用“立即重扫”再次运行统一维护流程。',
  fullScanDescription: '需要从磁盘完整重建音乐库状态时，请使用“完整扫描”。',
  reviewFoldersDescription: '使用“添加文件夹”恢复监听路径，然后再执行“立即重扫”。',
  waitDescription: '请等待取消完成，再开始下一次维护流程。',
  latestWatcherError: '最近一次监听错误',
  latestScanError: '最近一次扫描错误',
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
  subtitle: (count: number) => `${formatTrackCount(count)}已加入音乐库`,
  scanningTitle: '正在扫描音乐库',
  scanningBody: '正在为你的音乐库建立索引，扫描完成后歌曲会显示在这里。',
  emptySearchTitle: '没有匹配当前搜索的歌曲',
  emptySearchBody: '试试其他关键词，或清除当前筛选后浏览完整音乐库。',
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
  loadingBody: '音乐库加载完成后，这里会显示专辑封面、数量和时长。',
  emptyTitle: '暂无专辑',
  emptyBody: '向音乐库添加歌曲后，这里会自动生成专辑目录。',
};

export const artistsCopy = {
  title: '艺术家',
  subtitle: (count: number) => `已发现 ${formatArtistCount(count)}`,
  loadingTitle: '正在加载艺术家',
  loadingBody: '音乐库准备就绪后，这里会显示艺术家摘要与目录数量。',
  emptyTitle: '暂无艺术家',
  emptyBody: '向音乐库添加歌曲后，即可开始浏览艺术家。',
  joinedAt: (label: string) => `收录于 ${label}`,
};

export const albumDetailCopy = {
  selectTitle: '选择一张专辑',
  selectBody: '从音乐库中选择专辑后，即可查看曲目和播放操作。',
  loadingTitle: '正在加载专辑',
  loadingBody: '曲目信息和播放操作即将显示在这里。',
  unavailableTitle: '专辑不可用',
  notFoundTitle: '未找到专辑',
  notFoundBody: '当前音乐库快照中已无法找到所选专辑。',
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
  selectBody: '从音乐库中选择艺术家后，即可浏览热门歌曲和作品目录。',
  loadingTitle: '正在加载艺术家',
  loadingBody: '艺术家详情、热门歌曲和发行信息即将显示在这里。',
  unavailableTitle: '艺术家不可用',
  notFoundTitle: '未找到艺术家',
  notFoundBody: '当前音乐库快照中已无法找到所选艺术家。',
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
  noAlbumsBody: '当艺术家目录包含专辑元数据后，这里会显示发行作品。',
};

export const playlistDetailCopy = {
  renamePrompt: '重命名播放列表',
  selectTitle: '选择一个播放列表',
  selectBody: '从音乐库中选择播放列表后，即可查看、播放和管理其中的曲目。',
  loadingTitle: '正在加载播放列表',
  loadingBody: '曲目信息和播放列表操作即将显示在这里。',
  unavailableTitle: '播放列表不可用',
  notFoundTitle: '未找到播放列表',
  notFoundBody: '当前音乐库快照中已无法找到所选播放列表。',
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
